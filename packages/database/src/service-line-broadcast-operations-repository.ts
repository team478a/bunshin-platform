import type {
  ServiceLineBroadcastOperationsRepository,
  ServiceLineBroadcastRecipientStatus,
} from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
import { canManageServiceLineBroadcast } from './service-line-broadcast-scope';

class OperationAbort extends Error {
  constructor(readonly kind: 'CANNOT_RETRY' | 'NO_FAILED_RECIPIENTS') {
    super(kind);
  }
}

const recipientCounts = (recipients: Array<{ status: ServiceLineBroadcastRecipientStatus }>) =>
  recipients.reduce<Partial<Record<ServiceLineBroadcastRecipientStatus, number>>>(
    (result, item) => {
      result[item.status] = (result[item.status] ?? 0) + 1;
      return result;
    },
    {},
  );

export class PrismaServiceLineBroadcastOperationsRepository implements ServiceLineBroadcastOperationsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: Parameters<ServiceLineBroadcastOperationsRepository['list']>[0]) {
    if (!(await canManageServiceLineBroadcast(this.client, input))) return null;
    const [rows, industries] = await Promise.all([
      this.client.serviceLineBroadcast.findMany({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        include: { recipients: { select: { status: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit,
      }),
      input.includeIndustries
        ? this.client.industry.findMany({
            where: { status: 'ACTIVE' },
            orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    return {
      broadcasts: rows.map((row) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        status: row.status,
        scheduledAt: row.scheduledAt,
        createdAt: row.createdAt,
        completedAt: row.completedAt,
        segment: row.segmentCriteria,
        recipientCounts: recipientCounts(row.recipients),
      })),
      industries,
    };
  }

  async retry(input: Parameters<ServiceLineBroadcastOperationsRepository['retry']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await canManageServiceLineBroadcast(tx, input)))
          return { kind: 'ACCESS_DENIED' as const };
        const broadcast = await tx.serviceLineBroadcast.findFirst({
          where: {
            id: input.broadcastId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            status: 'COMPLETED',
          },
          select: { id: true },
        });
        if (!broadcast) return { kind: 'CANNOT_RETRY' as const };
        const failedRecipients = await tx.serviceLineBroadcastRecipient.count({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            broadcastId: input.broadcastId,
            status: 'FAILED',
          },
        });
        if (!failedRecipients) return { kind: 'NO_FAILED_RECIPIENTS' as const };

        const claimed = await tx.serviceLineBroadcast.updateMany({
          where: {
            id: input.broadcastId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            status: 'COMPLETED',
          },
          data: {
            status: 'SCHEDULED',
            scheduledAt: input.scheduledAt,
            completedAt: null,
            updatedByUserId: input.actorUserId,
          },
        });
        if (claimed.count !== 1) throw new OperationAbort('CANNOT_RETRY');
        const reset = await tx.serviceLineBroadcastRecipient.updateMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            broadcastId: input.broadcastId,
            status: 'FAILED',
          },
          data: { status: 'PENDING', errorCategory: null },
        });
        if (reset.count !== failedRecipients) throw new OperationAbort('NO_FAILED_RECIPIENTS');
        await tx.serviceLineBroadcastAuditLog.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            broadcastId: input.broadcastId,
            action: 'RETRY_REQUESTED',
            beforeData: { failedRecipients },
            afterData: { scheduledAt: input.scheduledAt.toISOString() },
            reason: input.reason,
            performedByUserId: input.actorUserId,
          },
        });
        return {
          kind: 'SCHEDULED' as const,
          broadcastId: input.broadcastId,
          recipientCount: reset.count,
          scheduledAt: input.scheduledAt,
        };
      });
    } catch (error) {
      if (error instanceof OperationAbort) return { kind: error.kind };
      throw error;
    }
  }

  async cancel(input: Parameters<ServiceLineBroadcastOperationsRepository['cancel']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await canManageServiceLineBroadcast(tx, input)))
        return { kind: 'ACCESS_DENIED' as const };
      const cancelled = await tx.serviceLineBroadcast.updateMany({
        where: {
          id: input.broadcastId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'SCHEDULED',
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: input.cancelledAt,
          updatedByUserId: input.actorUserId,
        },
      });
      if (cancelled.count !== 1) return { kind: 'CANNOT_CANCEL' as const };
      await tx.serviceLineBroadcastRecipient.updateMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          broadcastId: input.broadcastId,
          status: 'PENDING',
        },
        data: { status: 'CANCELLED' },
      });
      await tx.job.updateMany({
        where: {
          workspaceId: input.workspaceId,
          environment: input.environment,
          jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
          payloadReference: `service-line-broadcast:${input.broadcastId}`,
          status: { in: ['PENDING', 'RETRY_SCHEDULED'] },
        },
        data: { status: 'CANCELLED', cancelledAt: input.cancelledAt },
      });
      await tx.serviceLineBroadcastAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          broadcastId: input.broadcastId,
          action: 'CANCELLED',
          beforeData: { status: 'SCHEDULED' },
          afterData: { cancelledAt: input.cancelledAt.toISOString() },
          reason: input.reason,
          performedByUserId: input.actorUserId,
        },
      });
      return {
        kind: 'CANCELLED' as const,
        broadcastId: input.broadcastId,
        cancelledAt: input.cancelledAt,
      };
    });
  }
}
