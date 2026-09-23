import 'server-only';
import {
  CheckMissionQuality,
  CreateDailyMission,
  GenerateDailyMissionBrief,
  GenerateMissionContent,
  ListContentPillars,
  ListDailyMissions,
  ListSocialAccountStrategies,
  ListSocialProfiles,
  ListActiveTrendIdeas,
  ListWeeklyPlans,
  type MissionContent,
} from '@bunshin/capability-social';
import {
  GetBunshin,
  ListGrantedKnowledgeForBunshin,
  ListPersonalityVersions,
  RequireActiveBunshinCapability,
  SelectBunshinMemories,
  ProductPackService,
  CampaignService,
  GroupFeatureEntitlementService,
  GroupKnowledgeService,
  selectGroupKnowledgeChunksForPrompt,
} from '@bunshin/application';
import { createLogger } from '@bunshin/observability';
import { ApplicationError } from '@bunshin/shared';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import { OpenAIDailyMissionPlanner } from '../providers/openai-daily-mission-planner';
import { OpenAIMissionContentGenerator } from '../providers/openai-mission-content-generator';
import { OpenAIMissionQualityChecker } from '../providers/openai-mission-quality-checker';
import { loadServiceGenerationKnowledge } from './service-generation-knowledge';
import { applyServiceContentTerminology } from './service-content-terminology';
import {
  buildMissionPersonalizationContext,
  personalizationSourceTypes,
} from './daily-mission-personalization';
import {
  inspectDailyMissionContent,
  recentMissionQualityContext,
} from './daily-mission-content-quality';
import { generateQualityCheckedMissionContent } from './daily-mission-quality-pipeline';
import {
  finalizeDailyMissionContent,
  recordDailyMissionCampaignSafety,
} from './daily-mission-content-finalization';

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

const errorCategory = (error: unknown) => {
  if (error instanceof ApplicationError) {
    const cause = error.cause;
    if (cause && typeof cause === 'object' && 'category' in cause) {
      const category = (cause as { category?: unknown }).category;
      if (typeof category === 'string') return category;
    }
    return error.code;
  }
  return 'INTERNAL_ERROR';
};

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
      const productPack = input.serviceSafeMode
        ? null
        : await new ProductPackService(new db.PrismaProductPackRepository()).resolveForGeneration(
            scope,
          );
      const profiles = await new ListSocialProfiles(new db.PrismaSocialProfileRepository()).execute(
        scope,
      );
      const profile = input.socialProfileId
        ? profiles.find(({ id, status }) => id === input.socialProfileId && status === 'ACTIVE')
        : profiles.find(({ status }) => status === 'ACTIVE');
      if (!profile) throw new ApplicationError('NOT_FOUND', 'active social profile not found');
      const strategies = await new ListSocialAccountStrategies(
        new db.PrismaSocialAccountStrategyRepository(),
      ).execute({ ...scope, socialProfileId: profile.id });
      const strategy = strategies.find(({ status }) => status === 'APPROVED');
      if (!strategy) throw new ApplicationError('CONFLICT', 'approved strategy is required');
      // Trend candidates are always scoped to the current workspace, Bunshin and social profile.
      // They are public-source based, so service mode can use the participant's own candidates
      // without exposing personal memories or another service's data.
      const trendIdeas = await new ListActiveTrendIdeas(
        new db.PrismaTrendResearchRepository(),
      ).execute({
        ...scope,
        socialProfileId: profile.id,
        at: new Date(),
      });
      const weeklyPlans = await new ListWeeklyPlans(new db.PrismaWeeklyPlanRepository()).execute(
        scope,
      );
      const weeklyPlan = weeklyPlans.find(
        ({ status, items }) =>
          status === 'CONFIRMED' &&
          items.some(({ scheduledDate }) => scheduledDate === input.missionDate),
      );
      if (!weeklyPlan)
        throw new ApplicationError('NOT_FOUND', 'confirmed weekly plan item not found for date');
      const weeklyItem = weeklyPlan.items.find(
        ({ scheduledDate }) => scheduledDate === input.missionDate,
      )!;
      const campaign = weeklyItem.campaignId
        ? await new CampaignService(new db.PrismaCampaignRepository()).resolvePlanningContext({
            ...scope,
            campaignId: weeklyItem.campaignId,
            at: new Date(`${input.missionDate}T12:00:00.000Z`),
          })
        : null;
      if (campaign && input.serviceSafeMode && campaign.productPack.groupId !== input.groupId)
        throw new ApplicationError('NOT_FOUND', 'service campaign unavailable');
      if (campaign) {
        const entitlements = new GroupFeatureEntitlementService(
          new db.PrismaGroupFeatureEntitlementRepository(),
        );
        for (const requiredFeature of ['SOCIAL', 'GROUP.CAMPAIGN', 'GROUP.PRODUCT_PACK']) {
          const access = await entitlements.consumeAccess({
            workspaceId: input.workspaceId,
            groupId: campaign.productPack.groupId,
            actorUserId: input.actorUserId,
            featureKey: requiredFeature,
            operationKey: `${input.generationIdempotencyKey}:${requiredFeature}`,
            localDate: input.missionDate,
          });
          if (!access.allowed)
            throw new ApplicationError('FORBIDDEN', 'group feature is not available', {
              featureKey: requiredFeature,
              reason: access.reason,
            });
        }
      }
      const pillars = await new ListContentPillars(new db.PrismaContentPillarRepository()).execute(
        scope,
      );
      const bunshin = await new GetBunshin(new db.PrismaBunshinRepository()).execute(scope);
      const personalityVersions = input.serviceSafeMode
        ? []
        : await new ListPersonalityVersions(new db.PrismaPersonalityVersionRepository()).execute(
            scope,
          );
      const currentPersonality = personalityVersions[0] ?? null;
      const serviceKnowledge =
        input.serviceSafeMode && input.groupId
          ? await loadServiceGenerationKnowledge({
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              actorUserId: input.actorUserId,
              bunshinId: input.bunshinId,
            })
          : null;
      const granted = input.serviceSafeMode
        ? []
        : await new ListGrantedKnowledgeForBunshin(new db.PrismaKnowledgeGrantRepository()).execute(
            scope,
          );
      const memoryRepository =
        input.serviceSafeMode && input.allowServiceOwnerMemories
          ? new db.PrismaOwnerBunshinMemoryRepository()
          : new db.PrismaBunshinMemoryRepository();
      const ownerMemories =
        input.serviceSafeMode && !input.allowServiceOwnerMemories
          ? []
          : await memoryRepository.list(scope);
      const personalMaterials = ownerMemories
        .filter(
          (memory) =>
            memory.active &&
            memory.deletedAt === null &&
            memory.sourceType === 'USER_INPUT' &&
            memory.sourceId?.startsWith('daily-action:'),
        )
        .slice(0, 3)
        .map((memory) => ({
          type: 'PERSONAL_MATERIAL',
          title: memory.summary?.trim() || '本人が残した素材',
          content: memory.content,
        }));
      const generations = new db.PrismaDailyMissionGenerationRepository();
      const claim = await generations.claim({
        ...scope,
        missionDate: input.missionDate,
        idempotencyKey: input.generationIdempotencyKey,
      });
      if (!claim.acquired)
        throw new ApplicationError('CONFLICT', 'daily mission generation is in progress');
      generationId = claim.record.id;
      const { apiKey, model } = await resolveOpenAiRuntimeConfiguration();
      runtimeModel = model;
      let timezone = input.timezone;
      if (!timezone) {
        const preference = await new db.PrismaLineNotificationPreferenceRepository().getScoped(
          scope,
        );
        if (!preference.accessible)
          throw new ApplicationError('NOT_FOUND', 'notification preference scope not found');
        timezone = preference.preference?.timezone ?? 'Asia/Tokyo';
      }
      const bunshinContext = {
        name: bunshin.name,
        objectiveSummary: bunshin.objectiveSummary,
        audienceSummary: bunshin.audienceSummary,
        personalitySummary: bunshin.personalitySummary,
        personality: currentPersonality
          ? {
              versionId: currentPersonality.id,
              version: currentPersonality.version,
              tone: currentPersonality.tone,
              formality: currentPersonality.formality,
              energyLevel: currentPersonality.energyLevel,
              expertiseLevel: currentPersonality.expertiseLevel,
              sentenceStyle: currentPersonality.sentenceStyle,
              firstPerson: currentPersonality.firstPerson,
              forbiddenExpressions: currentPersonality.forbiddenExpressions,
              preferredExpressions: currentPersonality.preferredExpressions,
              visualDirection: currentPersonality.visualDirection,
              facePolicy: currentPersonality.facePolicy,
            }
          : null,
      };
      const strategyContext = {
        concept: strategy.concept,
        positioning: strategy.positioning,
        targetSummary: strategy.targetSummary,
        ctaStrategy: strategy.ctaStrategy,
        postingPolicy: strategy.postingPolicy,
      };
      const plannerPersonalization = buildMissionPersonalizationContext({
        bunshin: bunshinContext,
        socialProfile: profile,
        strategy,
        businessProfile: serviceKnowledge?.businessProfile ?? null,
        onboardingContext: serviceKnowledge?.personalization.onboardingContext ?? null,
        behaviorSummary: serviceKnowledge?.personalization.behaviorSummary ?? null,
        feedbackSummary: serviceKnowledge?.personalization.feedbackSummary ?? null,
        performanceSummary: serviceKnowledge?.personalization.performanceSummary ?? null,
      });
      const knowledge = [
        ...(serviceKnowledge?.officialKnowledge ??
          granted.map(({ type, title, content }) => ({ type, title, content }))),
        ...personalMaterials,
      ];
      const groupKnowledge = campaign
        ? selectGroupKnowledgeChunksForPrompt(
            await new GroupKnowledgeService(
              new db.PrismaGroupKnowledgeRepository(),
            ).listApprovedChunksForGeneration({
              ...scope,
              groupId: campaign.productPack.groupId,
              productPackVersionId: campaign.productPack.versionId,
            }),
          ).map((chunk) => ({
            chunkId: chunk.id,
            sourceId: chunk.sourceId,
            type: chunk.type,
            sourceLabel: chunk.sourceLabel,
            content: chunk.content.trim(),
          }))
        : serviceKnowledge
          ? serviceKnowledge.groupKnowledge
          : [];
      const usage = async (
        suffix: string,
        taskType: string,
        result: {
          model: string;
          promptVersion: string;
          inputTokens: number | null;
          outputTokens: number | null;
          latencyMs: number;
        },
      ) =>
        recordAiUsageSafely({
          ...scope,
          taskType,
          provider: 'openai',
          model: result.model,
          promptVersion: result.promptVersion,
          status: 'SUCCESS',
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          idempotencyKey: `${input.usageIdempotencyPrefix}:${suffix}`,
        });
      const generateWithQuota = <T>(suffix: string, generate: () => Promise<T>) =>
        withOrganizationAiGenerationQuota({
          workspaceId: input.workspaceId,
          ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
          operationKey: `${input.usageIdempotencyPrefix}:${suffix}`,
          generate,
        });
      stage = 'daily-brief';
      const brief = await generateWithQuota('daily-brief', () =>
        new GenerateDailyMissionBrief(new OpenAIDailyMissionPlanner({ apiKey, model })).execute({
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
        }),
      );
      await usage('daily-brief', 'DAILY_MISSION_PLANNER', brief);
      const pillarId = weeklyPlan.items.find(
        ({ id }) => id === brief.output.weeklyPlanItemId,
      )?.contentPillarId;
      const pillar = pillars.find(({ id }) => id === pillarId);
      if (!pillar) throw new ApplicationError('NOT_FOUND', 'active content pillar not found');
      const relevantMemories =
        input.serviceSafeMode && !input.allowServiceOwnerMemories
          ? []
          : await new SelectBunshinMemories(memoryRepository).execute({
              ...scope,
              query: [
                brief.output.topic,
                brief.output.angle,
                brief.output.reason,
                pillar.title,
                pillar.description ?? '',
                strategy.targetSummary,
              ].join('\n'),
              maxItems: 5,
              maxCharacters: 3000,
            });
      const selectedMemories =
        relevantMemories.length > 0
          ? relevantMemories
          : ownerMemories
              .filter(
                (memory) =>
                  memory.active &&
                  memory.deletedAt === null &&
                  memory.sourceType === 'USER_INPUT' &&
                  memory.sourceId?.startsWith('daily-action:'),
              )
              .slice(0, 1)
              .map((memory) => ({
                id: memory.id,
                type: memory.type,
                summary: memory.summary?.trim() || memory.content.slice(0, 200),
                content: memory.content,
                selectionReason: '本人がDaily Actionで残した最近の素材',
              }));
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
      const generator = new GenerateMissionContent(
        new OpenAIMissionContentGenerator({
          apiKey,
          model,
        }),
      );
      const contentInput = {
        platform: profile.platform,
        brief: brief.output,
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
      const applyTerminology = <
        T extends { output: Parameters<typeof applyServiceContentTerminology>[0] },
      >(
        value: T,
      ) => ({
        ...value,
        output: applyServiceContentTerminology(
          value.output,
          serviceKnowledge?.contentTerminologyPolicy ?? null,
        ),
      });
      const checker = new CheckMissionQuality(
        new OpenAIMissionQualityChecker({
          apiKey,
          model,
        }),
      );
      const qualityInput = (generatedContent: MissionContent) => ({
        platform: profile.platform,
        brief: brief.output,
        content: generatedContent,
        bunshin: bunshinContext,
        approvedStrategy: strategyContext,
        businessProfile: serviceKnowledge?.businessProfile ?? null,
        selectedMemories,
        groupKnowledge,
        recentContent: recentMissionQualityContext(recentMissions),
        personalization,
      });
      const { content, quality, repairCount, qualityIssueCodes } =
        await generateQualityCheckedMissionContent({
          generator,
          checker,
          contentInput,
          qualityInput,
          recentMissions,
          generateWithQuota,
          recordUsage: usage,
          applyTerminology,
          setStage: (value) => {
            stage = value;
          },
        });
      const {
        content: missionContent,
        externalLinkUsage,
        campaignSafetyReceipt,
      } = await finalizeDailyMissionContent({
        scope,
        missionDate: input.missionDate,
        generationIdempotencyKey: input.generationIdempotencyKey,
        campaign,
        platform: profile.platform,
        format: brief.output.format,
        classification: weeklyItem.classification,
        content: content.output,
        terminologyPolicy: serviceKnowledge?.contentTerminologyPolicy ?? null,
        recentMissions,
      });
      stage = 'persist';
      const created = await new CreateDailyMission(missions, assignments).execute({
        ...scope,
        ...brief.output,
        assistanceLevel: serviceKnowledge?.contentAssistanceLevel ?? profile.defaultAssistanceLevel,
        content: missionContent,
        qualityScore: quality.output.score,
        campaignId: weeklyItem.campaignId,
        classification: weeklyItem.classification,
        generationContext: {
          generatedAt: new Date(),
          payload: {
            personality: currentPersonality
              ? { id: currentPersonality.id, version: currentPersonality.version }
              : null,
            selectedMemories: selectedMemories.map(({ id, summary, selectionReason }) => ({
              id,
              summary,
              selectionReason,
            })),
            knowledge: granted.map(({ id }) => ({ id })),
            groupKnowledge: groupKnowledge.map(({ chunkId }) => ({ id: chunkId })),
            socialProfile: { id: profile.id },
            strategy: { id: strategy.id, version: strategy.version },
            weeklyPlan: { id: weeklyPlan.id },
            contentPillar: { id: pillar.id },
            productPack: campaign
              ? { id: campaign.productPack.versionId, version: campaign.productPack.version }
              : productPack
                ? { id: productPack.versionId, version: productPack.version }
                : null,
            campaign: campaign ? { id: campaign.id } : null,
            classification: weeklyItem.classification,
            trendCandidates: brief.output.trendCandidateId
              ? [{ id: brief.output.trendCandidateId }]
              : [],
            promptVersion: content.promptVersion,
            provider: 'openai',
            model: content.model,
            quality: {
              verdict: 'PASS',
              issueCodes: qualityIssueCodes,
              repairCount,
            },
            personalization: {
              mode: 'AI',
              sourceTypes: brief.output.personalizationSourceTypes ?? [],
              availableSourceTypes: personalizationSourceTypes(personalization),
              onboardingResponse: serviceKnowledge?.personalization.references.onboardingResponseId
                ? { id: serviceKnowledge.personalization.references.onboardingResponseId }
                : null,
              businessProfile: serviceKnowledge?.personalization.references.businessProfileId
                ? { id: serviceKnowledge.personalization.references.businessProfileId }
                : null,
              weeklyPlanItem: { id: weeklyItem.id },
              recentMissions: recentMissions.map(({ id }) => ({ id })),
              recentActivities: (
                serviceKnowledge?.personalization.references.recentActivityIds ?? []
              ).map((id) => ({ id })),
              recentVariants: (
                serviceKnowledge?.personalization.references.recentVariantSelectionIds ?? []
              ).map((id) => ({ id })),
              recentFeedback: (
                serviceKnowledge?.personalization.references.recentFeedbackIds ?? []
              ).map((id) => ({ id })),
              recentDecisions: (
                serviceKnowledge?.personalization.references.recentDecisionIds ?? []
              ).map((id) => ({ id })),
              postRecords: (
                serviceKnowledge?.personalization.references.recentPostRecordIds ?? []
              ).map((id) => ({ id })),
              socialInsights: (
                serviceKnowledge?.personalization.references.recentSocialInsightIds ?? []
              ).map((id) => ({ id })),
            },
          },
        },
        ...(externalLinkUsage ? { externalLinkUsage } : {}),
      });
      await recordDailyMissionCampaignSafety({
        scope,
        dailyMissionId: created.id,
        receipt: campaignSafetyReceipt,
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
      });
      if (generationId) {
        await recordAiUsageSafely({
          ...scope,
          taskType: 'DAILY_MISSION_PIPELINE',
          provider: 'openai',
          model: runtimeModel,
          promptVersion: 'daily-mission-pipeline-v1',
          status: 'FAILED',
          inputTokens: null,
          outputTokens: null,
          latencyMs: Date.now() - started,
          errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
          idempotencyKey: `${input.usageIdempotencyPrefix}:daily-pipeline-failure`,
        });
        try {
          const generations = new db.PrismaDailyMissionGenerationRepository();
          await generations.fail({
            ...scope,
            id: generationId,
            errorCategory: errorCategory(error),
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
