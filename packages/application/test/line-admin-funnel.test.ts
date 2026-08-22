import { describe, expect, it, vi } from 'vitest';
import { GetLineAdminFunnel, type LineAdminFunnelRepository } from '../src';

const from = new Date('2026-08-01T00:00:00Z');
const to = new Date('2026-09-01T00:00:00Z');

describe('GetLineAdminFunnel', () => {
  it('現在環境と上限付き期間をrepositoryへ渡す', async () => {
    const value = {
      environment: 'STAGING' as const,
      period: { from, to },
      cohort: { sentMessages: 2, sentUsers: 1, truncated: false },
      stages: {
        followedUsers: 1,
        unfollowedUsers: 0,
        openedUsers: 1,
        acceptedUsers: 1,
        copiedUsers: 1,
        postedUsers: 1,
      },
      messages: { opened: 1, posted: 1 },
      rates: { openRate: 0.5, notificationToPostRate: 0.5, unfollowRate: 0 },
    };
    const summarize = vi.fn().mockResolvedValue(value);
    await expect(
      new GetLineAdminFunnel({ summarize } satisfies LineAdminFunnelRepository).execute({
        actorUserId: 'admin-a',
        environment: 'STAGING',
        from,
        to,
      }),
    ).resolves.toEqual(value);
    expect(summarize).toHaveBeenCalledWith({
      actorUserId: 'admin-a',
      environment: 'STAGING',
      from,
      to,
      cohortLimit: 5_000,
    });
  });

  it('不正期間と366日超を拒否する', async () => {
    const summarize = vi.fn();
    const useCase = new GetLineAdminFunnel({ summarize } satisfies LineAdminFunnelRepository);
    await expect(
      useCase.execute({ actorUserId: 'a', environment: 'PRODUCTION', from: to, to: from }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      useCase.execute({
        actorUserId: 'a',
        environment: 'PRODUCTION',
        from,
        to: new Date('2027-09-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(summarize).not.toHaveBeenCalled();
  });

  it('非管理者には存在を秘匿する', async () => {
    const summarize = vi.fn().mockResolvedValue(null);
    await expect(
      new GetLineAdminFunnel({ summarize } satisfies LineAdminFunnelRepository).execute({
        actorUserId: 'user-a',
        environment: 'PRODUCTION',
        from,
        to,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
