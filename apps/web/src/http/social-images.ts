import 'server-only';
import {
  CreateSocialImageGenerationRequest,
  CreateSocialImageMediaReadUrl,
  DecideSocialImageMedia,
  EnqueueJob,
  GetSocialImageGenerationRequest,
  ListPointRewardCatalog,
  ReservePointReward,
  ConfirmPointRedemption,
  ConsumeServiceCreditForSocialImage,
  RefundPointRedemption,
  RefundServiceCreditForSocialImage,
  RefundBadgeEntitlementUsage,
  ReleasePointRedemption,
  SOCIAL_IMAGE_GENERATION_JOB_TYPE,
  TransitionSocialImageGenerationRequest,
  TryConsumeBadgeEntitlement,
  type JobEnvironment,
  type SocialImageGenerationRequestRecord,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { SupabaseSocialImageStorage } from '../social-image-storage';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { assertOrganizationGenerationQuota } from '../organization-generation-quota';
import { normalizeImageReference } from '../social-image-reference';
import {
  finishServiceMediaGeneration,
  reserveServiceMediaGeneration,
} from '../service-media-generation-quota';

const uuid = z.string().uuid();
const pageLayoutSchema = z
  .object({
    templateKey: z.enum([
      'EDITORIAL_COVER',
      'EDITORIAL_POINT',
      'EDITORIAL_SUMMARY',
      'PERSON_HEADLINE',
      'PROBLEM_CHECKLIST',
      'THREE_POINTS',
      'EMPATHY_QUOTE',
      'CTA',
    ]),
    headline: z.string(),
    bodyLines: z.array(z.string()).max(5),
    cta: z.string().nullable(),
    accentColor: z.string(),
    visualScene: z.string().max(300).nullable().optional(),
  })
  .strict();
const createSchema = z
  .object({
    groupMembershipId: uuid,
    referenceImage: z
      .object({ base64: z.string().min(1).max(4_000_000), rightsConfirmed: z.literal(true) })
      .strict()
      .optional(),
    campaignId: uuid.nullable().optional(),
    productPackVersionId: uuid.nullable().optional(),
    idempotencyKey: z.string().trim().min(8).max(200),
    layout: pageLayoutSchema.extend({
      carouselPages: z.array(pageLayoutSchema).min(1).max(6).optional(),
    }),
  })
  .strict();
const decisionSchema = z
  .object({ mediaId: uuid, decision: z.enum(['ADOPTED', 'REJECTED']) })
  .strict();
const environment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const satisfies Record<string, JobEnvironment>;

async function actorUserId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  try {
    if (!request.body) throw new Error('empty body');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4_100_000) {
        await reader.cancel();
        throw new Error('body too large');
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

const dto = (value: SocialImageGenerationRequestRecord) => ({
  id: value.id,
  status: value.status,
  templateKey: value.templateKey,
  layout: value.layout,
  revision: value.revision,
  errorCode: value.errorCode,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});

export async function createSocialImageResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await actorUserId();
    const parsed = createSchema.parse(await body(request));
    const reference = parsed.referenceImage
      ? await normalizeImageReference(parsed.referenceImage.base64)
      : null;
    const runtime = getServerEnvironment();
    const db = await import('@bunshin/database');
    const requests = new db.PrismaSocialImageGenerationRequestRepository();
    const redemptions = new db.PrismaPointRedemptionRepository();
    const badgeEntitlements = new db.PrismaBadgeEntitlementConsumptionRepository(db.prisma);
    const serviceCredits = new db.PrismaServiceCreditConsumptionRepository();
    const { carouselPages, ...pageLayout } = parsed.layout;
    const layout = { ...pageLayout, ...(carouselPages ? { carouselPages } : {}) };
    let created = await new CreateSocialImageGenerationRequest(
      new db.PrismaSocialImageGenerationAuthorizationRepository(),
      requests,
    ).execute({
      environment: environment[runtime.APP_ENV],
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      groupMembershipId: parsed.groupMembershipId,
      actorUserId: actor,
      bunshinId: uuid.parse(bunshinId),
      dailyMissionId: uuid.parse(dailyMissionId),
      campaignId: parsed.campaignId ?? null,
      productPackVersionId: parsed.productPackVersionId ?? null,
      layout,
      referenceImage: reference?.referenceImage ?? null,
      idempotencyKey: parsed.idempotencyKey,
    });
    if ((created.referenceImage?.sha256 ?? null) !== (reference?.referenceImage.sha256 ?? null))
      throw new ApplicationError('CONFLICT', '同じ受付番号で参考写真を変更できません');
    if (reference && Date.now() - created.createdAt.getTime() >= 7 * 24 * 60 * 60 * 1000)
      throw new ApplicationError(
        'CONFLICT',
        '参考写真の保存期限を過ぎています。新しく作成してください',
      );
    if (reference)
      await new SupabaseSocialImageStorage().storeReference({
        workspaceId,
        groupId,
        ownerUserId: actor,
        requestId: created.id,
        bytes: reference.bytes,
      });
    await assertOrganizationGenerationQuota({ workspaceId, kind: 'IMAGE' });
    const runtimeConfiguration = await resolveOpenAiRuntimeConfiguration();
    const serviceMediaReservation = await reserveServiceMediaGeneration({
      workspaceId,
      groupId,
      kind: 'IMAGE',
      operationKey: created.idempotencyKey,
    });
    if (serviceMediaReservation.status === 'EXHAUSTED')
      throw new ApplicationError('FORBIDDEN', 'monthly image generation limit reached');
    if (serviceMediaReservation.status === 'ALREADY_CONSUMED')
      throw new ApplicationError('CONFLICT', 'image generation was already consumed');
    const planPayment = ['RESERVED', 'ALREADY_RESERVED'].includes(serviceMediaReservation.status);
    const pilotPayment = !planPayment && created.pilotEnrollmentId !== null;
    const serviceCreditUsage =
      planPayment || pilotPayment
        ? ({ status: 'NOT_CONFIGURED' } as const)
        : await new ConsumeServiceCreditForSocialImage(serviceCredits).execute({
            workspaceId,
            groupId,
            groupMembershipId: parsed.groupMembershipId,
            userId: actor,
            imageRequestId: created.id,
            idempotencyKey: `social-image:${created.id}`,
          });
    if (serviceCreditUsage.status === 'INSUFFICIENT')
      throw new ApplicationError('FORBIDDEN', 'image credit is unavailable');
    const badgeUsage =
      !planPayment && !pilotPayment && serviceCreditUsage.status === 'NOT_CONFIGURED'
        ? await new TryConsumeBadgeEntitlement(badgeEntitlements).execute({
            workspaceId,
            userId: actor,
            featureKey: 'SOCIAL.IMAGE_GENERATION',
            resourceType: 'SOCIAL_IMAGE_REQUEST',
            resourceId: created.id,
            operationKey: `social-image:${created.id}`,
            estimatedCostUsdMicros: runtimeConfiguration.requestCostUsdMicros,
          })
        : null;
    if (badgeUsage?.status === 'REFUNDED')
      throw new ApplicationError('CONFLICT', 'image entitlement was already refunded');
    let reservation = null;
    if (
      !planPayment &&
      !pilotPayment &&
      serviceCreditUsage.status === 'NOT_CONFIGURED' &&
      !badgeUsage
    ) {
      const catalog = await new ListPointRewardCatalog(redemptions).execute({
        workspaceId,
        actorUserId: actor,
      });
      const imageReward = catalog.find((item) => item.rewardType === 'SOCIAL_IMAGE_GENERATION');
      if (!imageReward)
        throw new ApplicationError('CONFIGURATION_ERROR', 'image point reward is unavailable');
      reservation = await new ReservePointReward(redemptions).execute({
        workspaceId,
        actorUserId: actor,
        catalogItemId: imageReward.id,
        idempotencyKey: `social-image:${created.id}`,
        resourceType: 'SOCIAL_IMAGE_REQUEST',
        resourceId: created.id,
      });
    }
    try {
      if (created.status === 'DRAFT')
        created = await new TransitionSocialImageGenerationRequest(requests).execute({
          workspaceId,
          groupId,
          actorUserId: actor,
          requestId: created.id,
          expectedRevision: created.revision,
          fromStatus: 'DRAFT',
          toStatus: 'QUEUED',
          errorCode: null,
        });
      if (created.status !== 'QUEUED')
        throw new ApplicationError('CONFLICT', 'social image request cannot be queued');
      if (reservation?.status === 'RESERVED')
        reservation = await new ConfirmPointRedemption(redemptions).execute({
          workspaceId,
          actorUserId: actor,
          redemptionId: reservation.id,
        });
      await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
        workspaceId,
        bunshinId,
        capabilityType: 'SOCIAL',
        correlationId: requestId,
        requestedBy: actor,
        environment: environment[runtime.APP_ENV],
        jobType: SOCIAL_IMAGE_GENERATION_JOB_TYPE,
        payloadReference: `social-image:${created.id}`,
        idempotencyKey: `social-image:${created.id}`,
        priority: 40,
        maxAttempts: 5,
      });
    } catch (error) {
      if (serviceMediaReservation.status === 'RESERVED') {
        await finishServiceMediaGeneration({
          reservation: serviceMediaReservation,
          outcome: 'RELEASED',
        }).catch(() => undefined);
      } else if (reservation?.status === 'RESERVED') {
        await new ReleasePointRedemption(redemptions)
          .execute({
            workspaceId,
            actorUserId: actor,
            redemptionId: reservation.id,
            reason: 'IMAGE_REQUEST_NOT_ACCEPTED',
          })
          .catch(() => undefined);
      } else if (reservation?.status === 'CONFIRMED') {
        await new RefundPointRedemption(redemptions)
          .execute({
            workspaceId,
            actorUserId: actor,
            redemptionId: reservation.id,
            reason: 'IMAGE_REQUEST_NOT_ENQUEUED',
          })
          .catch(() => undefined);
      } else if (badgeUsage?.status === 'CONSUMED') {
        await new RefundBadgeEntitlementUsage(badgeEntitlements)
          .execute({
            workspaceId,
            userId: actor,
            usageId: badgeUsage.id,
            reason: 'IMAGE_REQUEST_NOT_ENQUEUED',
          })
          .catch(() => undefined);
      } else if (serviceCreditUsage.status === 'CONSUMED') {
        await new RefundServiceCreditForSocialImage(serviceCredits)
          .execute({
            workspaceId,
            groupId,
            groupMembershipId: parsed.groupMembershipId,
            userId: actor,
            imageRequestId: created.id,
            idempotencyKey: `refund:social-image:${created.id}`,
          })
          .catch(() => undefined);
      }
      throw error;
    }
    return Response.json(
      { data: dto(created), requestId },
      { status: 202, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function getSocialImageResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  requestResourceId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await actorUserId();
    const db = await import('@bunshin/database');
    const requests = new db.PrismaSocialImageGenerationRequestRepository();
    const value = await new GetSocialImageGenerationRequest(requests).execute({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: actor,
      requestId: uuid.parse(requestResourceId),
    });
    const mediaPages = await requests.listMediaOwned({
      workspaceId,
      groupId,
      actorUserId: actor,
      requestId: value.id,
    });
    return Response.json(
      {
        data: {
          ...dto(value),
          media: mediaPages[0]
            ? {
                id: mediaPages[0].id,
                status: mediaPages[0].status,
                width: mediaPages[0].width,
                height: mediaPages[0].height,
                downloadPath: `${new URL(request.url).pathname}/download?mediaId=${mediaPages[0].id}`,
                savePath: `${new URL(request.url).pathname}/download?mediaId=${mediaPages[0].id}&download=1`,
              }
            : null,
          mediaPages: mediaPages.map((media) => ({
            id: media.id,
            pageIndex: media.pageIndex,
            status: media.status,
            width: media.width,
            height: media.height,
            downloadPath: `${new URL(request.url).pathname}/download?mediaId=${media.id}`,
            savePath: `${new URL(request.url).pathname}/download?mediaId=${media.id}&download=1`,
          })),
        },
        requestId,
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function decideSocialImageResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  requestResourceId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await actorUserId();
    const parsed = decisionSchema.parse(await body(request));
    const db = await import('@bunshin/database');
    const value = await new DecideSocialImageMedia(
      new db.PrismaSocialImageGenerationRequestRepository(),
    ).execute({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: actor,
      requestId: uuid.parse(requestResourceId),
      mediaId: parsed.mediaId,
      decision: parsed.decision,
    });
    return Response.json(
      { data: { id: value.id, status: value.status }, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function downloadSocialImageResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  requestResourceId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await actorUserId();
    const db = await import('@bunshin/database');
    const requests = new db.PrismaSocialImageGenerationRequestRepository();
    const mediaPages = await requests.listMediaOwned({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: actor,
      requestId: uuid.parse(requestResourceId),
    });
    const requestedMediaId = new URL(request.url).searchParams.get('mediaId');
    const shouldDownload = new URL(request.url).searchParams.get('download') === '1';
    const media = requestedMediaId
      ? mediaPages.find((item) => item.id === uuid.parse(requestedMediaId))
      : mediaPages[0];
    if (!media) throw new ApplicationError('NOT_FOUND', 'social image not found');
    const signed = await new CreateSocialImageMediaReadUrl(
      requests,
      new SupabaseSocialImageStorage(),
    ).execute({
      workspaceId,
      groupId,
      actorUserId: actor,
      requestId: requestResourceId,
      mediaId: media.id,
      kind: 'COMPLETED',
      ...(shouldDownload
        ? { downloadFilename: `watashi-works-post-${media.pageIndex + 1}.png` }
        : {}),
    });
    return new Response(null, {
      status: 302,
      headers: {
        location: signed.url,
        'cache-control': 'private, no-store',
        'content-disposition': 'attachment; filename="watashi-works-social-image.png"',
      },
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
