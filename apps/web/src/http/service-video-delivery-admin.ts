import 'server-only';
import {
  AssignVideoDelivery,
  RecordVideoDeliveryNotification,
  RevokeVideoDelivery,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';
import {
  serviceVideoDeliveryJsonError as jsonError,
  serviceVideoDeliveryRequestId,
  serviceVideoDeliveryUuid as uuid,
} from './service-video-delivery-http-core';
import { notificationOutcome, sendDeliveryNotice } from './service-video-delivery-notification';

const assignBody = z
  .object({
    membershipId: z.string().uuid(),
    programEnrollmentId: z.string().uuid().nullable(),
    videoProjectId: z.string().uuid(),
    videoRenderId: z.string().uuid(),
    replacesVideoDeliveryId: z.string().uuid().nullable(),
    usageMessage: z.string().trim().min(1).max(500),
    expiresAt: z.string().datetime().nullable(),
  })
  .strict();
const revokeBody = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export async function assignServiceVideoDeliveryResponse(request: Request, serviceSlug: string) {
  const requestId = serviceVideoDeliveryRequestId(request);
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, input] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, actor.userId),
      assignBody.parseAsync(await request.json()),
    ]);
    const db = await import('@bunshin/database');
    const delivery = await new AssignVideoDelivery(new db.PrismaVideoDeliveryRepository()).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      groupMembershipId: input.membershipId,
      programEnrollmentId: input.programEnrollmentId,
      videoProjectId: input.videoProjectId,
      videoRenderId: input.videoRenderId,
      replacesVideoDeliveryId: input.replacesVideoDeliveryId,
      rightsSnapshot: { schemaVersion: 1, usageMessage: input.usageMessage },
      expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt),
    });
    const notification = await sendDeliveryNotice({
      deliveryId: delivery.id,
      createdAt: delivery.createdAt,
      serviceSlug,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      ownerUserId: delivery.ownerUserId,
      videoProjectId: delivery.videoProjectId,
      videoRenderId: delivery.videoRenderId,
      notificationAttemptCount: delivery.notificationAttemptCount,
    }).catch(() => 'FAILED' as const);
    const outcome = notificationOutcome(notification);
    await new RecordVideoDeliveryNotification(new db.PrismaVideoDeliveryRepository()).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: delivery.id,
      status: outcome.status,
      errorCode: outcome.errorCode,
      attemptedAt: new Date(),
    });
    return Response.json({ data: delivery, notification, requestId }, { status: 201 });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function retryServiceVideoDeliveryNotificationResponse(
  request: Request,
  serviceSlug: string,
  deliveryId: string,
) {
  const requestId = serviceVideoDeliveryRequestId(request);
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const delivery = await db.prisma.videoDelivery.findFirst({
      where: {
        id: uuid.parse(deliveryId),
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: { not: 'REVOKED' },
        notificationStatus: { not: 'SENT' },
      },
      select: {
        id: true,
        ownerUserId: true,
        videoProjectId: true,
        videoRenderId: true,
        notificationAttemptCount: true,
        createdAt: true,
      },
    });
    if (!delivery)
      throw new ApplicationError('NOT_FOUND', 'video delivery notification unavailable');
    const notification = await sendDeliveryNotice({
      deliveryId: delivery.id,
      createdAt: delivery.createdAt,
      serviceSlug,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      ownerUserId: delivery.ownerUserId,
      videoProjectId: delivery.videoProjectId,
      videoRenderId: delivery.videoRenderId,
      notificationAttemptCount: delivery.notificationAttemptCount,
    }).catch(() => 'FAILED' as const);
    const outcome = notificationOutcome(notification);
    await new RecordVideoDeliveryNotification(new db.PrismaVideoDeliveryRepository()).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: delivery.id,
      status: outcome.status,
      errorCode: outcome.errorCode,
      attemptedAt: new Date(),
    });
    return Response.json({ data: { notification }, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function revokeServiceVideoDeliveryResponse(
  request: Request,
  serviceSlug: string,
  deliveryId: string,
) {
  const requestId = serviceVideoDeliveryRequestId(request);
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, input] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, actor.userId),
      revokeBody.parseAsync(await request.json()),
    ]);
    const db = await import('@bunshin/database');
    const delivery = await new RevokeVideoDelivery(new db.PrismaVideoDeliveryRepository()).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: uuid.parse(deliveryId),
      reason: input.reason,
    });
    return Response.json({ data: delivery, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
