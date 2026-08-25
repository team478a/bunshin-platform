import { describe, expect, it, vi } from 'vitest';
import { PrismaLineMissionNotificationSummaryRepository } from '../src';

describe('LINE Mission notification summary repository', () => {
  it('selects only safe fields under the complete workspace, user and Bunshin scope', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      format: 'TEXT',
      estimatedMinutes: 3,
      topic: '今日の短いテーマ',
      trendContext: { id: 'context-a' },
      socialProfile: { platform: 'X' },
      contentLinkUsage: { id: 'usage-a' },
    });
    const repository = new PrismaLineMissionNotificationSummaryRepository({
      dailyMission: { findFirst },
    } as never);

    await expect(
      repository.resolve({
        workspaceId: 'workspace-a',
        bunshinId: 'bunshin-a',
        actorUserId: 'user-a',
        dailyMissionId: 'mission-a',
      }),
    ).resolves.toEqual({
      platform: 'X',
      format: 'TEXT',
      estimatedMinutes: 3,
      topic: '今日の短いテーマ',
      researched: true,
      externalLinkIncluded: true,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'mission-a',
        workspaceId: 'workspace-a',
        bunshinId: 'bunshin-a',
        bunshin: {
          status: { not: 'ARCHIVED' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: 'user-a', status: 'ACTIVE' } },
          },
        },
        socialProfile: { is: { status: 'ACTIVE' } },
        OR: [
          { campaignId: null },
          {
            campaign: {
              is: {
                status: 'OPEN',
                startsAt: { lte: expect.any(Date) },
                endsAt: { gt: expect.any(Date) },
                group: {
                  status: 'ACTIVE',
                  memberships: {
                    some: {
                      userId: 'user-a',
                      status: 'ACTIVE',
                      consentedAt: { not: null },
                    },
                  },
                },
                participations: {
                  some: {
                    participantWorkspaceId: 'workspace-a',
                    userId: 'user-a',
                    bunshinId: 'bunshin-a',
                    status: 'ACCEPTED',
                  },
                },
                productPackVersion: {
                  status: 'PUBLISHED',
                  assignments: {
                    some: { bunshinId: 'bunshin-a', status: 'ACTIVE' },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        format: true,
        estimatedMinutes: true,
        topic: true,
        trendContext: { select: { id: true } },
        socialProfile: { select: { platform: true } },
        classification: true,
        campaign: { select: { name: true } },
        contentLinkUsage: { select: { id: true } },
      },
    });
    expect(findFirst.mock.calls[0]?.[0].select).not.toHaveProperty('content');
  });

  it('returns no summary when the scoped Mission or active profile is unavailable', async () => {
    const repository = new PrismaLineMissionNotificationSummaryRepository({
      dailyMission: { findFirst: vi.fn().mockResolvedValue(null) },
    } as never);
    await expect(
      repository.resolve({
        workspaceId: 'workspace-a',
        bunshinId: 'bunshin-a',
        actorUserId: 'user-b',
        dailyMissionId: 'mission-a',
      }),
    ).resolves.toBeNull();
  });
});
