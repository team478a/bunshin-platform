import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaServiceLineBroadcastAudienceRepository } from '../src';

const scope = {
  workspaceId: 'workspace-a',
  groupId: 'group-a',
  actorUserId: 'manager-a',
  segment: { industryIds: ['industry-a'], purposes: ['SALES' as const] },
};

function transaction() {
  return {
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'manager-membership' }) },
    groupLineChannelConfiguration: { findFirst: vi.fn().mockResolvedValue({ id: 'config-a' }) },
    groupLineConnection: {
      findMany: vi.fn().mockResolvedValue([{ groupMembershipId: 'member-a', userId: 'user-a' }]),
    },
    serviceLineBroadcast: { create: vi.fn().mockResolvedValue({ id: 'broadcast-a' }) },
    serviceLineBroadcastRecipient: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    serviceLineBroadcastAuditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
}

describe('service LINE broadcast audience repository', () => {
  it('fails closed before reading recipients when the actor cannot manage the service', async () => {
    const findMany = vi.fn();
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      groupLineConnection: { findMany },
    } as unknown as PrismaClient;

    await expect(
      new PrismaServiceLineBroadcastAudienceRepository(client).preview(scope),
    ).resolves.toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('selects recipients only inside the exact service and uses a deterministic cap', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'manager-membership' }) },
      groupLineConnection: { findMany },
    } as unknown as PrismaClient;

    await new PrismaServiceLineBroadcastAudienceRepository(client).preview(scope);
    expect(findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        status: 'ACTIVE',
        notificationConsentAt: { not: null },
        friendshipStatus: 'FOLLOWING',
        groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
      }),
      select: { groupMembershipId: true, userId: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 501,
    });
  });

  it('atomically snapshots recipients, broadcast and audit under one service scope', async () => {
    const tx = transaction();
    const client = {
      $transaction: vi.fn((work: (value: typeof tx) => unknown) => Promise.resolve(work(tx))),
    } as unknown as PrismaClient;
    const scheduledAt = new Date('2026-09-26T03:00:00.000Z');

    await expect(
      new PrismaServiceLineBroadcastAudienceRepository(client).schedule({
        environment: 'PRODUCTION',
        ...scope,
        title: 'お知らせ',
        message: '今日の案内です。',
        reason: '配信内容を確認済み',
        scheduledAt,
        expectedRecipientCount: 1,
      }),
    ).resolves.toEqual({
      kind: 'SCHEDULED',
      broadcastId: 'broadcast-a',
      recipientCount: 1,
      scheduledAt,
    });
    expect(tx.serviceLineBroadcastRecipient.createMany).toHaveBeenCalledWith({
      data: [
        {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          broadcastId: 'broadcast-a',
          groupMembershipId: 'member-a',
          userId: 'user-a',
        },
      ],
    });
    expect(tx.serviceLineBroadcastAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        broadcastId: 'broadcast-a',
        performedByUserId: scope.actorUserId,
      }),
    });
  });

  it('does not persist when the confirmed recipient count changed or exceeded the cap', async () => {
    const tx = transaction();
    tx.groupLineConnection.findMany.mockResolvedValue([
      { groupMembershipId: 'member-a', userId: 'user-a' },
      { groupMembershipId: 'member-b', userId: 'user-b' },
    ]);
    const client = {
      $transaction: vi.fn((work: (value: typeof tx) => unknown) => Promise.resolve(work(tx))),
    } as unknown as PrismaClient;

    await expect(
      new PrismaServiceLineBroadcastAudienceRepository(client).schedule({
        environment: 'PRODUCTION',
        ...scope,
        title: 'お知らせ',
        message: '今日の案内です。',
        reason: '配信内容を確認済み',
        scheduledAt: new Date('2026-09-26T03:00:00.000Z'),
        expectedRecipientCount: 1,
      }),
    ).resolves.toEqual({ kind: 'RECIPIENT_COUNT_CHANGED' });
    expect(tx.serviceLineBroadcast.create).not.toHaveBeenCalled();
  });
});
