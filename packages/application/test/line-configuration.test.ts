import { describe, expect, it, vi } from 'vitest';
import {
  CreateLineConfigurationVersion,
  type LineChannelConfiguration,
  type LineConfigurationRepository,
  type LineSecretCryptoPort,
} from '../src/index';

const value: LineChannelConfiguration = {
  id: '00000000-0000-4000-8000-000000000001',
  environment: 'DEVELOPMENT',
  version: 1,
  status: 'DRAFT',
  loginChannelId: 'login',
  loginSecretMask: '••••1234',
  messagingChannelId: 'message',
  messagingSecretMask: '••••5678',
  accessTokenMask: '••••9012',
  liffId: null,
  defaultNotificationTime: '08:00',
  defaultTimezone: 'Asia/Tokyo',
  quietHoursStart: '21:00',
  quietHoursEnd: '07:00',
  globallyPaused: false,
  quotaWarningPercent: 80,
  quotaLowPriorityStop: 90,
  keyVersion: 1,
  lastVerifiedAt: null,
  lastErrorCategory: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const repository = (
  createVersion = vi.fn(() => Promise.resolve(value)),
): LineConfigurationRepository => ({
  listForAdmin: vi.fn(),
  createVersion,
  activate: vi.fn(),
  getForConnectionTest: vi.fn(),
  recordConnectionTest: vi.fn(),
});
const encryptSecrets = vi.fn(() => ({
  loginSecret: 'sealed-login',
  messagingSecret: 'sealed-message',
  accessToken: 'sealed-token',
  loginSecretMask: '••••1234',
  messagingSecretMask: '••••5678',
  accessTokenMask: '••••9012',
  keyVersion: 1,
}));
const crypto: LineSecretCryptoPort = {
  encryptSecrets,
  decrypt: vi.fn(),
};

describe('CreateLineConfigurationVersion', () => {
  it('encrypts secrets and persists validated defaults', async () => {
    const createVersion = vi.fn(() => Promise.resolve(value));
    await new CreateLineConfigurationVersion(repository(createVersion), crypto).execute({
      actorUserId: 'actor',
      environment: 'DEVELOPMENT',
      reason: '初期設定を登録',
      loginChannelId: 'login',
      loginChannelSecret: 'login-secret-1234',
      messagingChannelId: 'message',
      messagingChannelSecret: 'message-secret-5678',
      channelAccessToken: 'access-token-9012',
      defaultNotificationTime: '08:00',
      defaultTimezone: 'Asia/Tokyo',
      quietHoursStart: '21:00',
      quietHoursEnd: '07:00',
      globallyPaused: false,
      quotaWarningPercent: 80,
      quotaLowPriorityStop: 90,
    });
    expect(encryptSecrets).toHaveBeenCalledOnce();
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: '初期設定を登録',
        secrets: expect.objectContaining({ loginSecret: 'sealed-login' }),
      }),
    );
  });

  it('rejects invalid quota ordering before encryption', async () => {
    await expect(
      new CreateLineConfigurationVersion(repository(), crypto).execute({
        actorUserId: 'actor',
        environment: 'DEVELOPMENT',
        reason: 'invalid quota',
        loginChannelId: 'login',
        loginChannelSecret: 'login-secret-1234',
        messagingChannelId: 'message',
        messagingChannelSecret: 'message-secret-5678',
        channelAccessToken: 'access-token-9012',
        defaultNotificationTime: '08:00',
        defaultTimezone: 'Asia/Tokyo',
        quietHoursStart: '21:00',
        quietHoursEnd: '07:00',
        globallyPaused: false,
        quotaWarningPercent: 90,
        quotaLowPriorityStop: 80,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
