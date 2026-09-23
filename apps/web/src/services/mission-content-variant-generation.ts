import 'server-only';
import {
  CampaignService,
  GetBunshin,
  GetGenerationContextSnapshot,
  GroupKnowledgeService,
  ListBunshinMemories,
  ListGrantedKnowledgeForBunshin,
  ListPersonalityVersions,
  RequireActiveBunshinCapability,
  selectGroupKnowledgeChunksForPrompt,
  type SelectedBunshinMemory,
} from '@bunshin/application';
import {
  AuthorizeDailyMissionCopy,
  CheckMissionQuality,
  ClaimMissionContentVariantGeneration,
  CompleteMissionContentVariantGeneration,
  FailMissionContentVariantGeneration,
  GenerateMissionContent,
  GetDailyMission,
  ListContentPillars,
  ListDailyMissions,
  ListMissionContentVariants,
  ListSocialAccountStrategies,
  ListSocialProfiles,
  ListWeeklyPlans,
  type MissionContentGeneratorInput,
} from '@bunshin/capability-social';
import { createLogger } from '@bunshin/observability';
import { ApplicationError } from '@bunshin/shared';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import { OpenAIMissionContentGenerator } from '../providers/openai-mission-content-generator';
import { OpenAIMissionQualityChecker } from '../providers/openai-mission-quality-checker';
import { recentMissionQualityContext } from './daily-mission-content-quality';
import { loadServiceGenerationKnowledge } from './service-generation-knowledge';
import {
  applyServiceContentTerminology,
  type ServiceContentTerminologyPolicy,
} from './service-content-terminology';
import {
  prepareMissionVariantContent,
  validateMissionContentVariant,
} from './mission-content-variant-validation';

interface Input {
  workspaceId: string;
  groupId?: string | null;
  bunshinId: string;
  actorUserId: string;
  dailyMissionId: string;
  generationIdempotencyKey: string;
  usageIdempotencyPrefix: string;
  serviceSafeMode?: boolean;
  allowServiceOwnerMemories?: boolean;
  variantInstructions?: string[];
}

const daysBefore = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
};

function errorCategory(error: unknown) {
  if (error instanceof ApplicationError) {
    const cause = error.cause;
    if (cause && typeof cause === 'object' && 'category' in cause) {
      const category = (cause as { category?: unknown }).category;
      if (typeof category === 'string') return category;
    }
    return error.code;
  }
  return 'INTERNAL_ERROR';
}

const requireSnapshotValue = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new ApplicationError('CONFLICT', message);
  return value;
};

export class MissionContentVariantGenerationService {
  async execute(input: Input) {
    const started = Date.now();
    const scope = {
      workspaceId: input.workspaceId,
      ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
      bunshinId: input.bunshinId,
      actorUserId: input.actorUserId,
    };
    const logger = createLogger().child({
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      dailyMissionId: input.dailyMissionId,
      operation: 'mission-content-variant-generation',
    });
    const db = await import('@bunshin/database');
    const missions = new db.PrismaDailyMissionRepository();
    const variants = new db.PrismaMissionContentVariantRepository();
    let generationId: string | null = null;
    let runtimeModel = process.env['OPENAI_MODEL'] ?? 'gpt-5.2';
    let promptVersion: string | undefined;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let hasInputTokens = false;
    let hasOutputTokens = false;
    let estimatedCostMicros = 0;
    try {
      await new RequireActiveBunshinCapability(
        new db.PrismaBunshinCapabilityAssignmentRepository(),
      ).execute({ ...scope, capabilityType: 'SOCIAL' });
      const mission = await new GetDailyMission(missions).execute({
        ...scope,
        dailyMissionId: input.dailyMissionId,
      });
      const recentMissions = await new ListDailyMissions(missions).execute({
        ...scope,
        from: daysBefore(mission.missionDate, 28),
        to: mission.missionDate,
      });
      const copyAuthorization = await new AuthorizeDailyMissionCopy(missions).execute({
        ...scope,
        dailyMissionId: mission.id,
      });
      if (!copyAuthorization.allowed)
        throw new ApplicationError('CONFLICT', 'mission content is not currently usable', {
          reason: copyAuthorization.reason,
          reviewNote: copyAuthorization.reviewNote ?? null,
        });
      const snapshot = await new GetGenerationContextSnapshot(
        new db.PrismaGenerationContextSnapshotRepository(),
      ).execute({ ...scope, dailyMissionId: mission.id });
      if (
        snapshot.payload.classification !== mission.classification ||
        (snapshot.payload.campaign?.id ?? null) !== mission.campaignId
      )
        throw new ApplicationError('CONFLICT', 'mission generation context no longer matches');

      const claim = await new ClaimMissionContentVariantGeneration(variants).execute({
        ...scope,
        dailyMissionId: mission.id,
        idempotencyKey: input.generationIdempotencyKey,
      });
      if (!claim.acquired) {
        if (claim.generation.status === 'SUCCEEDED' && claim.generation.variantId) {
          const existing = await new ListMissionContentVariants(variants).execute({
            ...scope,
            dailyMissionId: mission.id,
          });
          return requireSnapshotValue(
            existing.find(({ id }) => id === claim.generation.variantId),
            'completed mission variant is unavailable',
          );
        }
        throw new ApplicationError('CONFLICT', 'mission content variant generation already used');
      }
      generationId = claim.generation.id;

      const [bunshin, profiles, pillars, weeklyPlans, personalityVersions, granted, memories] =
        await Promise.all([
          new GetBunshin(new db.PrismaBunshinRepository()).execute(scope),
          new ListSocialProfiles(new db.PrismaSocialProfileRepository()).execute(scope),
          new ListContentPillars(new db.PrismaContentPillarRepository()).execute(scope),
          new ListWeeklyPlans(new db.PrismaWeeklyPlanRepository()).execute(scope),
          input.serviceSafeMode
            ? Promise.resolve([])
            : new ListPersonalityVersions(new db.PrismaPersonalityVersionRepository()).execute(
                scope,
              ),
          input.serviceSafeMode
            ? Promise.resolve([])
            : new ListGrantedKnowledgeForBunshin(new db.PrismaKnowledgeGrantRepository()).execute(
                scope,
              ),
          input.serviceSafeMode && !input.allowServiceOwnerMemories
            ? Promise.resolve([])
            : new ListBunshinMemories(
                input.serviceSafeMode
                  ? new db.PrismaOwnerBunshinMemoryRepository()
                  : new db.PrismaBunshinMemoryRepository(),
              ).execute(scope),
        ]);
      const profile = requireSnapshotValue(
        profiles.find(
          ({ id, status }) => id === snapshot.payload.socialProfile.id && status === 'ACTIVE',
        ),
        'original social profile is unavailable',
      );
      const strategies = await new ListSocialAccountStrategies(
        new db.PrismaSocialAccountStrategyRepository(),
      ).execute({ ...scope, socialProfileId: profile.id });
      const strategy = requireSnapshotValue(
        strategies.find(
          ({ id, version, status }) =>
            id === snapshot.payload.strategy.id &&
            version === snapshot.payload.strategy.version &&
            status === 'APPROVED',
        ),
        'original approved strategy is unavailable',
      );
      requireSnapshotValue(
        weeklyPlans.find(
          ({ id, status }) => id === snapshot.payload.weeklyPlan.id && status === 'CONFIRMED',
        ),
        'original weekly plan is unavailable',
      );
      const pillar = requireSnapshotValue(
        pillars.find(
          ({ id, active, deletedAt }) =>
            id === snapshot.payload.contentPillar.id && active && deletedAt === null,
        ),
        'original content pillar is unavailable',
      );
      const personality = snapshot.payload.personality
        ? requireSnapshotValue(
            personalityVersions.find(
              ({ id, version }) =>
                id === snapshot.payload.personality?.id &&
                version === snapshot.payload.personality.version,
            ),
            'original personality version is unavailable',
          )
        : null;
      const snapshotKnowledgeIds = new Set(snapshot.payload.knowledge.map(({ id }) => id));
      const exactKnowledge = granted.filter(({ id }) => snapshotKnowledgeIds.has(id));
      if (exactKnowledge.length !== snapshotKnowledgeIds.size)
        throw new ApplicationError('CONFLICT', 'original granted knowledge is unavailable');
      const snapshotMemoryById = new Map(
        snapshot.payload.selectedMemories.map((item) => [item.id, item]),
      );
      const selectedMemories: SelectedBunshinMemory[] = memories
        .filter(
          ({ id, active, deletedAt }) => snapshotMemoryById.has(id) && active && deletedAt === null,
        )
        .map((memory) => {
          const reference = snapshotMemoryById.get(memory.id)!;
          return {
            id: memory.id,
            type: memory.type,
            summary: reference.summary,
            content: memory.content,
            selectionReason: reference.selectionReason,
          };
        });
      if (selectedMemories.length !== snapshotMemoryById.size)
        throw new ApplicationError('CONFLICT', 'original selected memory is unavailable');

      const campaign = mission.campaignId
        ? await new CampaignService(new db.PrismaCampaignRepository()).resolvePlanningContext({
            ...scope,
            campaignId: mission.campaignId,
          })
        : null;
      if (
        campaign &&
        (snapshot.payload.productPack?.id !== campaign.productPack.versionId ||
          snapshot.payload.productPack.version !== campaign.productPack.version)
      )
        throw new ApplicationError('CONFLICT', 'original product pack version is unavailable');
      const snapshotGroupKnowledgeIds = new Set(
        (snapshot.payload.groupKnowledge ?? []).map(({ id }) => id),
      );
      let groupKnowledge: NonNullable<MissionContentGeneratorInput['groupKnowledge']> = [];
      let knowledge: MissionContentGeneratorInput['grantedKnowledge'] = exactKnowledge.map(
        ({ type, title, content }) => ({ type, title, content }),
      );
      let businessProfile: MissionContentGeneratorInput['businessProfile'] = null;
      const currentServiceKnowledge =
        input.serviceSafeMode && input.groupId
          ? await loadServiceGenerationKnowledge({
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              actorUserId: input.actorUserId,
            })
          : null;
      const contentTerminologyPolicy: ServiceContentTerminologyPolicy | null =
        currentServiceKnowledge?.contentTerminologyPolicy ?? null;
      if (campaign) {
        const chunks = await new GroupKnowledgeService(
          new db.PrismaGroupKnowledgeRepository(),
        ).listApprovedChunksForGeneration({
          ...scope,
          groupId: campaign.productPack.groupId,
          productPackVersionId: campaign.productPack.versionId,
        });
        groupKnowledge = selectGroupKnowledgeChunksForPrompt(chunks)
          .filter(({ id }) => snapshotGroupKnowledgeIds.has(id))
          .map((chunk) => ({
            chunkId: chunk.id,
            sourceId: chunk.sourceId,
            type: chunk.type,
            sourceLabel: chunk.sourceLabel,
            content: chunk.content.trim(),
          }));
      } else if (input.serviceSafeMode && input.groupId) {
        const serviceKnowledge = currentServiceKnowledge!;
        businessProfile = serviceKnowledge.businessProfile;
        groupKnowledge = serviceKnowledge.groupKnowledge.filter(({ chunkId }) =>
          snapshotGroupKnowledgeIds.has(chunkId),
        );
        const allowedLabels = new Set(groupKnowledge.map(({ sourceLabel }) => sourceLabel));
        knowledge = serviceKnowledge.officialKnowledge.filter(
          ({ type, title }) =>
            type === 'SERVICE_BUSINESS_PROFILE' ||
            type === 'SERVICE_INDUSTRY_SAFETY' ||
            type === 'SERVICE_CONTENT_TERMINOLOGY' ||
            allowedLabels.has(title),
        );
      }
      if (groupKnowledge.length !== snapshotGroupKnowledgeIds.size)
        throw new ApplicationError('CONFLICT', 'original group knowledge is unavailable');

      const runtime = await resolveOpenAiRuntimeConfiguration();
      runtimeModel = runtime.model;
      let requestCount = 0;
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
      ) => {
        promptVersion = result.promptVersion;
        if (result.inputTokens !== null) {
          hasInputTokens = true;
          totalInputTokens += result.inputTokens;
        }
        if (result.outputTokens !== null) {
          hasOutputTokens = true;
          totalOutputTokens += result.outputTokens;
        }
        estimatedCostMicros += runtime.requestCostUsdMicros;
        requestCount += 1;
        await recordAiUsageSafely({
          ...scope,
          taskType,
          provider: 'openai',
          model: result.model,
          promptVersion: result.promptVersion,
          status: 'SUCCESS',
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          estimatedCostUsdMicros: runtime.requestCostUsdMicros || null,
          pricingVersion: runtime.requestCostUsdMicros ? 'admin-request-cost-v1' : null,
          idempotencyKey: `${input.usageIdempotencyPrefix}:${suffix}`,
        });
      };
      const generateWithQuota = <T>(suffix: string, generate: () => Promise<T>) =>
        withOrganizationAiGenerationQuota({
          workspaceId: input.workspaceId,
          ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
          operationKey: `${input.usageIdempotencyPrefix}:${suffix}`,
          generate,
        });
      const bunshinContext = {
        name: bunshin.name,
        objectiveSummary: bunshin.objectiveSummary,
        audienceSummary: bunshin.audienceSummary,
        personalitySummary: bunshin.personalitySummary,
        personality: personality
          ? {
              versionId: personality.id,
              version: personality.version,
              tone: personality.tone,
              formality: personality.formality,
              energyLevel: personality.energyLevel,
              expertiseLevel: personality.expertiseLevel,
              sentenceStyle: personality.sentenceStyle,
              firstPerson: personality.firstPerson,
              forbiddenExpressions: personality.forbiddenExpressions,
              preferredExpressions: personality.preferredExpressions,
              visualDirection: personality.visualDirection,
              facePolicy: personality.facePolicy,
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
      const brief = {
        missionDate: mission.missionDate,
        socialProfileId: profile.id,
        weeklyPlanItemId: mission.weeklyPlanItemId!,
        format: mission.format,
        topic: mission.topic,
        angle: mission.angle,
        reason: mission.reason,
        estimatedMinutes: mission.estimatedMinutes,
        campaignId: mission.campaignId,
        classification: mission.classification,
      };
      const contentInput = {
        platform: profile.platform,
        brief,
        bunshin: bunshinContext,
        approvedStrategy: strategyContext,
        contentPillar: { title: pillar.title, description: pillar.description },
        grantedKnowledge: knowledge,
        businessProfile,
        groupKnowledge,
        recentContent: recentMissionQualityContext(recentMissions),
        selectedMemories,
        campaign,
        variantSourceContent: mission.content,
        variantInstructions: [
          '原案と同じ目的、確認済み事実、CTA、開示、許可済みURLを維持する',
          '導入のフック、文章構成、具体例、言葉選びを明確に変える',
          '原案の表面的な言い換えにせず、同じユーザーが比較して選べる別案にする',
          ...(input.variantInstructions ?? []),
        ],
      };
      const generator = new GenerateMissionContent(
        new OpenAIMissionContentGenerator({ apiKey: runtime.apiKey, model: runtime.model }),
      );
      let content = await generateWithQuota('variant-content:0', () =>
        generator.execute(contentInput),
      );
      content = {
        ...content,
        output: applyServiceContentTerminology(content.output, contentTerminologyPolicy),
      };
      await usage('variant-content:0', 'MISSION_CONTENT_VARIANT', content);
      const checker = new CheckMissionQuality(
        new OpenAIMissionQualityChecker({ apiKey: runtime.apiKey, model: runtime.model }),
      );
      const qualityInput = () => ({
        platform: profile.platform,
        brief,
        content: content.output,
        bunshin: bunshinContext,
        approvedStrategy: strategyContext,
        businessProfile,
        selectedMemories,
        groupKnowledge,
      });
      let quality = await generateWithQuota('variant-quality:0', () =>
        checker.execute(qualityInput()),
      );
      await usage('variant-quality:0', 'QUALITY_CHECKER', quality);
      if (quality.output.verdict === 'REVISE') {
        content = await generateWithQuota('variant-content:1', () =>
          generator.execute({
            ...contentInput,
            repairInstructions: quality.output.issues.map(
              ({ repairInstruction }) => repairInstruction,
            ),
          }),
        );
        content = {
          ...content,
          output: applyServiceContentTerminology(content.output, contentTerminologyPolicy),
        };
        await usage('variant-content:1', 'MISSION_CONTENT_VARIANT_REPAIR', content);
        quality = await generateWithQuota('variant-quality:1', () =>
          checker.execute(qualityInput()),
        );
        await usage('variant-quality:1', 'QUALITY_CHECKER', quality);
      }
      if (quality.output.verdict !== 'PASS')
        throw new ApplicationError('CONTENT_REJECTED', 'generated variant failed quality check');

      const candidate = prepareMissionVariantContent({
        format: mission.format,
        source: mission.content,
        candidate: content.output,
        platform: profile.platform,
        ...(mission.linkUsage ? { insertedUrl: mission.linkUsage.insertedUrl } : {}),
      });
      await validateMissionContentVariant({
        scope,
        source: mission.content,
        candidate,
        recentMissions,
        campaign: campaign
          ? {
              context: campaign,
              classification: mission.classification,
              campaignSafetyRepository: new db.PrismaCampaignSafetyRepository(),
              advertisingSafetyRepository: new db.PrismaAdvertisingSafetyRepository(),
            }
          : null,
      });
      const variant = await new CompleteMissionContentVariantGeneration(variants).execute({
        ...scope,
        dailyMissionId: mission.id,
        generationId,
        format: mission.format,
        content: candidate,
        qualityScore: quality.output.score,
        model: content.model,
        promptVersion: content.promptVersion,
        inputTokens: hasInputTokens ? totalInputTokens : null,
        outputTokens: hasOutputTokens ? totalOutputTokens : null,
        estimatedCostMicros:
          requestCount && runtime.requestCostUsdMicros ? BigInt(estimatedCostMicros) : null,
        latencyMs: Date.now() - started,
      });
      return variant;
    } catch (error) {
      if (generationId) {
        await recordAiUsageSafely({
          ...scope,
          taskType: 'MISSION_CONTENT_VARIANT_PIPELINE',
          provider: 'openai',
          model: runtimeModel,
          promptVersion: promptVersion ?? 'mission-content-variant-pipeline-v1',
          status: 'FAILED',
          inputTokens: hasInputTokens ? totalInputTokens : null,
          outputTokens: hasOutputTokens ? totalOutputTokens : null,
          latencyMs: Date.now() - started,
          estimatedCostUsdMicros: estimatedCostMicros || null,
          pricingVersion: estimatedCostMicros ? 'admin-request-cost-v1' : null,
          errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
          idempotencyKey: `${input.usageIdempotencyPrefix}:variant-pipeline-failure`,
        });
        try {
          await new FailMissionContentVariantGeneration(variants).execute({
            ...scope,
            dailyMissionId: input.dailyMissionId,
            generationId,
            errorCategory: errorCategory(error),
            model: runtimeModel,
            ...(promptVersion ? { promptVersion } : {}),
            inputTokens: hasInputTokens ? totalInputTokens : null,
            outputTokens: hasOutputTokens ? totalOutputTokens : null,
            estimatedCostMicros: estimatedCostMicros ? BigInt(estimatedCostMicros) : null,
            latencyMs: Date.now() - started,
          });
        } catch (observationError) {
          logger.error('mission variant failure state update failed', {
            errorCode: 'OBSERVATION_UPDATE_FAILED',
            error: observationError,
          });
        }
      }
      throw error;
    }
  }
}

export const createMissionContentVariantGenerationService = () =>
  new MissionContentVariantGenerationService();
