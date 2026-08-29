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
  RefundPointRedemption,
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

const uuid = z.string().uuid();
const createSchema = z
  .object({
    groupMembershipId: uuid,
    campaignId: uuid.nullable().optional(),
    productPackVersionId: uuid.nullable().optional(),
    idempotencyKey: z.string().trim().min(8).max(200),
    layout: z
      .object({
        templateKey: z.enum([
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
      })
      .strict(),
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
    return (await request.json()) as unknown;
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
    const runtime = getServerEnvironment();
    const db = await import('@bunshin/database');
    const requests = new db.PrismaSocialImageGenerationRequestRepository();
    const redemptions = new db.PrismaPointRedemptionRepository();
    const badgeEntitlements = new db.PrismaBadgeEntitlementConsumptionRepository(db.prisma);
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
      layout: parsed.layout,
      idempotencyKey: parsed.idempotencyKey,
    });
    const runtimeConfiguration = await resolveOpenAiRuntimeConfiguration();
    const badgeUsage = await new TryConsumeBadgeEntitlement(badgeEntitlements).execute({
      workspaceId,
      userId: actor,
      featureKey: 'SOCIAL.IMAGE_GENERATION',
      resourceType: 'SOCIAL_IMAGE_REQUEST',
      resourceId: created.id,
      operationKey: `social-image:${created.id}`,
      estimatedCostUsdMicros: runtimeConfiguration.requestCostUsdMicros,
    });
    if (badgeUsage?.status === 'REFUNDED')
      throw new ApplicationError('CONFLICT', 'image entitlement was already refunded');
    let reservation = null;
    if (!badgeUsage) {
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
      if (reservation?.status === 'RESERVED') {
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
    const media = await requests.findMediaOwned({
      workspaceId,
      groupId,
      actorUserId: actor,
      requestId: value.id,
    });
    return Response.json(
      {
        data: {
          ...dto(value),
          media: media
            ? {
                id: media.id,
                status: media.status,
                width: media.width,
                height: media.height,
                downloadPath: `${new URL(request.url).pathname}/download`,
              }
            : null,
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
    const media = await requests.findMediaOwned({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: actor,
      requestId: uuid.parse(requestResourceId),
    });
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
