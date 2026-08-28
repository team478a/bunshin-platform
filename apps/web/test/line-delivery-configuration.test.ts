import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  policy: vi.fn(),
  membership: vi.fn(),
  dedicated: vi.fn(),
  decrypt: vi.fn(),
  currentEnvironment: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    lineChannelConfiguration: { findFirst: mocks.findFirst },
    groupLineRoutingPolicy: { findUnique: mocks.policy },
    groupMembership: { findFirst: mocks.membership },
    groupLineChannelConfiguration: { findFirst: mocks.dedicated },
  },
}));
vi.mock('../src/line/secure-configuration', () => ({
  AesGcmLineSecretCrypto: class {
    decrypt = mocks.decrypt;
  },
  currentLineEnvironment: mocks.currentEnvironment,
}));

import { ActiveLineDeliveryConfigurationAdapter } from '../src/line/delivery-configuration';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentEnvironment.mockReturnValue('DEVELOPMENT');
});

describe('active LINE delivery configuration', () => {
  it('rejects a configuration request for another runtime environment before DB access', async () => {
    await expect(
      new ActiveLineDeliveryConfigurationAdapter().getActive('PRODUCTION'),
    ).resolves.toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it('returns only an active and successfully verified same-environment configuration', async () => {
    mocks.findFirst.mockResolvedValue({
      environment: 'DEVELOPMENT',
      encryptedAccessToken: 'encrypted-access-token',
      globallyPaused: false,
      quotaWarningPercent: 80,
      quotaLowPriorityStop: 90,
    });
    mocks.decrypt.mockReturnValue('decrypted-only-in-memory');
    await expect(
      new ActiveLineDeliveryConfigurationAdapter().getActive('DEVELOPMENT'),
    ).resolves.toEqual({
      environment: 'DEVELOPMENT',
      accessToken: 'decrypted-only-in-memory',
      globallyPaused: false,
      quotaWarningPercent: 80,
      quotaLowPriorityStop: 90,
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        environment: 'DEVELOPMENT',
        status: 'ACTIVE',
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    });
  });

  it('uses the verified dedicated configuration for an active pilot member', async () => {
    mocks.policy.mockResolvedValue({ mode: 'DEDICATED', pilotEnabled: true });
    mocks.membership.mockResolvedValue({ id: 'member-1' });
    mocks.dedicated.mockResolvedValue({
      environment: 'DEVELOPMENT',
      encryptedAccessToken: 'dedicated-token',
      globallyPaused: false,
      quotaWarningPercent: 70,
      quotaLowPriorityStop: 85,
    });
    mocks.decrypt.mockReturnValue('dedicated-plain');
    await expect(
      new ActiveLineDeliveryConfigurationAdapter().getActive('DEVELOPMENT', {
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({ accessToken: 'dedicated-plain', quotaWarningPercent: 70 });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('never falls back to the shared configuration when dedicated setup is unavailable', async () => {
    mocks.policy.mockResolvedValue({ mode: 'DEDICATED', pilotEnabled: true });
    mocks.membership.mockResolvedValue({ id: 'member-1' });
    mocks.dedicated.mockResolvedValue(null);
    await expect(
      new ActiveLineDeliveryConfigurationAdapter().getActive('DEVELOPMENT', {
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        userId: 'user-1',
      }),
    ).resolves.toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('does not resolve dedicated credentials after membership becomes inactive', async () => {
    mocks.policy.mockResolvedValue({ mode: 'DEDICATED', pilotEnabled: true });
    mocks.membership.mockResolvedValue(null);
    await expect(
      new ActiveLineDeliveryConfigurationAdapter().getActive('DEVELOPMENT', {
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        userId: 'user-1',
      }),
    ).resolves.toBeNull();
    expect(mocks.dedicated).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
