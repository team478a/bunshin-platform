import { describe, expect, it } from 'vitest';
import { adminUserSummary, type AdminUserRow } from '../src/admin-user-summary';

function baseRow(): AdminUserRow {
  return {
    id: crypto.randomUUID(),
    displayName: '運用確認ユーザー',
    email: 'member@example.com',
    status: 'ACTIVE',
    createdAt: new Date('2026-09-20T00:00:00Z'),
    identities: [{ provider: 'EMAIL' }],
    memberships: [],
    groupMemberships: [],
    activityMetricExclusionsAsTarget: [],
    bunshins: [],
    missionActivities: [],
    postRecords: [],
    aiUsageEvents: [],
    lineConnections: [],
    accountDeletionRequests: [],
    _count: { postRecords: 0, aiUsageEvents: 0 },
  };
}

describe('admin user summary', () => {
  it('uses only the requested environment for LINE and metric status', () => {
    const row: AdminUserRow = {
      ...baseRow(),
      lineConnections: [
        {
          environment: 'STAGING',
          status: 'ACTIVE',
          friendshipStatus: 'FOLLOWING',
          updatedAt: new Date('2026-09-23T00:00:00Z'),
        },
        {
          environment: 'PRODUCTION',
          status: 'DISCONNECTED',
          friendshipStatus: 'UNFOLLOWED',
          updatedAt: new Date('2026-09-22T00:00:00Z'),
        },
      ],
      activityMetricExclusionsAsTarget: [
        {
          environment: 'STAGING',
          action: 'INCLUDED',
          occurredAt: new Date('2026-09-23T00:00:00Z'),
        },
        {
          environment: 'PRODUCTION',
          action: 'EXCLUDED',
          occurredAt: new Date('2026-09-22T00:00:00Z'),
        },
      ],
    };

    expect(adminUserSummary(row, 'PRODUCTION', new Date('2026-09-24T00:00:00Z'))).toMatchObject({
      lineConnected: false,
      lineFollowing: false,
      excludedFromMetrics: true,
      lastActiveAt: new Date('2026-09-22T00:00:00Z'),
    });
  });

  it('reports the furthest completed user stage', () => {
    const row: AdminUserRow = {
      ...baseRow(),
      bunshins: [
        {
          id: crypto.randomUUID(),
          name: '投稿パートナー',
          status: 'ACTIVE',
          createdAt: new Date('2026-09-20T00:00:00Z'),
          capabilityAssignments: [{ id: crypto.randomUUID() }],
          socialAccountStrategies: [{ id: crypto.randomUUID() }],
        },
      ],
      missionActivities: [
        { type: 'VIEWED', occurredAt: new Date('2026-09-21T00:00:00Z') },
        { type: 'COPIED_TEXT', occurredAt: new Date('2026-09-22T00:00:00Z') },
      ],
      postRecords: [{ postedAt: new Date('2026-09-23T00:00:00Z') }],
      _count: { postRecords: 1, aiUsageEvents: 0 },
    };

    expect(adminUserSummary(row, 'PRODUCTION')).toMatchObject({
      stage: 'POSTED',
      bunshinCount: 1,
      postCount: 1,
      lastActiveAt: new Date('2026-09-23T00:00:00Z'),
    });
  });

  it('prioritizes a pending deletion when selecting the attention reason', () => {
    const row: AdminUserRow = {
      ...baseRow(),
      accountDeletionRequests: [{ id: crypto.randomUUID() }],
    };

    expect(
      adminUserSummary(row, 'PRODUCTION', new Date('2026-09-24T00:00:00Z')).attentionReason,
    ).toBe('退会処理待ち');
  });
});
