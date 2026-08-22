import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  decrypt: vi.fn(),
  currentEnvironment: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/database', () => ({
  prisma: { lineChannelConfiguration: { findFirst: mocks.findFirst } },
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
});
