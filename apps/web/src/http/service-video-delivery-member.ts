import 'server-only';
import {
  GetMyVideoDelivery,
  RecordVideoDeliveryAction,
  ServiceReferralRewardService,
  type VideoDeliveryAction,
} from '@bunshin/application';
import { RecordManualPost, SOCIAL_PLATFORMS } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';
import { SupabaseVideoRenderOutputStorage } from '../video/video-render-output-storage';
import {
  serviceVideoDeliveryJsonError as jsonError,
  serviceVideoDeliveryRequestId,
  serviceVideoDeliveryUuid as uuid,
} from './service-video-delivery-http-core';

const actions = ['VIEWED', 'ACCEPTED', 'DECLINED', 'POSTED'] as const;

function requireAvailableDelivery(delivery: { status: string; expiresAt: Date | null }) {
  if (
    ['EXPIRED', 'REVOKED'].includes(delivery.status) ||
    (delivery.expiresAt !== null && delivery.expiresAt <= new Date())
  )
    throw new ApplicationError('FORBIDDEN', 'video delivery is unavailable');
}

export async function recordServiceVideoDeliveryActionResponse(
  request: Request,
  serviceSlug: string,
  deliveryId: string,
  action: string,
) {
  const requestId = serviceVideoDeliveryRequestId(request);
  try {
    requireSameOrigin(request);
    if (!actions.includes(action as (typeof actions)[number]))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid video delivery action');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
    const parsedId = uuid.safeParse(deliveryId);
    if (!parsedId.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery id');
    const db = await import('@bunshin/database');
    const deliveries = new db.PrismaVideoDeliveryRepository();
    const parsedDeliveryId = parsedId.data;
    if (action === 'POSTED') {
      const existing = await new GetMyVideoDelivery(deliveries).execute({
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        actorUserId: actor.userId,
        videoDeliveryId: parsedDeliveryId,
      });
      requireAvailableDelivery(existing);
      if (existing.status === 'POSTED')
        return Response.json(
          { data: existing, requestId },
          { headers: { 'cache-control': 'private, no-store' } },
        );
      if (existing.status !== 'ACCEPTED')
        throw new ApplicationError('CONFLICT', 'video must be accepted before posting');
      const project = await db.prisma.videoProject.findFirst({
        where: {
          id: existing.videoProjectId,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          ownerUserId: actor.userId,
          status: { not: 'CANCELLED' },
        },
        select: {
          platform: true,
          socialImageGenerationRequest: {
            select: { bunshinId: true, dailyMissionId: true },
          },
        },
      });
      if (!project) throw new ApplicationError('NOT_FOUND', 'video project unavailable');
      const source = project.socialImageGenerationRequest;
      if (source) {
        await new RecordManualPost(
          new db.PrismaDailyMissionRepository(),
          new db.PrismaBunshinCapabilityAssignmentRepository(),
          new db.PrismaMissionOutcomeRepository(),
        ).execute({
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          bunshinId: source.bunshinId,
          actorUserId: actor.userId,
          dailyMissionId: source.dailyMissionId,
          platform: z.enum(SOCIAL_PLATFORMS).parse(project.platform),
          postUrl: null,
          idempotencyKey: `video-delivery-post:${existing.id}`,
        });
        await new ServiceReferralRewardService(
          new db.PrismaServiceReferralRewardRepository(),
        ).completeMilestone({
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          referredUserId: actor.userId,
          milestone: 'FIRST_POST_REPORTED',
        });
      }
    }
    const delivery = await new RecordVideoDeliveryAction(deliveries).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: parsedDeliveryId,
      action: action as VideoDeliveryAction,
      eventData: {},
    });
    return Response.json(
      { data: delivery, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function downloadServiceVideoDeliveryResponse(
  serviceSlug: string,
  deliveryId: string,
) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
    const parsedId = uuid.safeParse(deliveryId);
    if (!parsedId.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery id');
    const db = await import('@bunshin/database');
    const deliveries = new db.PrismaVideoDeliveryRepository();
    const delivery = await new GetMyVideoDelivery(deliveries).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: parsedId.data,
    });
    requireAvailableDelivery(delivery);
    if (!['ACCEPTED', 'POSTED'].includes(delivery.status))
      throw new ApplicationError('FORBIDDEN', 'video delivery must be accepted');
    const render = await db.prisma.videoRender.findFirst({
      where: {
        id: delivery.videoRenderId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        ownerUserId: actor.userId,
        videoProjectId: delivery.videoProjectId,
        project: { status: { not: 'CANCELLED' } },
        status: 'SUCCEEDED',
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        outputStorageKey: { not: null },
      },
      select: { outputStorageKey: true },
    });
    const expectedKey = `${service.workspaceId}/${actor.userId}/${delivery.videoRenderId}.mp4`;
    if (!render?.outputStorageKey || render.outputStorageKey !== expectedKey)
      throw new ApplicationError('NOT_FOUND', 'video render unavailable');
    const downloadUrl = await new SupabaseVideoRenderOutputStorage().createDownloadUrl(
      render.outputStorageKey,
    );
    await new RecordVideoDeliveryAction(deliveries).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: delivery.id,
      action: 'DOWNLOADED',
      eventData: {},
    });
    return new Response(null, {
      status: 302,
      headers: {
        location: downloadUrl,
        'cache-control': 'private, no-store',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
