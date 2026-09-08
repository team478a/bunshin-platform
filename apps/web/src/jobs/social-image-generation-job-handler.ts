import 'server-only';
import {
  ClaimSocialImageGenerationExecution,
  GetBadgeEntitlementUsageByResource,
  GetPointRedemptionByResource,
  GroupFeatureEntitlementService,
  RefundPointRedemption,
  RefundBadgeEntitlementUsage,
  SocialImageGenerationJobHandlerError,
  getSocialImageTemplateDefinition,
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
import { reserveServiceMediaGeneration } from '../service-media-generation-quota';

const promptFor = (
  layout: {
    templateKey: string;
    headline: string;
    bodyLines: string[];
  },
  hasReference: boolean,
) =>
  layout.templateKey === 'EDITORIAL_COVER'
    ? [
        'Create one premium editorial lifestyle photograph for a Japanese social-media carousel cover.',
        'Show one original Japanese adult professional in a warm, softly lit home or work setting, framed from the waist or chest up, with a natural approachable expression and realistic hands and skin texture.',
        'Use warm cream, soft coral and muted lavender styling with coherent commercial photography lighting. Keep the person clearly separated from a simple background.',
        'This is a photo asset for a separate deterministic layout. Do not render text, letters, numbers, logos, watermarks, interface elements, cards, icons, borders or decorative typography.',
        hasReference
          ? 'Use the supplied consented photograph as the subject reference and preserve the person or product appearance. Do not change product labeling or invent product claims.'
          : 'Create an original person. Do not imitate a real person or celebrity.',
        `Communication theme only: ${layout.headline}.`,
        `Supporting concepts only: ${layout.bodyLines.join(', ')}.`,
      ].join(' ')
    : [
        'Create one polished vertical social-media background image.',
        hasReference
          ? 'Do not add captions, watermarks, interface elements or new logos. Preserve existing product labeling.'
          : 'Do not render letters, words, logos, watermarks, UI, signs, or captions.',
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
      const badgeEntitlements = new db.PrismaBadgeEntitlementConsumptionRepository(db.prisma);
      const badgeUsage = await new GetBadgeEntitlementUsageByResource(badgeEntitlements).execute({
        workspaceId: context.workspaceId,
        userId: context.ownerUserId,
        resourceType: 'SOCIAL_IMAGE_REQUEST',
        resourceId: context.requestId,
      });
      const pointPayment = redemption?.status === 'CONFIRMED';
      const badgePayment = badgeUsage?.status === 'CONSUMED';
      const serviceCreditPayment = Boolean(
        await db.prisma.serviceCreditLedger.findFirst({
          where: {
            workspaceId: context.workspaceId,
            groupId: context.groupId,
            userId: context.ownerUserId,
            type: 'CONSUME',
            sourceId: context.requestId,
            account: {
              workspaceId: context.workspaceId,
              groupId: context.groupId,
              userId: context.ownerUserId,
            },
          },
          select: { id: true },
        }),
      );
      const legacyPaymentCount = [pointPayment, badgePayment, serviceCreditPayment].filter(
        Boolean,
      ).length;
      const serviceMediaReservation = legacyPaymentCount
        ? ({ status: 'NOT_CONFIGURED', id: null } as const)
        : await reserveServiceMediaGeneration({
            workspaceId: context.workspaceId,
            groupId: context.groupId,
            kind: 'IMAGE',
            operationKey: context.idempotencyKey,
          });
      if (serviceMediaReservation.status === 'EXHAUSTED')
        throw new SocialImageGenerationJobHandlerError('SOCIAL_IMAGE_SERVICE_LIMIT_REACHED', false);
      if (serviceMediaReservation.status === 'ALREADY_CONSUMED')
        throw new SocialImageGenerationJobHandlerError(
          'SOCIAL_IMAGE_SERVICE_USAGE_CONFLICT',
          false,
        );
      const planPayment = ['RESERVED', 'ALREADY_RESERVED'].includes(serviceMediaReservation.status);
      const paymentCount = legacyPaymentCount + Number(planPayment);
      if (paymentCount !== 1)
        throw new SocialImageGenerationJobHandlerError(
          paymentCount > 1
            ? 'SOCIAL_IMAGE_MULTIPLE_PAYMENTS_FOUND'
            : 'SOCIAL_IMAGE_PAYMENT_UNAVAILABLE',
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
      const assetQuality =
        context.layout.templateKey === 'EDITORIAL_COVER' ? 'high' : context.quality;
      const usageKey = `social-image:${context.requestId}:attempt:${input.attemptCount}`;
      try {
        const referenceImage = context.referenceImage
          ? await new SupabaseSocialImageStorage().readReference({
              ...context,
              sha256: context.referenceImage.sha256,
            })
          : undefined;
        const generated = await provider.generate({
          requestId: context.requestId,
          prompt: promptFor(context.layout, Boolean(context.referenceImage)),
          ...(referenceImage ? { referenceImage } : {}),
          width: 1080,
          height: 1350,
          model: context.model,
          quality: assetQuality,
        });
        await recordAiUsageSafely({
          workspaceId: context.workspaceId,
          bunshinId: context.bunshinId,
          actorUserId: context.ownerUserId,
          taskType: 'SOCIAL_IMAGE_GENERATION',
          provider: generated.provider,
          model: generated.model,
          promptVersion: context.referenceImage
            ? 'social-image-reference-v2'
            : 'social-image-asset-v2',
          status: 'SUCCESS',
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
          latencyMs: generated.latencyMs,
          estimatedCostUsdMicros: runtime.requestCostUsdMicros,
          pricingVersion: 'ADMIN_FIXED_REQUEST_COST',
          idempotencyKey: usageKey,
        });
        const renderer = new ManagedSocialImageRenderer(await loadBundledSocialImageFonts());
        const { carouselPages, ...coverLayout } = context.layout;
        const layouts = [coverLayout, ...(carouselPages ?? [])];
        const renderedPages = await Promise.all(
          layouts.map((layout) =>
            renderer.render({
              layout,
              sourceAsset:
                getSocialImageTemplateDefinition(layout.templateKey).assetPlacement === 'NONE'
                  ? null
                  : Buffer.from(generated.bytes),
            }),
          ),
        );
        if (!(await repository.moveToComposing(input)))
          throw new SocialImageGenerationJobHandlerError('SOCIAL_IMAGE_STATE_CONFLICT', false);
        const storage = new SupabaseSocialImageStorage();
        const storedPages: Array<{
          mediaId: string;
          pageIndex: number;
          sourceStorageKey: string | null;
          completedStorageKey: string;
          thumbnailStorageKey: string;
          contentHash: string;
        }> = [];
        try {
          for (const [pageIndex, rendered] of renderedPages.entries()) {
            const mediaId = randomUUID();
            const stored = await storage.store({
              workspaceId: context.workspaceId,
              groupId: context.groupId,
              ownerUserId: context.ownerUserId,
              requestId: context.requestId,
              mediaId,
              source: pageIndex === 0 ? { bytes: generated.bytes, mimeType: 'image/png' } : null,
              completed: rendered.completedPng,
              thumbnail: rendered.thumbnailPng,
            });
            storedPages.push({ mediaId, pageIndex, ...stored });
          }
        } catch (error) {
          await Promise.allSettled(
            storedPages.map((page) =>
              storage.remove({
                workspaceId: context.workspaceId,
                groupId: context.groupId,
                ownerUserId: context.ownerUserId,
                requestId: context.requestId,
                mediaId: page.mediaId,
                ...(page.pageIndex === 0 ? { sourceMimeType: 'image/png' as const } : {}),
              }),
            ),
          );
          throw error;
        }
        const completed = await repository.complete({
          context,
          media: storedPages,
          serviceMediaReservationId: planPayment ? serviceMediaReservation.id : null,
        });
        if (!completed) {
          await Promise.allSettled(
            storedPages.map((page) =>
              storage.remove({
                workspaceId: context.workspaceId,
                groupId: context.groupId,
                ownerUserId: context.ownerUserId,
                requestId: context.requestId,
                mediaId: page.mediaId,
                ...(page.pageIndex === 0 ? { sourceMimeType: 'image/png' as const } : {}),
              }),
            ),
          );
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
            promptVersion: context.referenceImage
              ? 'social-image-reference-v2'
              : 'social-image-asset-v2',
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
      const badgeEntitlements = new db.PrismaBadgeEntitlementConsumptionRepository(db.prisma);
      const badgeUsage = await badgeEntitlements.findByResource({
        workspaceId: input.workspaceId,
        userId: failed.ownerUserId,
        resourceType: 'SOCIAL_IMAGE_REQUEST',
        resourceId: input.requestId,
      });
      if (badgeUsage?.status === 'CONSUMED')
        await new RefundBadgeEntitlementUsage(badgeEntitlements).execute({
          workspaceId: input.workspaceId,
          userId: failed.ownerUserId,
          usageId: badgeUsage.id,
          reason: input.errorCode,
        });
    },
  };
}
