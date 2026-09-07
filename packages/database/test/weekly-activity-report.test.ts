import { describe, expect, it, vi } from 'vitest';
import { PrismaWeeklyActivityReportRepository } from '../src';

const input = {
  workspaceId: 'workspace-a',
  groupId: 'group-a',
  bunshinId: 'bunshin-a',
  actorUserId: 'user-a',
  from: new Date('2026-09-06T00:00:00Z'),
  to: new Date('2026-09-15T00:00:00Z'),
};

describe('PrismaWeeklyActivityReportRepository', () => {
  it('returns no data and performs no activity queries outside the exact owner scope', async () => {
    const findMany = vi.fn();
    const client = {
      bunshin: { findFirst: vi.fn(() => Promise.resolve(null)) },
      missionActivity: { findMany },
      postRecord: { findMany },
      dailyAction: { findMany },
      missionContentVariantSelection: { findMany },
    };
    await expect(
      new PrismaWeeklyActivityReportRepository(client as never).read(input),
    ).resolves.toBeNull();
    expect(findMany).not.toHaveBeenCalled();
    expect(client.bunshin.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-a',
          groupId: 'group-a',
          ownerUserId: 'user-a',
        }),
      }),
    );
  });

  it('applies workspace, Bunshin and actor scope to every source query', async () => {
    const missionActivity = vi.fn(() => Promise.resolve([]));
    const postRecord = vi.fn(() => Promise.resolve([]));
    const dailyAction = vi.fn(() => Promise.resolve([]));
    const variantSelection = vi.fn(() => Promise.resolve([]));
    const client = {
      bunshin: { findFirst: vi.fn(() => Promise.resolve({ id: 'bunshin-a' })) },
      missionActivity: { findMany: missionActivity },
      postRecord: { findMany: postRecord },
      dailyAction: { findMany: dailyAction },
      missionContentVariantSelection: { findMany: variantSelection },
    };
    await expect(
      new PrismaWeeklyActivityReportRepository(client as never).read(input),
    ).resolves.toEqual({ activities: [], posts: [], dailyActions: [], variantSelections: [] });
    for (const query of [missionActivity, postRecord, variantSelection])
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'workspace-a',
            bunshinId: 'bunshin-a',
            actorUserId: 'user-a',
          }),
        }),
      );
    expect(dailyAction).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-a',
          bunshinId: 'bunshin-a',
          ownerUserId: 'user-a',
        }),
      }),
    );
  });
});
