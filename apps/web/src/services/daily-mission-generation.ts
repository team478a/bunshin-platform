import 'server-only';
import {
  ListDailyMissions,
  type DailyMissionPlannerInput,
  type MissionContent,
} from '@bunshin/capability-social';
import { RequireActiveBunshinCapability } from '@bunshin/application';
import { createLogger } from '@bunshin/observability';
import { ApplicationError } from '@bunshin/shared';
import {
  buildDailyMissionPersonalizationBase,
  buildMissionPersonalizationContext,
  selectDailyMissionMemories,
} from './daily-mission-personalization';
import {
  inspectDailyMissionContent,
  recentMissionQualityContext,
} from './daily-mission-content-quality';
import { finalizeDailyMissionContent } from './daily-mission-content-finalization';
import { loadDailyMissionPlanningContext } from './daily-mission-planning-context';
import {
  createDailyMissionAiRuntime,
  dailyMissionErrorCategory,
  dailyMissionProviderFailureDetails,
  recordDailyMissionPipelineFailure,
} from './daily-mission-ai-runtime';
import { runDailyMissionContentGeneration } from './daily-mission-content-runtime';
import { runDailyMissionBriefGeneration } from './daily-mission-brief-runtime';
import { prepareDailyMissionDecisionPlannerInput } from './daily-mission-decision-context';
import { loadDailyMissionGenerationEnvironment } from './daily-mission-generation-environment';
import { persistDailyMissionGenerationResult } from './daily-mission-result-persistence';
import { runDailyMissionDecisionContentOrchestration } from './daily-mission-decision-content-orchestration';
import { runDailyMissionRebriefGeneration } from './daily-mission-rebrief-runtime';

interface Input {
  workspaceId: string;
  groupId?: string | null;
  bunshinId: string;
  actorUserId: string;
  missionDate: string;
  timezone?: string;
  socialProfileId?: string;
  generationIdempotencyKey: string;
  usageIdempotencyPrefix: string;
  existingPolicy: 'RETURN' | 'CONFLICT';
  serviceSafeMode?: boolean;
  allowServiceOwnerMemories?: boolean;
}

const daysBefore = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
};

export class DailyMissionGenerationService {
  async execute(input: Input) {
    const started = Date.now();
    let runtimeModel = process.env['OPENAI_MODEL'] ?? 'gpt-5.2';
    const logger = createLogger().child({
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      operation: 'daily-mission-generation',
    });
    const scope = {
      workspaceId: input.workspaceId,
      ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
      bunshinId: input.bunshinId,
      actorUserId: input.actorUserId,
    };
    const db = await import('@bunshin/database');
    const assignments = new db.PrismaBunshinCapabilityAssignmentRepository();
    const missions = new db.PrismaDailyMissionRepository();
    let generationId: string | null = null;
    let stage = 'preflight';
    try {
      await new RequireActiveBunshinCapability(assignments).execute({
        ...scope,
        capabilityType: 'SOCIAL',
      });
      const existing = (
        await new ListDailyMissions(missions).execute({
          ...scope,
          from: input.missionDate,
          to: input.missionDate,
        })
      ).find(({ missionDate }) => missionDate === input.missionDate);
      const recentMissions = await new ListDailyMissions(missions).execute({
        ...scope,
        from: daysBefore(input.missionDate, 28),
        to: daysBefore(input.missionDate, 1),
      });
      if (existing) {
        if (input.existingPolicy === 'RETURN') {
          if (existing.content) {
            const issue = inspectDailyMissionContent({
              content: existing.content,
              recentMissions,
            });
            if (issue)
              throw new ApplicationError(
                'CONTENT_REJECTED',
                'existing daily mission is not safe to deliver as a new post',
                { ...issue, existingDailyMissionId: existing.id },
              );
          }
          return existing;
        }
        throw new ApplicationError('CONFLICT', 'daily mission already exists');
      }
      const recentFormats = recentMissions.map(({ format }) => format);
      const planningContext = await loadDailyMissionPlanningContext({
        scope,
        missionDate: input.missionDate,
        ...(input.socialProfileId ? { socialProfileId: input.socialProfileId } : {}),
        serviceSafeMode: input.serviceSafeMode ?? false,
        allowServiceOwnerMemories: input.allowServiceOwnerMemories ?? false,
        generationIdempotencyKey: input.generationIdempotencyKey,
      });
      const {
        profile,
        strategy,
        trendIdeas,
        weeklyPlan,
        weeklyItem,
        campaign,
        pillars,
        bunshin,
        currentPersonality,
        serviceKnowledge,
        granted,
        memoryRepository,
        ownerMemories,
        personalMaterials,
      } = planningContext;
      const generations = new db.PrismaDailyMissionGenerationRepository();
      const claim = await generations.claim({
        ...scope,
        missionDate: input.missionDate,
        idempotencyKey: input.generationIdempotencyKey,
      });
      if (!claim.acquired)
        throw new ApplicationError('CONFLICT', 'daily mission generation is in progress');
      generationId = claim.record.id;
      const { apiKey, model, recordUsage, generateWithQuota } = await createDailyMissionAiRuntime({
        scope,
        usageIdempotencyPrefix: input.usageIdempotencyPrefix,
      });
      runtimeModel = model;
      const { bunshinContext, strategyContext, plannerPersonalization, knowledge } =
        buildDailyMissionPersonalizationBase({
          bunshin,
          personality: currentPersonality,
          socialProfile: profile,
          strategy,
          history: {
            businessProfile: serviceKnowledge?.businessProfile ?? null,
            onboardingContext: serviceKnowledge?.personalization.onboardingContext ?? null,
            behaviorSummary: serviceKnowledge?.personalization.behaviorSummary ?? null,
            feedbackSummary: serviceKnowledge?.personalization.feedbackSummary ?? null,
            performanceSummary: serviceKnowledge?.personalization.performanceSummary ?? null,
          },
          officialKnowledge: serviceKnowledge?.officialKnowledge ?? null,
          grantedKnowledge: granted.map(({ type, title, content }) => ({
            type,
            title,
            content,
          })),
          personalMaterials,
        });
      const { timezone, groupKnowledge } = await loadDailyMissionGenerationEnvironment({
        scope,
        ...(input.timezone ? { timezone: input.timezone } : {}),
        campaign,
        fallbackGroupKnowledge: serviceKnowledge?.groupKnowledge ?? [],
      });
      const plannerInput: DailyMissionPlannerInput = {
        ...scope,
        missionDate: input.missionDate,
        timezone,
        socialProfile: profile,
        facePolicy: bunshin.personality?.facePolicy ?? 'FULL_ANONYMOUS',
        recentFormats,
        recentTopics: recentMissions.map(({ missionDate, topic, angle }) => ({
          missionDate,
          topic,
          angle,
        })),
        bunshin: bunshinContext,
        approvedStrategy: strategy,
        weeklyPlan,
        contentPillars: pillars,
        grantedKnowledge: knowledge,
        businessProfile: serviceKnowledge?.businessProfile ?? null,
        trendIdeas,
        campaign,
        personalization: plannerPersonalization,
      };
      stage = 'daily-decision-context';
      const decisionPreparation = prepareDailyMissionDecisionPlannerInput({
        scope,
        plannerInput,
        source: serviceKnowledge?.decisionContext ?? null,
      });
      stage = 'daily-brief';
      const brief = await runDailyMissionBriefGeneration({
        apiKey,
        model,
        generateWithQuota,
        recordUsage,
        plannerInput: decisionPreparation.plannerInput,
      });
      const pillarId = weeklyPlan.items.find(
        ({ id }) => id === brief.output.weeklyPlanItemId,
      )?.contentPillarId;
      const pillar = pillars.find(({ id }) => id === pillarId);
      if (!pillar) throw new ApplicationError('NOT_FOUND', 'active content pillar not found');
      const generation = await runDailyMissionDecisionContentOrchestration({
        initialBrief: brief,
        decisionBoundary: decisionPreparation.context ? decisionPreparation.boundary : null,
        prepareContent: async (currentBrief) => {
          const selectedMemories = await selectDailyMissionMemories({
            scope,
            serviceSafeMode: input.serviceSafeMode ?? false,
            allowServiceOwnerMemories: input.allowServiceOwnerMemories ?? false,
            memoryRepository,
            ownerMemories,
            brief: currentBrief.output,
            pillar,
            strategyTargetSummary: strategy.targetSummary,
          });
          const personalization = buildMissionPersonalizationContext({
            bunshin: bunshinContext,
            socialProfile: profile,
            strategy,
            businessProfile: serviceKnowledge?.businessProfile ?? null,
            onboardingContext: serviceKnowledge?.personalization.onboardingContext ?? null,
            behaviorSummary: serviceKnowledge?.personalization.behaviorSummary ?? null,
            feedbackSummary: serviceKnowledge?.personalization.feedbackSummary ?? null,
            performanceSummary: serviceKnowledge?.personalization.performanceSummary ?? null,
            selectedMemories,
          });
          const contentInput = {
            platform: profile.platform,
            brief: currentBrief.output,
            bunshin: bunshinContext,
            approvedStrategy: strategyContext,
            contentPillar: { title: pillar.title, description: pillar.description },
            grantedKnowledge: knowledge,
            businessProfile: serviceKnowledge?.businessProfile ?? null,
            groupKnowledge,
            selectedMemories,
            campaign,
            personalization,
          };
          const qualityInput = (generatedContent: MissionContent) => ({
            platform: profile.platform,
            brief: currentBrief.output,
            content: generatedContent,
            bunshin: bunshinContext,
            approvedStrategy: strategyContext,
            businessProfile: serviceKnowledge?.businessProfile ?? null,
            selectedMemories,
            groupKnowledge,
            recentContent: recentMissionQualityContext(recentMissions),
            personalization,
          });
          return { selectedMemories, personalization, contentInput, qualityInput };
        },
        generateContent: (contentPreparation, attempt) =>
          runDailyMissionContentGeneration({
            apiKey,
            model,
            contentInput: contentPreparation.contentInput,
            qualityInput: contentPreparation.qualityInput,
            recentMissions,
            generateWithQuota,
            recordUsage,
            terminologyPolicy: serviceKnowledge?.contentTerminologyPolicy ?? null,
            decisionRepairPolicy: decisionPreparation.context
              ? 'REQUIRE_REBRIEF'
              : 'ALLOW_CONTENT_REPAIR',
            decisionStage: attempt.decisionStage,
            rebriefAttemptsUsed: attempt.rebriefAttemptsUsed,
            ...(attempt.operationPrefix ? { operationPrefix: attempt.operationPrefix } : {}),
            setStage: (value) => {
              stage = value;
            },
          }),
        reviseBrief: ({ initialBrief, disposition, boundary }) =>
          runDailyMissionRebriefGeneration({
            apiKey,
            model,
            initialBrief,
            strategyVersion: strategy.version,
            boundary,
            disposition,
            generateWithQuota,
            recordUsage,
            setStage: (value) => {
              stage = value;
            },
          }),
      });
      const {
        brief: finalBrief,
        prepared: contentPreparation,
        contentResult,
        revision,
      } = generation;
      const { content } = contentResult;
      const finalizedContent = await finalizeDailyMissionContent({
        scope,
        missionDate: input.missionDate,
        generationIdempotencyKey: input.generationIdempotencyKey,
        campaign,
        platform: profile.platform,
        format: finalBrief.output.format,
        classification: weeklyItem.classification,
        content: content.output,
        terminologyPolicy: serviceKnowledge?.contentTerminologyPolicy ?? null,
        recentMissions,
      });
      stage = 'persist';
      const created = await persistDailyMissionGenerationResult({
        missions,
        assignments,
        scope,
        planning: planningContext,
        brief: finalBrief,
        pillar,
        selectedMemories: contentPreparation.selectedMemories,
        personalization: contentPreparation.personalization,
        decisionContext: decisionPreparation.context,
        decisionRevision: revision,
        recentMissionIds: recentMissions.map(({ id }) => id),
        contentResult,
        finalizedContent: {
          ...finalizedContent,
          groupKnowledgeIds: groupKnowledge.map(({ chunkId }) => chunkId),
        },
      });
      try {
        await generations.complete({ ...scope, id: claim.record.id, dailyMissionId: created.id });
      } catch {
        logger.error('daily mission generation observation update failed', {
          errorCode: 'OBSERVATION_UPDATE_FAILED',
        });
      }
      return created;
    } catch (error) {
      logger.warn('daily mission generation pipeline failed', {
        stage,
        errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
        ...dailyMissionProviderFailureDetails(error),
      });
      if (generationId) {
        await recordDailyMissionPipelineFailure({
          scope,
          usageIdempotencyPrefix: input.usageIdempotencyPrefix,
          model: runtimeModel,
          startedAt: started,
          error,
        });
        try {
          const generations = new db.PrismaDailyMissionGenerationRepository();
          await generations.fail({
            ...scope,
            id: generationId,
            errorCategory: dailyMissionErrorCategory(error),
          });
        } catch {
          logger.error('daily mission generation failure state update failed', {
            errorCode: 'OBSERVATION_UPDATE_FAILED',
          });
        }
      }
      throw error;
    }
  }
}

export const createDailyMissionGenerationService = () => new DailyMissionGenerationService();
