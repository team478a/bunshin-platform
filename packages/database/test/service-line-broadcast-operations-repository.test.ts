import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaServiceLineBroadcastOperationsRepository } from '../src';

const scope = {
  environment: 'PRODUCTION' as const,
  workspaceId: 'workspace-a',
  groupId: 'group-a',
  actorUserId: 'manager-a',
  broadcastId: 'broadcast-a',
};
const now = new Date('2026-09-26T03:30:00.000Z');

function transaction() {
  return {
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'manager-membership' }) },
    serviceLineBroadcast: {
      findFirst: vi.fn().mockResolvedValue({ id: scope.broadcastId }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    serviceLineBroadcastRecipient: {
      count: vi.fn().mockResolvedValue(2),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    serviceLineBroadcastAuditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-a' }) },
    job: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

const clientWithTransaction = (tx: ReturnType<typeof transaction>) =>
  ({
    $transaction: vi.fn((work: (value: typeof tx) => unknown) => Promise.resolve(work(tx))),
  }) as unknown as PrismaClient;

describe('service LINE broadcast operations repository', () => {
  it('fails closed before listing another service data', async () => {
    const findMany = vi.fn();
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      serviceLineBroadcast: { findMany },
    } as unknown as PrismaClient;

    await expect(
      new PrismaServiceLineBroadcastOperationsRepository(client).list({
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        actorUserId: scope.actorUserId,
        limit: 30,
        includeIndustries: true,
      }),
    ).resolves.toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('lists only the exact service scope and reduces recipient statuses', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: scope.broadcastId,
        title: 'title',
        message: 'message',
        status: 'COMPLETED',
        scheduledAt: now,
        createdAt: now,
        completedAt: now,
        segmentCriteria: {},
        recipients: [{ status: 'SENT' }, { status: 'SENT' }, { status: 'FAILED' }],
      },
    ]);
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'manager-membership' }) },
      serviceLineBroadcast: { findMany },
      industry: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    const result = await new PrismaServiceLineBroadcastOperationsRepository(client).list({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: scope.actorUserId,
      limit: 30,
      includeIndustries: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { workspaceId: scope.workspaceId, groupId: scope.groupId },
      include: { recipients: { select: { status: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 30,
    });
    expect(result?.broadcasts[0]?.recipientCounts).toEqual({ SENT: 2, FAILED: 1 });
  });

  it('atomically claims a completed broadcast, resets failed recipients and audits retry', async () => {
    const tx = transaction();
    const repository = new PrismaServiceLineBroadcastOperationsRepository(
      clientWithTransaction(tx),
    );

    await expect(
      repository.retry({ ...scope, reason: 'operator retry', scheduledAt: now }),
    ).resolves.toEqual({
      kind: 'SCHEDULED',
      broadcastId: scope.broadcastId,
      recipientCount: 2,
      scheduledAt: now,
    });
    expect(tx.serviceLineBroadcast.updateMany).toHaveBeenCalledWith({
      where: {
        id: scope.broadcastId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        status: 'COMPLETED',
      },
      data: {
        status: 'SCHEDULED',
        scheduledAt: now,
        completedAt: null,
        updatedByUserId: scope.actorUserId,
      },
    });
    expect(tx.serviceLineBroadcastRecipient.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        broadcastId: scope.broadcastId,
        status: 'FAILED',
      },
      data: { status: 'PENDING', errorCategory: null },
    });
    expect(tx.serviceLineBroadcastAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'RETRY_REQUESTED',
        performedByUserId: scope.actorUserId,
      }),
    });
  });

  it('fails a concurrent retry before changing recipients', async () => {
    const tx = transaction();
    tx.serviceLineBroadcast.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      new PrismaServiceLineBroadcastOperationsRepository(clientWithTransaction(tx)).retry({
        ...scope,
        reason: 'operator retry',
        scheduledAt: now,
      }),
    ).resolves.toEqual({ kind: 'CANNOT_RETRY' });
    expect(tx.serviceLineBroadcastRecipient.updateMany).not.toHaveBeenCalled();
    expect(tx.serviceLineBroadcastAuditLog.create).not.toHaveBeenCalled();
  });

  it('cancels the broadcast, recipients and pending jobs under exact scopes', async () => {
    const tx = transaction();

    await expect(
      new PrismaServiceLineBroadcastOperationsRepository(clientWithTransaction(tx)).cancel({
        ...scope,
        reason: 'operator cancel',
        cancelledAt: now,
      }),
    ).resolves.toEqual({ kind: 'CANCELLED', broadcastId: scope.broadcastId, cancelledAt: now });
    expect(tx.serviceLineBroadcastRecipient.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        broadcastId: scope.broadcastId,
        status: 'PENDING',
      },
      data: { status: 'CANCELLED' },
    });
    expect(tx.job.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        environment: scope.environment,
        jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
        payloadReference: `service-line-broadcast:${scope.broadcastId}`,
        status: { in: ['PENDING', 'RETRY_SCHEDULED'] },
      },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
  });
});
