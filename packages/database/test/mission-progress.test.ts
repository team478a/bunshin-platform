import { describe, expect, it, vi } from 'vitest';
import { PrismaMissionEngagementRepository } from '../src/index';

describe('PrismaMissionEngagementRepository mission progress isolation', () => {
  it('scopes progress missions and activities to workspace, bunshin and verified actor', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'mission-1',
        missionDate: new Date('2026-08-17T00:00:00.000Z'),
        activities: [],
      },
    ]);
    const client = {
      bunshin: {
        findFirst: vi.fn().mockResolvedValue({
          ownerUserId: 'user-1',
          workspace: { memberships: [{ role: 'OWNER' }] },
        }),
      },
      dailyMission: { findMany },
    };
    const repository = new PrismaMissionEngagementRepository(client as never);
    await expect(
      repository.listProgressDays({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        bunshinId: 'bunshin-1',
        from: '2026-08-17',
        to: '2026-08-23',
      }),
    ).resolves.toEqual([
      { dailyMissionId: 'mission-1', missionDate: '2026-08-17', activities: [] },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          bunshinId: 'bunshin-1',
          OR: [
            { campaignId: null },
            {
              campaign: {
                group: {
                  status: 'ACTIVE',
                  memberships: { some: { userId: 'user-1', status: 'ACTIVE' } },
                },
                participations: {
                  some: {
                    participantWorkspaceId: 'workspace-1',
                    userId: 'user-1',
                    bunshinId: 'bunshin-1',
                    status: 'ACCEPTED',
                  },
                },
              },
            },
          ],
        }),
        select: expect.objectContaining({
          activities: expect.objectContaining({ where: { actorUserId: 'user-1' } }),
        }),
      }),
    );
  });

  it('does not query progress when the actor cannot access the bunshin scope', async () => {
    const findMany = vi.fn();
    const client = {
      bunshin: { findFirst: vi.fn().mockResolvedValue(null) },
      dailyMission: { findMany },
    };
    const repository = new PrismaMissionEngagementRepository(client as never);
    await expect(
      repository.listProgressDays({
        workspaceId: 'other-workspace',
        actorUserId: 'other-user',
        bunshinId: 'bunshin-1',
        from: null,
        to: '2026-08-23',
      }),
    ).resolves.toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });
});
