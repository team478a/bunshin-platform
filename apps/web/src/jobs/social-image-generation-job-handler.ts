import 'server-only';
import {
  ClaimSocialImageGenerationExecution,
  GetPointRedemptionByResource,
  GroupFeatureEntitlementService,
  RefundPointRedemption,
  SocialImageGenerationJobHandlerError,
  type SocialImageGenerationJobHandler,
} from '@bunshin/application';
import { randomUUID } from 'node:crypto';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import {
  OpenAiSocialImageGenerationAdapter,
  OpenAiSocialImageProviderError,
} from '../providers/openai-social-image-generation';
import { loadBundledSocialImageFonts, ManagedSocialImageRenderer } from '../social-image-renderer';
import { SupabaseSocialImageStorage } from '../social-image-storage';

const promptFor = (layout: { headline: string; bodyLines: string[] }) =>
  [
    'Create one polished vertical social-media background image.',
    'Do not render letters, words, logos, watermarks, UI, signs, or captions.',
    'Leave generous uncluttered negative space for Japanese text overlay.',
    `Visual theme: ${layout.headline}.`,
    `Supporting concepts: ${layout.bodyLines.join(', ')}.`,
  ].join(' ');

const tokyoLocalDate = (value: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);

export function createSocialImageGenerationJobHandler(): SocialImageGenerationJobHandler {
  return {
    async execute(input) {
      const db = await import('@bunshin/database');
      const repository = new db.PrismaSocialImageGenerationExecutionRepository();
      const context = await new ClaimSocialImageGenerationExecution(repository).execute(input);
      const redemption = await new GetPointRedemptionByResource(
        new db.PrismaPointRedemptionRepository(),
      )
        .execute({
          workspaceId: context.workspaceId,
          actorUserId: context.ownerUserId,
          resourceType: 'SOCIAL_IMAGE_REQUEST',
          resourceId: context.requestId,
        })
        .catch(() => null);
      if (redemption?.status !== 'CONFIRMED')
        throw new SocialImageGenerationJobHandlerError(
          'SOCIAL_IMAGE_POINT_REDEMPTION_UNAVAILABLE',
          false,
        );
      const now = new Date();
      const access = await new GroupFeatureEntitlementService(
        new db.PrismaGroupFeatureEntitlementRepository(),
      ).consumeAccess({
        workspaceId: context.workspaceId,
        groupId: context.groupId,
        actorUserId: context.ownerUserId,
        featureKey: 'SOCIAL.IMAGE_GENERATION',
        operationKey: `social-image:${context.requestId}`,
        localDate: tokyoLocalDate(now),
        now,
      });
      if (!access.allowed)
        throw new SocialImageGenerationJobHandlerError(`SOCIAL_IMAGE_${access.reason}`, false);
      const runtime = await resolveOpenAiRuntimeConfiguration();
      const provider = new OpenAiSocialImageGenerationAdapter({ apiKey: runtime.apiKey });
      const usageKey = `social-image:${context.requestId}:attempt:${input.attemptCount}`;
      try {
        const generated = await provider.generate({
          requestId: context.requestId,
          prompt: promptFor(context.layout),
          width: 1080,
          height: 1350,
          model: context.model,
          quality: context.quality,
        });
        await recordAiUsageSafely({
          workspaceId: context.workspaceId,
          bunshinId: context.bunshinId,
          actorUserId: context.ownerUserId,
          taskType: 'SOCIAL_IMAGE_GENERATION',
          provider: generated.provider,
          model: generated.model,
          promptVersion: 'social-image-asset-v1',
          status: 'SUCCESS',
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
          latencyMs: generated.latencyMs,
          estimatedCostUsdMicros: runtime.requestCostUsdMicros,
          pricingVersion: 'ADMIN_FIXED_REQUEST_COST',
          idempotencyKey: usageKey,
        });
        const rendered = await new ManagedSocialImageRenderer(
          await loadBundledSocialImageFonts(),
        ).render({ layout: context.layout, sourceAsset: Buffer.from(generated.bytes) });
        if (!(await repository.moveToComposing(input)))
          throw new SocialImageGenerationJobHandlerError('SOCIAL_IMAGE_STATE_CONFLICT', false);
        const mediaId = randomUUID();
        const storage = new SupabaseSocialImageStorage();
        const stored = await storage.store({
          workspaceId: context.workspaceId,
          groupId: context.groupId,
          ownerUserId: context.ownerUserId,
          requestId: context.requestId,
          mediaId,
          source: { bytes: generated.bytes, mimeType: 'image/png' },
          completed: rendered.completedPng,
          thumbnail: rendered.thumbnailPng,
        });
        const completed = await repository.complete({ context, mediaId, ...stored });
        if (!completed) {
          await storage.remove({
            workspaceId: context.workspaceId,
            groupId: context.groupId,
            ownerUserId: context.ownerUserId,
            requestId: context.requestId,
            mediaId,
            sourceMimeType: 'image/png',
          });
          throw new SocialImageGenerationJobHandlerError('SOCIAL_IMAGE_STATE_CONFLICT', false);
        }
      } catch (error) {
        if (error instanceof OpenAiSocialImageProviderError) {
          await recordAiUsageSafely({
            workspaceId: context.workspaceId,
            bunshinId: context.bunshinId,
            actorUserId: context.ownerUserId,
            taskType: 'SOCIAL_IMAGE_GENERATION',
            provider: 'OPENAI',
            model: context.model,
            promptVersion: 'social-image-asset-v1',
            status: 'FAILED',
            inputTokens: null,
            outputTokens: null,
            latencyMs: 0,
            estimatedCostUsdMicros: null,
            pricingVersion: null,
            errorCode: error.category,
            idempotencyKey: usageKey,
          });
          throw new SocialImageGenerationJobHandlerError(
            `OPENAI_${error.category}`,
            error.retryable,
          );
        }
        throw error;
      }
    },
    async markFailed(input) {
      const db = await import('@bunshin/database');
      const failed = await new db.PrismaSocialImageGenerationExecutionRepository().markFailed(
        input,
      );
      if (!failed) return;
      const redemptions = new db.PrismaPointRedemptionRepository();
      const redemption = await redemptions.findOwnedByResource({
        workspaceId: input.workspaceId,
        actorUserId: failed.ownerUserId,
        resourceType: 'SOCIAL_IMAGE_REQUEST',
        resourceId: input.requestId,
      });
      if (redemption?.status === 'CONFIRMED')
        await new RefundPointRedemption(redemptions).execute({
          workspaceId: input.workspaceId,
          actorUserId: failed.ownerUserId,
          redemptionId: redemption.id,
          reason: input.errorCode,
        });
    },
  };
}
