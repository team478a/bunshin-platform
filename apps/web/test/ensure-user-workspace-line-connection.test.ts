import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  identity: vi.fn(),
  source: vi.fn(),
  update: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../src/line/secure-configuration', () => ({
  currentLineEnvironment: () => 'PRODUCTION',
}));
vi.mock('@bunshin/application', () => ({
  ConnectLineMessagingAccount: class {
    execute = state.connect;
  },
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    authIdentity: { findFirst: state.identity },
    lineConnection: { findFirst: state.source, update: state.update },
  },
  PrismaLineConnectionRepository: class {},
}));

import { ensureUserWorkspaceLineConnection } from '../src/line/ensure-user-workspace-connection';

describe('workspace LINE connection provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.connect.mockResolvedValue({ id: 'connection-1' });
    state.update.mockResolvedValue({ id: 'connection-1' });
  });

  it('does nothing when the user has no verified LINE identity', async () => {
    state.identity.mockResolvedValue(null);
    state.source.mockResolvedValue(null);

    await expect(ensureUserWorkspaceLineConnection('user-1', 'workspace-2')).resolves.toBe(false);
    expect(state.connect).not.toHaveBeenCalled();
  });

  it('copies verified identity, consent and friendship state into the joined workspace', async () => {
    const followedAt = new Date('2026-09-03T00:00:00Z');
    const consentAt = new Date('2026-09-03T00:01:00Z');
    state.identity.mockResolvedValue({ providerUserId: 'U123' });
    state.source.mockResolvedValue({
      friendshipStatus: 'FOLLOWING',
      notificationConsentAt: consentAt,
      followedAt,
      unfollowedAt: null,
      lastWebhookAt: followedAt,
    });

    await expect(ensureUserWorkspaceLineConnection('user-1', 'workspace-2')).resolves.toBe(true);
    expect(state.connect).toHaveBeenCalledWith({
      environment: 'PRODUCTION',
      workspaceId: 'workspace-2',
      actorUserId: 'user-1',
      verifiedProviderUserId: 'U123',
      consentGranted: true,
    });
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          environment_workspaceId_userId: {
            environment: 'PRODUCTION',
            workspaceId: 'workspace-2',
            userId: 'user-1',
          },
        },
        data: expect.objectContaining({
          friendshipStatus: 'FOLLOWING',
          notificationConsentAt: consentAt,
        }),
      }),
    );
  });
});
