import { describe, expect, it, vi } from 'vitest';
import { PrismaLineMissionNotificationSummaryRepository } from '../src';

describe('LINE Mission notification summary repository', () => {
  it('selects only safe fields under the complete workspace, user and Bunshin scope', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      format: 'TEXT',
      estimatedMinutes: 3,
      topic: '今日の短いテーマ',
      socialProfile: { platform: 'X' },
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
      },
      select: {
        format: true,
        estimatedMinutes: true,
        topic: true,
        socialProfile: { select: { platform: true } },
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
