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
import { resolvePublicServiceContext } from '../services/public-service';
import { SupabaseVideoRenderOutputStorage } from '../video/video-render-output-storage';
import {
  serviceVideoDeliveryJsonError as jsonError,
  serviceVideoDeliveryRequestId,
  serviceVideoDeliveryUuid as uuid,
} from './service-video-delivery-http-core';

const actions = ['VIEWED', 'ACCEPTED', 'DECLINED', 'POSTED'] as const;

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
    const service = await resolvePublicServiceContext(serviceSlug);
    const db = await import('@bunshin/database');
    const deliveries = new db.PrismaVideoDeliveryRepository();
    const parsedDeliveryId = uuid.parse(deliveryId);
    if (action === 'POSTED') {
      const existing = await new GetMyVideoDelivery(deliveries).execute({
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        actorUserId: actor.userId,
        videoDeliveryId: parsedDeliveryId,
      });
      if (existing.status === 'POSTED')
        return Response.json(
          { data: existing, requestId },
          { headers: { 'cache-control': 'no-store' } },
        );
      if (existing.status !== 'ACCEPTED')
        throw new ApplicationError('CONFLICT', 'video must be accepted before posting');
      const project = await db.prisma.videoProject.findFirst({
        where: {
          id: existing.videoProjectId,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          ownerUserId: actor.userId,
        },
        select: {
          platform: true,
          socialImageGenerationRequest: {
            select: { bunshinId: true, dailyMissionId: true },
          },
        },
      });
      const source = project?.socialImageGenerationRequest;
      if (project && source) {
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
    return Response.json({ data: delivery, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function downloadServiceVideoDeliveryResponse(
  serviceSlug: string,
  deliveryId: string,
) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) return new Response(null, { status: 401 });
  try {
    const service = await resolvePublicServiceContext(serviceSlug);
    const db = await import('@bunshin/database');
    const deliveries = new db.PrismaVideoDeliveryRepository();
    const delivery = await new GetMyVideoDelivery(deliveries).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: uuid.parse(deliveryId),
    });
    if (!['ACCEPTED', 'POSTED'].includes(delivery.status))
      throw new ApplicationError('FORBIDDEN', 'video delivery must be accepted');
    await new RecordVideoDeliveryAction(deliveries).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: delivery.id,
      action: 'DOWNLOADED',
      eventData: {},
    });
    const render = await db.prisma.videoRender.findFirst({
      where: {
        id: delivery.videoRenderId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        ownerUserId: actor.userId,
        status: 'SUCCEEDED',
        outputStorageKey: { not: null },
      },
      select: { outputStorageKey: true },
    });
    if (!render?.outputStorageKey) return new Response(null, { status: 404 });
    return Response.redirect(
      await new SupabaseVideoRenderOutputStorage().createDownloadUrl(render.outputStorageKey),
      302,
    );
  } catch {
    return new Response(null, { status: 404 });
  }
}
