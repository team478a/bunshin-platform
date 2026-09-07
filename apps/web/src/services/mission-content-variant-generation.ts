import 'server-only';
import {
  AdvertisingSafetyService,
  CampaignSafetyValidationService,
  CampaignService,
  GetBunshin,
  GetGenerationContextSnapshot,
  GroupKnowledgeService,
  ListBunshinMemories,
  ListGrantedKnowledgeForBunshin,
  ListPersonalityVersions,
  RequireActiveBunshinCapability,
  selectGroupKnowledgeChunksForPrompt,
  simhashSimilarityBasisPoints,
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
  ListMissionContentVariants,
  ListSocialAccountStrategies,
  ListSocialProfiles,
  ListWeeklyPlans,
  normalizeMissionContent,
  type MissionContent,
  type MissionContentGeneratorInput,
  type SocialPreferredFormat,
} from '@bunshin/capability-social';
import { createLogger } from '@bunshin/observability';
import { ApplicationError } from '@bunshin/shared';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import { OpenAIMissionContentGenerator } from '../providers/openai-mission-content-generator';
import { OpenAIMissionQualityChecker } from '../providers/openai-mission-quality-checker';
import { campaignContentSignature } from './campaign-content-signature';
import { loadServiceGenerationKnowledge } from './service-generation-knowledge';

interface Input {
  workspaceId: string;
  groupId?: string | null;
  bunshinId: string;
  actorUserId: string;
  dailyMissionId: string;
  generationIdempotencyKey: string;
  usageIdempotencyPrefix: string;
  serviceSafeMode?: boolean;
  variantInstructions?: string[];
}

const VARIANT_SIMILARITY_THRESHOLD_BASIS_POINTS = 8_500;
const URL_PATTERN = /https?:\/\/[^\s]+/gu;

export function missionContentSimilarityBasisPoints(left: unknown, right: unknown) {
  return simhashSimilarityBasisPoints(
    campaignContentSignature(left).simhash,
    campaignContentSignature(right).simhash,
  );
}

function assertDifferentFromSource(source: MissionContent, candidate: MissionContent) {
  const similarity = missionContentSimilarityBasisPoints(source, candidate);
  if (similarity >= VARIANT_SIMILARITY_THRESHOLD_BASIS_POINTS) {
    throw new ApplicationError('CONTENT_REJECTED', 'generated variant is too similar to source', {
      similarityBasisPoints: similarity,
      thresholdBasisPoints: VARIANT_SIMILARITY_THRESHOLD_BASIS_POINTS,
    });
  }
}

function stripUrls(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(URL_PATTERN, '').trim();
  if (Array.isArray(value)) return value.map(stripUrls);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripUrls(item)]));
  return value;
}

export function preserveAuthorizedMissionLink(input: {
  source: MissionContent;
  candidate: MissionContent;
  insertedUrl: string;
  platform: string;
}) {
  const target = ['body', 'caption', 'description'].find((key) => {
    const value = input.source[key];
    return typeof value === 'string' && value.includes(input.insertedUrl);
  });
  if (!target)
    throw new ApplicationError('CONTENT_REJECTED', 'authorized link placement is unavailable');
  const sanitized = stripUrls(input.candidate) as MissionContent;
  const current = sanitized[target];
  if (typeof current !== 'string' || !current.trim())
    throw new ApplicationError('CONTENT_REJECTED', 'authorized link target is unavailable');
  const value = `${current.trim()}\n\n${input.insertedUrl}`;
  const maximum =
    target === 'caption'
      ? 2_200
      : target === 'description'
        ? 5_000
        : input.platform === 'X'
          ? 280
          : input.platform === 'THREADS'
            ? 500
            : 10_000;
  if (value.length > maximum)
    throw new ApplicationError('CONTENT_REJECTED', 'tracking URL exceeds platform limit');
  return { ...sanitized, [target]: value };
}

export function prepareMissionVariantContent(input: {
  format: SocialPreferredFormat;
  source: MissionContent;
  candidate: MissionContent;
  platform: string;
  insertedUrl?: string | null;
}) {
  const candidateWithoutUrls = normalizeMissionContent(input.format, stripUrls(input.candidate));
  return normalizeMissionContent(
    input.format,
    input.insertedUrl
      ? preserveAuthorizedMissionLink({
          source: input.source,
          candidate: candidateWithoutUrls,
          insertedUrl: input.insertedUrl,
          platform: input.platform,
        })
      : candidateWithoutUrls,
  );
}

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
          input.serviceSafeMode
            ? Promise.resolve([])
            : new ListBunshinMemories(new db.PrismaBunshinMemoryRepository()).execute(scope),
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
        const serviceKnowledge = await loadServiceGenerationKnowledge({
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          actorUserId: input.actorUserId,
        });
        groupKnowledge = serviceKnowledge.groupKnowledge.filter(({ chunkId }) =>
          snapshotGroupKnowledgeIds.has(chunkId),
        );
        const allowedLabels = new Set(groupKnowledge.map(({ sourceLabel }) => sourceLabel));
        knowledge = serviceKnowledge.officialKnowledge.filter(
          ({ type, title }) =>
            type === 'SERVICE_BUSINESS_PROFILE' ||
            type === 'SERVICE_INDUSTRY_SAFETY' ||
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
        groupKnowledge,
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
      assertDifferentFromSource(mission.content, candidate);
      if (campaign) {
        const signature = campaignContentSignature(candidate);
        const similarity = await new CampaignSafetyValidationService(
          new db.PrismaCampaignSafetyRepository(),
        ).inspect({ ...scope, campaignId: campaign.id, ...signature });
        if (similarity.verdict === 'POSSIBLE_DUPLICATE')
          throw new ApplicationError('CONTENT_REJECTED', 'campaign variant is too similar', {
            similarityBasisPoints: similarity.maxSimilarityBasisPoints,
          });
        const safety = await new AdvertisingSafetyService(
          new db.PrismaAdvertisingSafetyRepository(),
        ).inspect({
          ...scope,
          productPackVersionId: campaign.productPack.versionId,
          classification: mission.classification,
          evidenceRequirement: 'NONE',
          evidenceIds: [],
          officialClaims: campaign.productPack.facts,
          content: JSON.stringify(candidate),
        });
        if (safety.inspected.verdict !== 'PASS')
          throw new ApplicationError('CONTENT_REJECTED', 'campaign variant failed safety gate', {
            issueCodes: safety.inspected.issueCodes,
          });
      }
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
