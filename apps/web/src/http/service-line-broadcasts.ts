import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { EnqueueJob } from '@bunshin/application';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { currentLineEnvironment } from '../line/secure-configuration';
import { resolveManagedServiceContext } from '../services/public-service';

const segmentSchema = z
  .object({
    industryIds: z.array(z.string().uuid()).max(20).default([]),
    purposes: z
      .array(z.enum(['ATTRACT', 'RESERVATION', 'SALES', 'RECRUITING', 'AWARENESS', 'RETENTION']))
      .max(6)
      .default([]),
  })
  .strict();

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(5000),
  reason: z.string().trim().min(1).max(1000),
  scheduledAt: z.string().datetime().optional(),
  confirmed: z.literal(true),
  expectedRecipientCount: z.number().int().positive().max(500),
  segment: segmentSchema,
});

const retrySchema = z.object({ reason: z.string().trim().min(1).max(1000) });
const cancelSchema = z.object({ reason: z.string().trim().min(1).max(1000) });

async function eligibleRecipients(input: {
  workspaceId: string;
  groupId: string;
  segment: z.infer<typeof segmentSchema>;
}) {
  const db = await import('@bunshin/database');
  const segmented = input.segment.industryIds.length > 0 || input.segment.purposes.length > 0;
  return db.prisma.groupLineConnection.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: 'ACTIVE',
      notificationConsentAt: { not: null },
      friendshipStatus: 'FOLLOWING',
      groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
      user: {
        status: 'ACTIVE',
        ...(segmented
          ? {
              registrationProfile: {
                is: {
                  status: 'COMPLETED',
                  ...(input.segment.industryIds.length
                    ? { primaryIndustryId: { in: input.segment.industryIds } }
                    : {}),
                  ...(input.segment.purposes.length
                    ? { primaryPurpose: { in: input.segment.purposes } }
                    : {}),
                },
              },
            }
          : {}),
      },
    },
    select: { groupMembershipId: true, userId: true },
    take: 500,
  });
}

export async function previewServiceLineBroadcastResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const segment = segmentSchema.parse(await request.json());
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const recipients = await eligibleRecipients({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      segment,
    });
    return Response.json(
      {
        data: { eligibleRecipientCount: recipients.length, capped: recipients.length === 500 },
        requestId,
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

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
    const industries = await db.prisma.industry.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
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
        segment: row.segmentCriteria,
        recipients: row.recipients.reduce<Record<string, number>>((result, item) => {
          result[item.status] = (result[item.status] ?? 0) + 1;
          return result;
        }, {}),
      })),
      options: { industries },
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
    const recipients = await eligibleRecipients({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      segment: value.segment,
    });
    if (!recipients.length) throw new ApplicationError('CONFLICT', 'no eligible LINE recipients');
    if (recipients.length !== value.expectedRecipientCount)
      throw new ApplicationError(
        'CONFLICT',
        'recipient count changed; preview and confirm the audience again',
      );
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
          segmentCriteria: value.segment,
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
            segment: value.segment,
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

export async function cancelServiceLineBroadcastResponse(
  request: Request,
  serviceSlug: string,
  broadcastId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = cancelSchema.parse(await request.json());
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const broadcast = await db.prisma.serviceLineBroadcast.findFirst({
      where: {
        id: broadcastId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'SCHEDULED',
      },
      select: { id: true },
    });
    if (!broadcast) throw new ApplicationError('CONFLICT', 'broadcast cannot be cancelled');
    const now = new Date();
    await db.prisma.$transaction([
      db.prisma.serviceLineBroadcast.update({
        where: { id: broadcastId },
        data: { status: 'CANCELLED', cancelledAt: now, updatedByUserId: actor.userId },
      }),
      db.prisma.serviceLineBroadcastRecipient.updateMany({
        where: { broadcastId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      }),
      db.prisma.job.updateMany({
        where: {
          workspaceId: service.workspaceId,
          environment: currentLineEnvironment(),
          jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
          payloadReference: `service-line-broadcast:${broadcastId}`,
          status: { in: ['PENDING', 'RETRY_SCHEDULED'] },
        },
        data: { status: 'CANCELLED', cancelledAt: now },
      }),
      db.prisma.serviceLineBroadcastAuditLog.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          broadcastId,
          action: 'CANCELLED',
          beforeData: { status: 'SCHEDULED' },
          afterData: { cancelledAt: now.toISOString() },
          reason: value.reason,
          performedByUserId: actor.userId,
        },
      }),
    ]);
    return Response.json({ data: { broadcastId, cancelledAt: now.toISOString() }, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

export async function exportServiceLineBroadcastsResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const broadcasts = await db.prisma.serviceLineBroadcast.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      include: { recipients: { select: { status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5_000,
    });
    const cell = (value: string | number | null) =>
      `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [
      [
        '件名',
        '状態',
        '予約日時',
        '作成日時',
        '完了日時',
        '送信成功',
        '送信失敗',
        '対象外',
        '取消',
      ],
      ...broadcasts.map((broadcast) => {
        const count = broadcast.recipients.reduce<Record<string, number>>((result, recipient) => {
          result[recipient.status] = (result[recipient.status] ?? 0) + 1;
          return result;
        }, {});
        return [
          broadcast.title,
          broadcast.status,
          broadcast.scheduledAt?.toISOString() ?? null,
          broadcast.createdAt.toISOString(),
          broadcast.completedAt?.toISOString() ?? null,
          count.SENT ?? 0,
          count.FAILED ?? 0,
          count.SKIPPED ?? 0,
          count.CANCELLED ?? 0,
        ];
      }),
    ];
    return new Response(`\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="line-broadcasts.csv"',
        'x-request-id': requestId,
      },
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}
