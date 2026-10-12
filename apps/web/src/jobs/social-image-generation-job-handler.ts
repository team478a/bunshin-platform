import 'server-only';
import {
  ClaimSocialImageGenerationExecution,
  SocialImageGenerationJobHandlerError,
  getSocialImageTemplateDefinition,
  type SocialImageGenerationJobHandler,
  type SocialImageQualityReportRecord,
} from '@bunshin/application';
import { randomUUID } from 'node:crypto';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import {
  OpenAiSocialImageGenerationAdapter,
  OpenAiSocialImageProviderError,
} from '../providers/openai-social-image-generation';
import {
  OpenAiSocialImageQualityReviewer,
  OpenAiSocialImageQualityReviewError,
  type SocialImageQualityReview,
} from '../providers/openai-social-image-quality-review';
import { queueDailyCarouselVideoAfterImage } from '../services/automatic-daily-video';
import { loadBundledSocialImageFonts, ManagedSocialImageRenderer } from '../social-image-renderer';
import { SupabaseSocialImageStorage } from '../social-image-storage';
import { authorizeSocialImageGeneration } from './social-image-generation-access';
import { markSocialImageGenerationFailed } from './social-image-generation-failure';
import { socialImagePagePrompt } from './social-image-page-prompt';
import { socialImagePagesToRetry } from './social-image-quality-gate';

export { socialImagePagePrompt } from './social-image-page-prompt';
export { socialImagePagesToRetry } from './social-image-quality-gate';

export function createSocialImageGenerationJobHandler(): SocialImageGenerationJobHandler {
  return {
    async execute(input) {
      const db = await import('@bunshin/database');
      const repository = new db.PrismaSocialImageGenerationExecutionRepository();
      const context = await new ClaimSocialImageGenerationExecution(repository).execute(input);
      const { serviceMediaReservation, planPayment } =
        await authorizeSocialImageGeneration(context);
      const runtime = await resolveOpenAiRuntimeConfiguration();
      const provider = new OpenAiSocialImageGenerationAdapter({ apiKey: runtime.apiKey });
      const qualityReviewer = new OpenAiSocialImageQualityReviewer({
        apiKey: runtime.apiKey,
        model: runtime.model,
      });
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
          repairInstruction?: string,
        ) => {
          const isQualityRetry = Boolean(repairInstruction);
          const pageUsageKey = `${usageKey}:page:${pageIndex + 1}${isQualityRetry ? ':quality-retry' : ''}`;
          try {
            const generated = await provider.generate({
              requestId: `${context.requestId}:page:${pageIndex + 1}${isQualityRetry ? ':quality-retry' : ''}`,
              prompt: [
                socialImagePagePrompt(
                  layout,
                  Boolean(pageReference),
                  pageIndex,
                  layouts.length,
                  layouts,
                ),
                repairInstruction
                  ? `The previous image failed quality review. Correct only these defects in the new image: ${repairInstruction}`
                  : '',
              ]
                .filter(Boolean)
                .join(' '),
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
                ? isQualityRetry
                  ? 'social-image-carousel-reference-quality-retry-v1'
                  : 'social-image-carousel-reference-v5'
                : isQualityRetry
                  ? 'social-image-carousel-asset-quality-retry-v1'
                  : 'social-image-carousel-asset-v5',
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
                  ? isQualityRetry
                    ? 'social-image-carousel-reference-quality-retry-v1'
                    : 'social-image-carousel-reference-v5'
                  : isQualityRetry
                    ? 'social-image-carousel-asset-quality-retry-v1'
                    : 'social-image-carousel-asset-v5',
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
        const reviewPages = async (round: 'initial' | 'final') => {
          const reviewUsageKey = `${usageKey}:quality-review:${round}`;
          try {
            const reviewed = await qualityReviewer.review({
              pages: layouts.map((layout, pageIndex) => ({
                pageIndex,
                headline: layout.headline,
                bodyLines: layout.bodyLines,
                ...(layout.visualScene !== undefined ? { visualScene: layout.visualScene } : {}),
                bytes: generatedPages[pageIndex]!.bytes,
              })),
            });
            await recordAiUsageSafely({
              workspaceId: context.workspaceId,
              bunshinId: context.bunshinId,
              actorUserId: context.ownerUserId,
              taskType: 'SOCIAL_IMAGE_GENERATION',
              provider: reviewed.provider,
              model: reviewed.model,
              promptVersion: reviewed.promptVersion,
              status: 'SUCCESS',
              inputTokens: reviewed.inputTokens,
              outputTokens: reviewed.outputTokens,
              latencyMs: reviewed.latencyMs,
              estimatedCostUsdMicros: runtime.requestCostUsdMicros,
              pricingVersion: 'ADMIN_FIXED_REQUEST_COST_PER_REVIEW',
              idempotencyKey: reviewUsageKey,
            });
            return reviewed.output;
          } catch (error) {
            if (error instanceof OpenAiSocialImageQualityReviewError)
              await recordAiUsageSafely({
                workspaceId: context.workspaceId,
                bunshinId: context.bunshinId,
                actorUserId: context.ownerUserId,
                taskType: 'SOCIAL_IMAGE_GENERATION',
                provider: 'OPENAI',
                model: runtime.model,
                promptVersion: 'social-image-quality-review-v1',
                status: 'FAILED',
                inputTokens: null,
                outputTokens: null,
                latencyMs: 0,
                estimatedCostUsdMicros: null,
                pricingVersion: null,
                errorCode: error.category,
                idempotencyKey: reviewUsageKey,
              });
            throw error;
          }
        };
        const initialReview = await reviewPages('initial');
        const pagesToRetry = socialImagePagesToRetry(initialReview);
        const buildQualityReport = (
          finalReview: SocialImageQualityReview,
          regeneratedPageIndexes: number[],
        ): SocialImageQualityReportRecord => ({
          version: 1,
          verdict: finalReview.verdict,
          checkedAt: new Date().toISOString(),
          regeneratedPageIndexes,
          initialPages: initialReview.pages,
          finalPages: finalReview.pages,
        });
        if (!pagesToRetry) {
          await repository.recordQualityReport({
            workspaceId: context.workspaceId,
            requestId: context.requestId,
            qualityReport: buildQualityReport(initialReview, []),
          });
          throw new SocialImageGenerationJobHandlerError('SOCIAL_IMAGE_QUALITY_REJECTED', false);
        }
        if (pagesToRetry.length) {
          await Promise.all(
            pagesToRetry.map(async (page) => {
              const pageReference = page.pageIndex === 0 ? referenceImage : identityReference;
              generatedPages[page.pageIndex] = await generatePage(
                layouts[page.pageIndex]!,
                page.pageIndex,
                pageReference,
                page.repairInstruction,
              );
            }),
          );
        }
        const finalReview: SocialImageQualityReview = pagesToRetry.length
          ? await reviewPages('final')
          : initialReview;
        if (finalReview.verdict !== 'PASS') {
          await repository.recordQualityReport({
            workspaceId: context.workspaceId,
            requestId: context.requestId,
            qualityReport: buildQualityReport(
              finalReview,
              pagesToRetry.map((page) => page.pageIndex),
            ),
          });
          throw new SocialImageGenerationJobHandlerError('SOCIAL_IMAGE_QUALITY_REJECTED', false);
        }
        const qualityReport = buildQualityReport(
          finalReview,
          pagesToRetry.map((page) => page.pageIndex),
        );
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
          qualityReport,
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
        await queueDailyCarouselVideoAfterImage({
          workspaceId: context.workspaceId,
          groupId: context.groupId,
          requestId: context.requestId,
          correlationId: usageKey,
        });
      } catch (error) {
        if (error instanceof OpenAiSocialImageProviderError) {
          throw new SocialImageGenerationJobHandlerError(
            `OPENAI_${error.category}`,
            error.retryable,
          );
        }
        if (error instanceof OpenAiSocialImageQualityReviewError) {
          throw new SocialImageGenerationJobHandlerError(
            `OPENAI_IMAGE_QUALITY_${error.category}`,
            error.retryable,
          );
        }
        throw error;
      }
    },
    async markFailed(input) {
      await markSocialImageGenerationFailed(input);
    },
  };
}
