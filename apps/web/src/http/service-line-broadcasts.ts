import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { EnqueueJob } from '@bunshin/application';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { currentLineEnvironment } from '../line/secure-configuration';
import { resolveManagedServiceContext } from '../services/public-service';

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(5000),
  reason: z.string().trim().min(1).max(1000),
  scheduledAt: z.string().datetime().optional(),
  confirmed: z.literal(true),
});

const retrySchema = z.object({ reason: z.string().trim().min(1).max(1000) });

async function enqueueBroadcastJob(input: {
  workspaceId: string;
  broadcastId: string;
  actorUserId: string;
  scheduledAt: Date;
  attempt: number;
}) {
  const db = await import('@bunshin/database');
  await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
    environment: currentLineEnvironment(),
    workspaceId: input.workspaceId,
    correlationId: `service-line-broadcast:${input.broadcastId}`,
    requestedBy: input.actorUserId,
    jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
    payloadReference: `service-line-broadcast:${input.broadcastId}`,
    idempotencyKey: `service-line-broadcast:${input.broadcastId}:attempt:${input.attempt}`,
    priority: 40,
    maxAttempts: 3,
    scheduledAt: input.scheduledAt,
  });
}

export async function listServiceLineBroadcastsResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const rows = await db.prisma.serviceLineBroadcast.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      include: { recipients: { select: { status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return Response.json({
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        status: row.status,
        scheduledAt: row.scheduledAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
        recipients: row.recipients.reduce<Record<string, number>>((result, item) => {
          result[item.status] = (result[item.status] ?? 0) + 1;
          return result;
        }, {}),
      })),
      requestId,
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

export async function sendServiceLineBroadcastResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = createSchema.parse(await request.json());
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const environment = currentLineEnvironment();
    const configuration = await db.prisma.groupLineChannelConfiguration.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        environment,
        status: 'ACTIVE',
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
        globallyPaused: false,
      },
      select: { encryptedAccessToken: true },
    });
    if (!configuration)
      throw new ApplicationError('CONFLICT', 'active service LINE configuration required');
    const recipients = await db.prisma.groupLineConnection.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'ACTIVE',
        notificationConsentAt: { not: null },
        friendshipStatus: 'FOLLOWING',
        groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
        user: { status: 'ACTIVE' },
      },
      select: { groupMembershipId: true, userId: true, providerUserId: true },
      take: 500,
    });
    if (!recipients.length) throw new ApplicationError('CONFLICT', 'no eligible LINE recipients');
    const scheduledAt = value.scheduledAt ? new Date(value.scheduledAt) : new Date();
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 5_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid scheduledAt');
    const broadcast = await db.prisma.$transaction(async (tx) => {
      const row = await tx.serviceLineBroadcast.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          title: value.title,
          message: value.message,
          status: 'SCHEDULED',
          scheduledAt,
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
        },
      });
      await tx.serviceLineBroadcastRecipient.createMany({
        data: recipients.map((recipient) => ({
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          broadcastId: row.id,
          groupMembershipId: recipient.groupMembershipId,
          userId: recipient.userId,
        })),
      });
      await tx.serviceLineBroadcastAuditLog.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          broadcastId: row.id,
          action: 'SCHEDULED',
          beforeData: {},
          afterData: {
            recipients: recipients.length,
            environment,
            scheduledAt: scheduledAt.toISOString(),
          },
          reason: value.reason,
          performedByUserId: actor.userId,
        },
      });
      return row;
    });
    await enqueueBroadcastJob({
      workspaceId: service.workspaceId,
      broadcastId: broadcast.id,
      actorUserId: actor.userId,
      scheduledAt,
      attempt: 1,
    });
    return Response.json({
      data: {
        broadcastId: broadcast.id,
        requested: recipients.length,
        scheduledAt: scheduledAt.toISOString(),
      },
      requestId,
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

export async function retryServiceLineBroadcastResponse(
  request: Request,
  serviceSlug: string,
  broadcastId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = retrySchema.parse(await request.json());
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const broadcast = await db.prisma.serviceLineBroadcast.findFirst({
      where: { id: broadcastId, workspaceId: service.workspaceId, groupId: service.serviceId },
      select: { id: true, status: true, updatedByUserId: true },
    });
    if (!broadcast || broadcast.status !== 'COMPLETED')
      throw new ApplicationError('CONFLICT', 'broadcast cannot be retried');
    const reset = await db.prisma.serviceLineBroadcastRecipient.updateMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        broadcastId,
        status: 'FAILED',
      },
      data: { status: 'PENDING', errorCategory: null },
    });
    if (!reset.count) throw new ApplicationError('CONFLICT', 'no failed recipients to retry');
    const now = new Date();
    await db.prisma.$transaction([
      db.prisma.serviceLineBroadcast.update({
        where: { id: broadcastId },
        data: {
          status: 'SCHEDULED',
          scheduledAt: now,
          completedAt: null,
          updatedByUserId: actor.userId,
        },
      }),
      db.prisma.serviceLineBroadcastAuditLog.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          broadcastId,
          action: 'RETRY_REQUESTED',
          beforeData: { failedRecipients: reset.count },
          afterData: { scheduledAt: now.toISOString() },
          reason: value.reason,
          performedByUserId: actor.userId,
        },
      }),
    ]);
    await enqueueBroadcastJob({
      workspaceId: service.workspaceId,
      broadcastId,
      actorUserId: actor.userId,
      scheduledAt: now,
      attempt: Date.now(),
    });
    return Response.json({ data: { broadcastId, retried: reset.count }, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}
