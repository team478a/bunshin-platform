import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  resolveMember: vi.fn(),
  isRouteNotFound: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.currentUser }),
}));
vi.mock('../src/navigation/route-not-found', () => ({
  isRouteNotFound: mocks.isRouteNotFound,
}));
vi.mock('../src/services/public-service', () => ({
  resolveMemberServiceContext: mocks.resolveMember,
}));

import { resolveAuthenticatedMemberServicePage } from '../src/services/member-service-page';

describe('authenticated member service page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ userId: 'user-a' });
    mocks.resolveMember.mockResolvedValue({ serviceId: 'service-a' });
    mocks.isRouteNotFound.mockReturnValue(false);
  });

  it('opens a private service through the authenticated membership boundary', async () => {
    await expect(
      resolveAuthenticatedMemberServicePage('private-service', '/s/private-service/images'),
    ).resolves.toEqual({
      actor: { userId: 'user-a' },
      service: { serviceId: 'service-a' },
    });
    expect(mocks.resolveMember).toHaveBeenCalledWith('private-service', 'user-a');
  });

  it('rejects a different project in the return path before authentication or lookup', async () => {
    await expect(
      resolveAuthenticatedMemberServicePage('service-a', '/s/service-b/line'),
    ).rejects.toThrow('NOT_FOUND');
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(mocks.resolveMember).not.toHaveBeenCalled();
  });

  it('preserves the requested page through login', async () => {
    mocks.currentUser.mockResolvedValue(null);
    await expect(
      resolveAuthenticatedMemberServicePage(
        'private-service',
        '/s/private-service/weekly-report?week=2026-09-14',
      ),
    ).rejects.toThrow(
      'REDIRECT:/login?returnTo=%2Fs%2Fprivate-service%2Fweekly-report%3Fweek%3D2026-09-14',
    );
    expect(mocks.resolveMember).not.toHaveBeenCalled();
  });

  it('does not reveal a private service to a non-member', async () => {
    mocks.resolveMember.mockRejectedValue(new Error('SERVICE_NOT_FOUND'));
    mocks.isRouteNotFound.mockReturnValue(true);
    await expect(
      resolveAuthenticatedMemberServicePage('private-service', '/s/private-service/videos'),
    ).rejects.toThrow('NOT_FOUND');
  });
});
