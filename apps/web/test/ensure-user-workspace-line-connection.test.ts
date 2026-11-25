import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  identity: vi.fn(),
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
  },
  PrismaLineConnectionRepository: class {},
}));

import { ensureUserWorkspaceLineConnection } from '../src/line/ensure-user-workspace-connection';

describe('workspace LINE connection provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.identity.mockResolvedValue({ providerUserId: 'U123' });
    state.connect.mockResolvedValue({ id: 'connection-1' });
  });

  it('does nothing when the user has no verified LINE identity', async () => {
    state.identity.mockResolvedValue(null);

    await expect(ensureUserWorkspaceLineConnection('user-1', 'workspace-2')).resolves.toBe(false);
    expect(state.connect).not.toHaveBeenCalled();
  });

  it('prepares the joined workspace without reading another workspace or granting consent', async () => {
    await expect(ensureUserWorkspaceLineConnection('user-1', 'workspace-2')).resolves.toBe(true);
    expect(state.connect).toHaveBeenCalledWith({
      environment: 'PRODUCTION',
      workspaceId: 'workspace-2',
      actorUserId: 'user-1',
      verifiedProviderUserId: 'U123',
      consentGranted: false,
    });
  });
  it('records explicit delivery consent only for the selected workspace', async () => {
    await expect(ensureUserWorkspaceLineConnection('user-1', 'workspace-2', true)).resolves.toBe(
      true,
    );
    expect(state.connect).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ workspaceId: 'workspace-2', consentGranted: true }),
    );
  });
});
