import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { getAdminUserDetail } from '../src/admin-user-detail';
import type { AdminUserRow } from '../src/admin-user-summary';

function userRow(): AdminUserRow {
  return {
    id: 'user-1',
    displayName: '運用確認ユーザー',
    email: 'member@example.com',
    status: 'ACTIVE',
    createdAt: new Date('2026-09-20T00:00:00Z'),
    identities: [{ provider: 'EMAIL' }],
    memberships: [
      {
        role: 'MEMBER',
        status: 'ACTIVE',
        workspace: { id: 'workspace-1', name: '確認Workspace' },
      },
    ],
    groupMemberships: [],
    activityMetricExclusionsAsTarget: [],
    bunshins: [
      {
        id: 'bunshin-1',
        name: '投稿パートナー',
        status: 'ACTIVE',
        createdAt: new Date('2026-09-20T01:00:00Z'),
        capabilityAssignments: [],
        socialAccountStrategies: [],
      },
    ],
    missionActivities: [{ type: 'VIEWED', occurredAt: new Date('2026-09-21T01:00:00Z') }],
    postRecords: [{ postedAt: new Date('2026-09-23T01:00:00Z') }],
    aiUsageEvents: [
      {
        status: 'FAILED',
        errorCode: 'PROVIDER_TIMEOUT',
        estimatedCostUsdMicros: null,
        occurredAt: new Date('2026-09-22T01:00:00Z'),
      },
    ],
    lineConnections: [],
    accountDeletionRequests: [],
    _count: { postRecords: 1, aiUsageEvents: 1 },
  };
}

describe('admin user detail', () => {
  it('builds a newest-first timeline and maps support audit data', async () => {
    const client = {
      user: { findUnique: vi.fn().mockResolvedValue(userRow()) },
      userOperationAudit: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'operation-1',
            action: 'STATUS_CHANGED',
            previousStatus: 'SUSPENDED',
            nextStatus: 'ACTIVE',
            reason: '本人確認完了',
            actor: { displayName: '運営担当' },
            occurredAt: new Date('2026-09-23T02:00:00Z'),
          },
        ]),
      },
      activityMetricExclusion: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'exclusion-1',
            action: 'INCLUDED',
            environment: 'PRODUCTION',
            reason: '確認完了',
            actor: { displayName: '運営担当' },
            occurredAt: new Date('2026-09-23T03:00:00Z'),
          },
        ]),
      },
      supportCase: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'case-1',
            subject: 'LINE接続確認',
            status: 'OPEN',
            priority: 'HIGH',
            assigneeUserId: 'admin-1',
            assignee: { displayName: '運営担当' },
            createdAt: new Date('2026-09-22T00:00:00Z'),
            updatedAt: new Date('2026-09-23T00:00:00Z'),
            resolvedAt: null,
            notes: [
              {
                id: 'note-1',
                content: '利用者へ確認中',
                author: { displayName: '運営担当' },
                createdAt: new Date('2026-09-22T02:00:00Z'),
              },
            ],
          },
        ]),
      },
    } as unknown as PrismaClient;

    const result = await getAdminUserDetail(client, {
      actorUserId: 'admin-1',
      userId: 'user-1',
      environment: 'PRODUCTION',
    });

    expect(result?.workspaces).toEqual([
      { id: 'workspace-1', name: '確認Workspace', role: 'MEMBER', status: 'ACTIVE' },
    ]);
    expect(result?.timeline.map(({ type, label }) => ({ type, label }))).toEqual([
      { type: 'POSTED', label: '投稿完了' },
      { type: 'AI', label: 'AI処理失敗（PROVIDER_TIMEOUT）' },
      { type: 'VIEWED', label: '投稿案：VIEWED' },
    ]);
    expect(result?.operationAudits[0]).toMatchObject({
      id: 'operation-1',
      actorDisplayName: '運営担当',
    });
    expect(result?.metricExclusionAudits[0]).toMatchObject({
      id: 'exclusion-1',
      environment: 'PRODUCTION',
    });
    expect(result?.supportCases[0]).toMatchObject({
      id: 'case-1',
      assigneeDisplayName: '運営担当',
      notes: [{ id: 'note-1', authorDisplayName: '運営担当' }],
    });
  });

  it('returns null when the target user no longer exists', async () => {
    const client = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      userOperationAudit: { findMany: vi.fn().mockResolvedValue([]) },
      activityMetricExclusion: { findMany: vi.fn().mockResolvedValue([]) },
      supportCase: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    await expect(
      getAdminUserDetail(client, {
        actorUserId: 'admin-1',
        userId: 'missing-user',
        environment: 'PRODUCTION',
      }),
    ).resolves.toBeNull();
  });
});
