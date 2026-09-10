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
import { resolveSocialImageExecutionPayment } from '../social-image-payment';

export const socialImagePagePrompt = (
  layout: {
    templateKey: string;
    headline: string;
    bodyLines: string[];
    visualScene?: string | null | undefined;
  },
  hasReference: boolean,
  pageIndex: number,
  pageCount: number,
) =>
  [
    `Create page ${pageIndex + 1} of ${pageCount} for one premium Japanese social-media carousel.`,
    'Create a realistic editorial lifestyle photograph with commercial-quality lighting, natural hands and skin texture, and a clear subject.',
    'Use a coherent warm cream, soft coral and muted lavender art direction across the carousel.',
    'This photograph will be placed inside a separate deterministic Japanese text layout. Do not render text, letters, numbers, logos, watermarks, interface elements, cards, icons, borders or decorative typography.',
    'Leave useful uncluttered negative space and keep important faces, hands, products and tools away from the outer edges.',
    hasReference
      ? 'Use the supplied image only as the identity and style reference. Preserve the person or product appearance, but create the new action, camera angle, props and background requested for this page. Do not copy the reference pose or composition. Do not change product labeling or invent product claims.'
      : 'Create an original Japanese adult appropriate for the subject. Do not imitate a real person or celebrity.',
    layout.visualScene
      ? `Required scene, action and composition: ${layout.visualScene}.`
      : `Create a concrete scene that directly explains: ${layout.headline}.`,
    `Communication theme only: ${layout.headline}.`,
    `Supporting concepts only: ${layout.bodyLines.join(', ')}.`,
    pageIndex > 0
      ? 'This page must visibly differ from the cover and the other pages in action, camera angle, props and background while keeping the same referenced subject or visual identity and art direction.'
      : 'Make this an inviting cover scene that immediately establishes the topic.',
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
      const pilotPayment = context.pilotEnrollmentId !== null;
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
      const paymentBeforePlan = resolveSocialImageExecutionPayment({
        pilotPayment,
        pointPayment,
        badgePayment,
        serviceCreditPayment,
        planPayment: false,
      });
      const serviceMediaReservation = !paymentBeforePlan.shouldReserveServiceMedia
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
      const payment = resolveSocialImageExecutionPayment({
        pilotPayment,
        pointPayment,
        badgePayment,
        serviceCreditPayment,
        planPayment,
      });
      if (payment.errorCode)
        throw new SocialImageGenerationJobHandlerError(payment.errorCode, false);
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
        const referenceImage = context.referenceImage
          ? await new SupabaseSocialImageStorage().readReference({
              ...context,
              sha256: context.referenceImage.sha256,
            })
          : undefined;
        const { carouselPages, ...coverLayout } = context.layout;
        const layouts = [coverLayout, ...(carouselPages ?? [])];
        const generatePage = async (
          layout: (typeof layouts)[number],
          pageIndex: number,
          pageReference: Uint8Array | undefined,
        ) => {
          const pageUsageKey = `${usageKey}:page:${pageIndex + 1}`;
          try {
            const generated = await provider.generate({
              requestId: `${context.requestId}:page:${pageIndex + 1}`,
              prompt: socialImagePagePrompt(
                layout,
                Boolean(pageReference),
                pageIndex,
                layouts.length,
              ),
              ...(pageReference ? { referenceImage: pageReference } : {}),
              width: 1080,
              height: 1350,
              model: context.model,
              quality: pageIndex === 0 ? 'high' : context.quality,
            });
            await recordAiUsageSafely({
              workspaceId: context.workspaceId,
              bunshinId: context.bunshinId,
              actorUserId: context.ownerUserId,
              taskType: 'SOCIAL_IMAGE_GENERATION',
              provider: generated.provider,
              model: generated.model,
              promptVersion: pageReference
                ? 'social-image-carousel-reference-v3'
                : 'social-image-carousel-asset-v3',
              status: 'SUCCESS',
              inputTokens: generated.inputTokens,
              outputTokens: generated.outputTokens,
              latencyMs: generated.latencyMs,
              estimatedCostUsdMicros: runtime.requestCostUsdMicros,
              pricingVersion: 'ADMIN_FIXED_REQUEST_COST_PER_PAGE',
              idempotencyKey: pageUsageKey,
            });
            return generated;
          } catch (error) {
            if (error instanceof OpenAiSocialImageProviderError)
              await recordAiUsageSafely({
                workspaceId: context.workspaceId,
                bunshinId: context.bunshinId,
                actorUserId: context.ownerUserId,
                taskType: 'SOCIAL_IMAGE_GENERATION',
                provider: 'OPENAI',
                model: context.model,
                promptVersion: pageReference
                  ? 'social-image-carousel-reference-v3'
                  : 'social-image-carousel-asset-v3',
                status: 'FAILED',
                inputTokens: null,
                outputTokens: null,
                latencyMs: 0,
                estimatedCostUsdMicros: null,
                pricingVersion: null,
                errorCode: error.category,
                idempotencyKey: pageUsageKey,
              });
            throw error;
          }
        };
        const coverAsset = await generatePage(coverLayout, 0, referenceImage);
        const identityReference = referenceImage ?? coverAsset.bytes;
        const remainingAssets = await Promise.all(
          layouts
            .slice(1)
            .map((layout, index) => generatePage(layout, index + 1, identityReference)),
        );
        const generatedPages = [coverAsset, ...remainingAssets];
        const renderer = new ManagedSocialImageRenderer(await loadBundledSocialImageFonts());
        const renderedPages = await Promise.all(
          layouts.map((layout, pageIndex) =>
            renderer.render({
              layout,
              sourceAsset:
                getSocialImageTemplateDefinition(layout.templateKey).assetPlacement === 'NONE'
                  ? null
                  : Buffer.from(generatedPages[pageIndex]!.bytes),
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
              source: { bytes: generatedPages[pageIndex]!.bytes, mimeType: 'image/png' },
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
                sourceMimeType: 'image/png' as const,
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
                sourceMimeType: 'image/png' as const,
              }),
            ),
          );
          throw new SocialImageGenerationJobHandlerError('SOCIAL_IMAGE_STATE_CONFLICT', false);
        }
      } catch (error) {
        if (error instanceof OpenAiSocialImageProviderError) {
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
