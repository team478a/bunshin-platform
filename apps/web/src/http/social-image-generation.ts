import 'server-only';
import {
  ConfirmPointRedemption,
  ConsumeServiceCreditForSocialImage,
  CreateSocialImageGenerationRequest,
  EnqueueJob,
  ListPointRewardCatalog,
  RefundBadgeEntitlementUsage,
  RefundPointRedemption,
  RefundServiceCreditForSocialImage,
  ReleasePointRedemption,
  ReservePointReward,
  SOCIAL_IMAGE_GENERATION_JOB_TYPE,
  TransitionSocialImageGenerationRequest,
  TryConsumeBadgeEntitlement,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { requireSameOrigin } from '../auth/request-security';
import { DailyActionStorage } from '../daily-actions/daily-action-storage';
import { assertOrganizationGenerationQuota } from '../organization-generation-quota';
import { normalizeImageReference, normalizeImageReferenceBytes } from '../social-image-reference';
import { SupabaseSocialImageStorage } from '../social-image-storage';
import {
  finishServiceMediaGeneration,
  reserveServiceMediaGeneration,
} from '../service-media-generation-quota';
import {
  parseSocialImageJsonBody,
  socialImageActorUserId,
  socialImageJobEnvironment,
  socialImageRequestDto,
  socialImageUuid,
} from './social-image-http-shared';

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
    groupMembershipId: socialImageUuid,
    referenceImage: z
      .object({ base64: z.string().min(1).max(4_000_000), rightsConfirmed: z.literal(true) })
      .strict()
      .optional(),
    savedPhotoId: socialImageUuid.optional(),
    campaignId: socialImageUuid.nullable().optional(),
    productPackVersionId: socialImageUuid.nullable().optional(),
    idempotencyKey: z.string().trim().min(8).max(200),
    layout: pageLayoutSchema.extend({
      carouselPages: z.array(pageLayoutSchema).min(1).max(6).optional(),
    }),
  })
  .strict()
  .refine((value) => !(value.referenceImage && value.savedPhotoId), {
    message: '新しい写真と保存写真はどちらか一方を選んでください',
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
    const actor = await socialImageActorUserId();
    const parsed = createSchema.parse(await parseSocialImageJsonBody(request));
    const runtime = getServerEnvironment();
    const db = await import('@bunshin/database');
    const savedPhoto = parsed.savedPhotoId
      ? await db.prisma.bunshinMemory.findFirst({
          where: {
            id: parsed.savedPhotoId,
            workspaceId,
            bunshinId,
            sourceType: 'USER_INPUT',
            sourceId: { startsWith: 'daily-action:PHOTO:' },
            attachmentStatus: 'READY',
            attachmentStorageKey: { not: null },
            active: true,
            deletedAt: null,
            bunshin: {
              ownerUserId: actor,
              groupId,
              status: { not: 'ARCHIVED' },
              group: {
                status: 'ACTIVE',
                memberships: {
                  some: { userId: actor, status: 'ACTIVE', consentedAt: { not: null } },
                },
              },
            },
          },
          select: { attachmentStorageKey: true },
        })
      : null;
    if (parsed.savedPhotoId && !savedPhoto?.attachmentStorageKey)
      throw new ApplicationError('NOT_FOUND', '保存した写真が見つかりません');
    const reference = parsed.referenceImage
      ? await normalizeImageReference(parsed.referenceImage.base64)
      : savedPhoto?.attachmentStorageKey
        ? await normalizeImageReferenceBytes(
            await new DailyActionStorage().read(savedPhoto.attachmentStorageKey),
          )
        : null;
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
      environment: socialImageJobEnvironment[runtime.APP_ENV],
      workspaceId: socialImageUuid.parse(workspaceId),
      groupId: socialImageUuid.parse(groupId),
      groupMembershipId: parsed.groupMembershipId,
      actorUserId: actor,
      bunshinId: socialImageUuid.parse(bunshinId),
      dailyMissionId: socialImageUuid.parse(dailyMissionId),
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
        groupId,
        actorUserId: actor,
      });
      const imageReward = catalog.find((item) => item.rewardType === 'SOCIAL_IMAGE_GENERATION');
      if (!imageReward)
        throw new ApplicationError('CONFIGURATION_ERROR', 'image point reward is unavailable');
      reservation = await new ReservePointReward(redemptions).execute({
        workspaceId,
        groupId,
        actorUserId: actor,
        catalogItemId: imageReward.id,
        expectedPointCost: imageReward.pointCost,
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
        environment: socialImageJobEnvironment[runtime.APP_ENV],
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
      { data: socialImageRequestDto(created), requestId },
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
