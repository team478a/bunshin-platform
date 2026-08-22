import { beforeEach, describe, expect, it, vi } from 'vitest';

interface State {
  user: { userId: string } | null;
  summarize: ReturnType<typeof vi.fn>;
}
const state = vi.hoisted<State>(() => ({ user: { userId: 'admin-a' }, summarize: vi.fn() }));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_ENV: 'staging', APP_URL: 'https://staging.example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaLineAdminFunnelRepository: class {
    summarize = state.summarize;
  },
}));

const { lineAdminFunnelResponse } = await import('../src/http/line-admin-funnel');

describe('LINE admin funnel API', () => {
  beforeEach(() => {
    state.user = { userId: 'admin-a' };
    state.summarize.mockReset().mockResolvedValue({
      environment: 'STAGING',
      period: {
        from: new Date('2026-08-01T00:00:00Z'),
        to: new Date('2026-09-01T00:00:00Z'),
      },
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
    });
  });

  it('verified adminへ現在環境の非識別集計だけを返す', async () => {
    const response = await lineAdminFunnelResponse(
      new Request(
        'https://staging.example.com/api/admin/line-funnel?from=2026-08-01&to=2026-09-01',
      ),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(state.summarize).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'admin-a', environment: 'STAGING' }),
    );
    expect(body.data.period.from).toBe('2026-08-01T00:00:00.000Z');
    expect(JSON.stringify(body)).not.toContain('userId');
    expect(JSON.stringify(body)).not.toContain('providerUserId');
  });

  it('未知queryと未認証を拒否する', async () => {
    expect(
      (
        await lineAdminFunnelResponse(
          new Request(
            'https://staging.example.com/api/admin/line-funnel?from=2026-08-01&to=2026-09-01&workspaceId=x',
          ),
        )
      ).status,
    ).toBe(400);
    state.user = null;
    expect(
      (
        await lineAdminFunnelResponse(
          new Request(
            'https://staging.example.com/api/admin/line-funnel?from=2026-08-01&to=2026-09-01',
          ),
        )
      ).status,
    ).toBe(401);
  });
});
