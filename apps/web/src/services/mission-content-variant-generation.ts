import 'server-only';
import { GetGenerationContextSnapshot, RequireActiveBunshinCapability } from '@bunshin/application';
import {
  AuthorizeDailyMissionCopy,
  ClaimMissionContentVariantGeneration,
  CompleteMissionContentVariantGeneration,
  FailMissionContentVariantGeneration,
  GetDailyMission,
  ListDailyMissions,
  ListMissionContentVariants,
} from '@bunshin/capability-social';
import { createLogger } from '@bunshin/observability';
import { ApplicationError } from '@bunshin/shared';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { DailyActionStorage } from '../daily-actions/daily-action-storage';
import {
  createMissionContentVariantUsageState,
  generateMissionContentVariantWithAi,
} from './mission-content-variant-ai-runtime';
import { loadMissionContentVariantContext } from './mission-content-variant-context';
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

interface PhotoFirstInput extends Input {
  photoActionId: string;
  sourceVariantId?: string;
  photoConfirmation?: { question: string; answer: string };
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
    return (await this.executeInternal(input)).variant;
  }

  async executePhotoFirst(input: PhotoFirstInput) {
    return this.executeInternal(input);
  }

  private async executeInternal(input: Input | PhotoFirstInput) {
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
    const usageState = createMissionContentVariantUsageState();
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
        ...('sourceVariantId' in input && input.sourceVariantId
          ? { sourceVariantId: input.sourceVariantId }
          : {}),
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
          return { variant: completed, photoFirst: completed.photoFirst };
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
      let photoFirstSource:
        | {
            bytes: Uint8Array;
            mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
            sourceNote: string;
          }
        | undefined;
      if ('photoActionId' in input) {
        const photo = await db.prisma.bunshinMemory.findFirst({
          where: {
            id: input.photoActionId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            sourceType: 'USER_INPUT',
            sourceId: { startsWith: 'daily-action:PHOTO:' },
            attachmentStatus: 'READY',
            active: true,
            deletedAt: null,
            bunshin: {
              ownerUserId: input.actorUserId,
              ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
            },
          },
          select: { content: true, attachmentStorageKey: true },
        });
        if (!photo?.attachmentStorageKey)
          throw new ApplicationError('NOT_FOUND', '写真が見つかりません');
        const prepared = await new DailyActionStorage().readForVision(photo.attachmentStorageKey);
        photoFirstSource = { ...prepared, sourceNote: photo.content };
      }
      const { content, quality, photoFirst } = await generateMissionContentVariantWithAi({
        scope,
        mission,
        recentMissions,
        context,
        usageIdempotencyPrefix: input.usageIdempotencyPrefix,
        ...(input.variantInstructions === undefined
          ? {}
          : { variantInstructions: input.variantInstructions }),
        ...(photoFirstSource ? { photoFirst: photoFirstSource } : {}),
        ...('photoConfirmation' in input && input.photoConfirmation
          ? { photoFirstConfirmation: input.photoConfirmation }
          : {}),
        usageState,
      });

      const candidate = prepareMissionVariantContent({
        format: mission.format,
        source: mission.content,
        candidate: content.output,
        platform: context.profile.platform,
        ...(mission.linkUsage ? { insertedUrl: mission.linkUsage.insertedUrl } : {}),
      });
      await validateMissionContentVariant({
        scope,
        source: mission.content,
        candidate,
        recentMissions,
        campaign: context.campaign
          ? {
              context: context.campaign,
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
        inputTokens: usageState.hasInputTokens ? usageState.totalInputTokens : null,
        outputTokens: usageState.hasOutputTokens ? usageState.totalOutputTokens : null,
        estimatedCostMicros:
          usageState.requestCount && usageState.estimatedCostMicros
            ? BigInt(usageState.estimatedCostMicros)
            : null,
        latencyMs: Date.now() - started,
        ...('sourceVariantId' in input && input.sourceVariantId
          ? { sourceVariantId: input.sourceVariantId }
          : {}),
        ...('photoActionId' in input && photoFirst
          ? {
              photoFirst: {
                photoMemoryId: input.photoActionId,
                analysis: photoFirst.analysis,
                planning: {
                  ...photoFirst.planning,
                  ...(input.photoConfirmation && input.sourceVariantId
                    ? {
                        confirmationAnswer: input.photoConfirmation.answer,
                        confirmationSourceVariantId: input.sourceVariantId,
                      }
                    : {}),
                },
                analyzerModel: photoFirst.model,
                analyzerPromptVersion: photoFirst.promptVersion,
              },
            }
          : {}),
      });
      return { variant, photoFirst: variant.photoFirst };
    } catch (error) {
      if (generationId) {
        await recordAiUsageSafely({
          ...scope,
          taskType: 'MISSION_CONTENT_VARIANT_PIPELINE',
          provider: 'openai',
          model: usageState.runtimeModel,
          promptVersion: usageState.promptVersion ?? 'mission-content-variant-pipeline-v1',
          status: 'FAILED',
          inputTokens: usageState.hasInputTokens ? usageState.totalInputTokens : null,
          outputTokens: usageState.hasOutputTokens ? usageState.totalOutputTokens : null,
          latencyMs: Date.now() - started,
          estimatedCostUsdMicros: usageState.estimatedCostMicros || null,
          pricingVersion: usageState.estimatedCostMicros ? 'admin-request-cost-v1' : null,
          errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
          idempotencyKey: `${input.usageIdempotencyPrefix}:variant-pipeline-failure`,
        });
        try {
          await new FailMissionContentVariantGeneration(variants).execute({
            ...scope,
            dailyMissionId: input.dailyMissionId,
            generationId,
            errorCategory: errorCategory(error),
            model: usageState.runtimeModel,
            ...(usageState.promptVersion ? { promptVersion: usageState.promptVersion } : {}),
            inputTokens: usageState.hasInputTokens ? usageState.totalInputTokens : null,
            outputTokens: usageState.hasOutputTokens ? usageState.totalOutputTokens : null,
            estimatedCostMicros: usageState.estimatedCostMicros
              ? BigInt(usageState.estimatedCostMicros)
              : null,
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
