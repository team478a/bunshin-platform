import 'server-only';
import { GetGenerationContextSnapshot, RequireActiveBunshinCapability } from '@bunshin/application';
import {
  AuthorizeDailyMissionCopy,
  CheckMissionQuality,
  ClaimMissionContentVariantGeneration,
  CompleteMissionContentVariantGeneration,
  FailMissionContentVariantGeneration,
  GenerateMissionContent,
  GetDailyMission,
  ListDailyMissions,
  ListMissionContentVariants,
} from '@bunshin/capability-social';
import { createLogger } from '@bunshin/observability';
import { ApplicationError } from '@bunshin/shared';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import { OpenAIMissionContentGenerator } from '../providers/openai-mission-content-generator';
import { OpenAIMissionQualityChecker } from '../providers/openai-mission-quality-checker';
import { recentMissionQualityContext } from './daily-mission-content-quality';
import { loadMissionContentVariantContext } from './mission-content-variant-context';
import { applyServiceContentTerminology } from './service-content-terminology';
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
          const completed = existing.find(({ id }) => id === claim.generation.variantId);
          if (!completed)
            throw new ApplicationError('CONFLICT', 'completed mission variant is unavailable');
          return completed;
        }
        throw new ApplicationError('CONFLICT', 'mission content variant generation already used');
      }
      generationId = claim.generation.id;

      const context = await loadMissionContentVariantContext({
        scope,
        mission,
        snapshot,
        ...(input.serviceSafeMode === undefined ? {} : { serviceSafeMode: input.serviceSafeMode }),
        ...(input.allowServiceOwnerMemories === undefined
          ? {}
          : { allowServiceOwnerMemories: input.allowServiceOwnerMemories }),
      });
      const {
        profile,
        campaign,
        selectedMemories,
        groupKnowledge,
        knowledge,
        businessProfile,
        contentTerminologyPolicy,
        bunshinContext,
        strategyContext,
        contentPillar,
      } = context;
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
        contentPillar,
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
