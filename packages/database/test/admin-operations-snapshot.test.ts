import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { createAdminOperationsSnapshot } from '../src/admin-operations-snapshot';

describe('admin operations snapshot', () => {
  it('combines operational metrics without changing their source boundaries', async () => {
    const userFindMany = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const userCount = vi.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(10);
    const supportCaseCount = vi.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(3);
    const client = {
      activityMetricExclusion: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findMany: userFindMany, count: userCount },
      postRecord: {
        groupBy: vi.fn().mockResolvedValue([{ actorUserId: 'member-1', _count: { _all: 2 } }]),
        findFirst: vi.fn().mockResolvedValue({ postedAt: new Date('2026-09-23T03:00:00Z') }),
      },
      aiUsageEvent: {
        findMany: vi.fn().mockResolvedValue([
          { status: 'SUCCESS', estimatedCostUsdMicros: 120n },
          { status: 'FAILED', estimatedCostUsdMicros: 30n },
        ]),
      },
      lineConnection: { findMany: vi.fn().mockResolvedValue([{ userId: 'member-1' }]) },
      accountDeletionRequest: { findMany: vi.fn().mockResolvedValue([{ userId: 'member-2' }]) },
      lineMessageDelivery: { count: vi.fn().mockResolvedValue(8) },
      lineMessageDeliveryAttempt: { count: vi.fn().mockResolvedValue(1) },
      supportCase: { count: supportCaseCount },
      missionActivity: {
        groupBy: vi.fn().mockResolvedValue([{ actorUserId: 'member-1', _count: { _all: 3 } }]),
        findFirst: vi.fn().mockResolvedValue({ occurredAt: new Date('2026-09-23T02:00:00Z') }),
      },
      group: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'group-1',
            name: '運用グループ',
            memberships: [{ userId: 'member-1' }],
          },
        ]),
      },
    } as unknown as PrismaClient;

    const result = await createAdminOperationsSnapshot(client, {
      actorUserId: 'admin-1',
      environment: 'PRODUCTION',
      from: new Date('2026-09-01T00:00:00Z'),
      to: new Date('2026-10-01T00:00:00Z'),
      query: '',
      limit: 100,
    });

    expect(result.totals).toEqual({
      users: 12,
      activeUsers: 10,
      newUsers: 0,
      posts: 2,
      aiCalls: 2,
      aiFailedCalls: 1,
      estimatedAiCostUsdMicros: 150,
      lineConnectedUsers: 1,
      attentionUsers: 0,
      deletionPendingUsers: 1,
      lineSent: 8,
      lineFailed: 1,
      supportCasesCreated: 4,
      supportCasesResolved: 3,
      excludedUsers: 0,
    });
    expect(result.groups).toEqual([
      {
        id: 'group-1',
        name: '運用グループ',
        activeMembers: 1,
        eligibleMembers: 1,
        activeMembersInPeriod: 1,
        confirmations: 3,
        posts: 2,
      },
    ]);
    expect(result.monitoring).toEqual({
      latestActivityAt: new Date('2026-09-23T02:00:00Z'),
      latestPostAt: new Date('2026-09-23T03:00:00Z'),
      usersInactiveForSevenDays: 0,
      cohortTruncated: false,
    });
    expect(userFindMany).toHaveBeenCalledTimes(2);
    expect(supportCaseCount).toHaveBeenCalledTimes(2);
  });
});
