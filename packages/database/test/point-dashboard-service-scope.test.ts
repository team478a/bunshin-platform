import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaPointLedgerRepository } from '../src/index';

describe('PrismaPointLedgerRepository service-scoped dashboard', () => {
  it('uses the selected service for membership, history, rules and weekly posts', async () => {
    const pointTransactionFindMany = vi.fn().mockResolvedValue([]);
    const pointRuleVersionFindMany = vi.fn().mockResolvedValue([]);
    const postRecordFindMany = vi.fn().mockResolvedValue([]);
    const groupMembershipFindFirst = vi.fn().mockResolvedValue({ id: 'group-member-1' });
    const client = {
      workspaceMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'workspace-member-1' }) },
      groupMembership: { findFirst: groupMembershipFindFirst },
      pointAccount: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'account-1',
          workspaceId: 'workspace-1',
          userId: 'user-1',
          availablePoints: 20,
          recoveryDue: 0,
          updatedAt: new Date('2026-09-12T00:00:00Z'),
        }),
      },
      pointTransaction: { findMany: pointTransactionFindMany },
      pointRuleVersion: { findMany: pointRuleVersionFindMany },
      postRecord: { findMany: postRecordFindMany },
    } as unknown as PrismaClient;

    await new PrismaPointLedgerRepository(client).getUserDashboard({
      workspaceId: 'workspace-1',
      groupId: 'group-a',
      actorUserId: 'user-1',
      now: new Date('2026-09-12T00:00:00Z'),
      timezone: 'Asia/Tokyo',
    });

    expect(groupMembershipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          groupId: 'group-a',
          userId: 'user-1',
        }),
      }),
    );
    expect(pointTransactionFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ groupId: 'group-a' }, { groupId: null }],
        }),
      }),
    );
    expect(pointRuleVersionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ groupId: null }, { groupId: 'group-a' }],
        }),
      }),
    );
    expect(postRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ bunshin: { groupId: 'group-a' } }),
      }),
    );
  });

  it('does not expose a dashboard for a service the user has not joined', async () => {
    const pointAccountFindUnique = vi.fn();
    const client = {
      workspaceMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'workspace-member-1' }) },
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      pointAccount: { findUnique: pointAccountFindUnique },
    } as unknown as PrismaClient;

    await expect(
      new PrismaPointLedgerRepository(client).getUserDashboard({
        workspaceId: 'workspace-1',
        groupId: 'group-b',
        actorUserId: 'user-1',
        now: new Date('2026-09-12T00:00:00Z'),
        timezone: 'Asia/Tokyo',
      }),
    ).resolves.toBeNull();
    expect(pointAccountFindUnique).not.toHaveBeenCalled();
  });
});
