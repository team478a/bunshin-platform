import type {
  ServiceLineBroadcastDatabase,
  ServiceLineBroadcastDeliveryRecord,
} from './service-line-broadcast-delivery-types';

export async function completeDisabledServiceLineBroadcast(input: {
  db: ServiceLineBroadcastDatabase;
  broadcast: ServiceLineBroadcastDeliveryRecord;
  completedAt: Date;
}) {
  return input.db.prisma.$transaction(async (tx) => {
    const completed = await tx.serviceLineBroadcast.updateMany({
      where: {
        id: input.broadcast.id,
        workspaceId: input.broadcast.workspaceId,
        groupId: input.broadcast.groupId,
        status: 'SCHEDULED',
      },
      data: { status: 'COMPLETED', completedAt: input.completedAt },
    });
    if (completed.count !== 1) return false;
    await tx.serviceLineBroadcastRecipient.updateMany({
      where: {
        workspaceId: input.broadcast.workspaceId,
        groupId: input.broadcast.groupId,
        broadcastId: input.broadcast.id,
        status: 'PENDING',
      },
      data: { status: 'SKIPPED', errorCategory: 'LINE_DELIVERY_DISABLED' },
    });
    return true;
  });
}

export async function completeServiceLineBroadcast(input: {
  db: ServiceLineBroadcastDatabase;
  broadcast: ServiceLineBroadcastDeliveryRecord;
  processed: number;
  failed: number;
  completedAt: Date;
  reason?: string;
}) {
  return input.db.prisma.$transaction(async (tx) => {
    const completed = await tx.serviceLineBroadcast.updateMany({
      where: {
        id: input.broadcast.id,
        workspaceId: input.broadcast.workspaceId,
        groupId: input.broadcast.groupId,
        status: 'SCHEDULED',
      },
      data: { status: 'COMPLETED', completedAt: input.completedAt },
    });
    if (completed.count !== 1) return false;
    await tx.serviceLineBroadcastAuditLog.create({
      data: {
        workspaceId: input.broadcast.workspaceId,
        groupId: input.broadcast.groupId,
        broadcastId: input.broadcast.id,
        action: 'DELIVERY_COMPLETED',
        beforeData: {},
        afterData: { processed: input.processed, failed: input.failed },
        reason: input.reason ?? '予約または即時配信を実行',
        performedByUserId: input.broadcast.updatedByUserId,
      },
    });
    return true;
  });
}

export async function exhaustPendingServiceLineBroadcastRecipients(input: {
  db: ServiceLineBroadcastDatabase;
  broadcast: ServiceLineBroadcastDeliveryRecord;
  category: string;
  completedAt: Date;
  processedBefore?: number;
  failedBefore?: number;
}) {
  return input.db.prisma.$transaction(async (tx) => {
    const completed = await tx.serviceLineBroadcast.updateMany({
      where: {
        id: input.broadcast.id,
        workspaceId: input.broadcast.workspaceId,
        groupId: input.broadcast.groupId,
        status: 'SCHEDULED',
      },
      data: { status: 'COMPLETED', completedAt: input.completedAt },
    });
    if (completed.count !== 1) return 0;
    const failed = await tx.serviceLineBroadcastRecipient.updateMany({
      where: {
        workspaceId: input.broadcast.workspaceId,
        groupId: input.broadcast.groupId,
        broadcastId: input.broadcast.id,
        status: 'PENDING',
      },
      data: { status: 'FAILED', errorCategory: input.category },
    });
    await tx.serviceLineBroadcastAuditLog.create({
      data: {
        workspaceId: input.broadcast.workspaceId,
        groupId: input.broadcast.groupId,
        broadcastId: input.broadcast.id,
        action: 'DELIVERY_COMPLETED',
        beforeData: {},
        afterData: {
          processed: (input.processedBefore ?? 0) + failed.count,
          failed: (input.failedBefore ?? 0) + failed.count,
          exhausted: true,
        },
        reason: 'LINE配信の再試行上限に到達',
        performedByUserId: input.broadcast.updatedByUserId,
      },
    });
    return failed.count;
  });
}
