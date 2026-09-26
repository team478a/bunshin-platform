import { describe, expect, it, vi } from 'vitest';
import { PrismaLineMissionNotificationSummaryRepository } from '../src';

describe('LINE Mission notification summary repository', () => {
  it('selects only safe fields under the complete workspace, user and Bunshin scope', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      missionDate: new Date('2026-09-15T00:00:00.000Z'),
      format: 'TEXT',
      estimatedMinutes: 3,
      topic: '今日の短いテーマ',
      trendContext: { id: 'context-a' },
      socialProfile: { platform: 'X' },
      contentLinkUsage: { id: 'usage-a' },
      bunshin: { groupId: null },
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
          OR: [
            { ownerUserId: 'user-a' },
            {
              workspace: {
                memberships: {
                  some: {
                    userId: 'user-a',
                    status: 'ACTIVE',
                    role: { in: ['OWNER', 'ADMIN'] },
                  },
                },
              },
            },
          ],
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
        missionDate: true,
        format: true,
        estimatedMinutes: true,
        topic: true,
        trendContext: { select: { id: true } },
        socialProfile: { select: { platform: true } },
        classification: true,
        campaign: { select: { name: true } },
        contentLinkUsage: { select: { id: true } },
        bunshin: { select: { groupId: true } },
      },
    });
    expect(findFirst.mock.calls[0]?.[0].select).not.toHaveProperty('content');
  });

  it('adds the business growth action for an active service business profile', async () => {
    const profileFindFirst = vi.fn().mockResolvedValue({
      id: 'profile-a',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    const repository = new PrismaLineMissionNotificationSummaryRepository({
      dailyMission: {
        findFirst: vi.fn().mockResolvedValue({
          missionDate: new Date('2026-09-15T00:00:00.000Z'),
          format: 'TEXT',
          estimatedMinutes: 5,
          topic: '秋の新商品',
          trendContext: null,
          socialProfile: { platform: 'INSTAGRAM' },
          classification: 'ORGANIC',
          campaign: null,
          contentLinkUsage: null,
          bunshin: { groupId: 'group-a' },
        }),
      },
      serviceMemberBusinessProfile: { findFirst: profileFindFirst },
    } as never);

    await expect(
      repository.resolve({
        workspaceId: 'workspace-a',
        bunshinId: 'bunshin-a',
        actorUserId: 'user-a',
        dailyMissionId: 'mission-a',
      }),
    ).resolves.toMatchObject({
      businessAction: {
        kind: 'CUSTOMER_QUESTION',
        program: {
          cycleNumber: 1,
          day: 15,
          phaseKey: 'START_POSTING',
        },
      },
    });
    expect(profileFindFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        userId: 'user-a',
        groupMembership: { status: 'ACTIVE' },
      },
      select: { id: true, createdAt: true },
    });
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
