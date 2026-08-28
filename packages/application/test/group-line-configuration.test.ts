import { describe, expect, it, vi } from 'vitest';
import {
  ActivateGroupLineConfiguration,
  CreateGroupLineConfigurationVersion,
  TestGroupLineConfigurationConnection,
  type GroupLineConfigurationRepository,
  type LineSecretCryptoPort,
} from '../src';

const configuration = {
  id: '00000000-0000-4000-8000-000000000004',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  environment: 'PRODUCTION' as const,
  version: 1,
  status: 'DRAFT' as const,
  webhookRoutingKey: '00000000-0000-4000-8000-000000000005',
  loginChannelId: 'login',
  loginSecretMask: '••••1234',
  messagingChannelId: 'message',
  messagingSecretMask: '••••5678',
  accessTokenMask: '••••9012',
  liffId: null,
  globallyPaused: true,
  quotaWarningPercent: 80,
  quotaLowPriorityStop: 90,
  keyVersion: 1,
  lastVerifiedAt: null,
  lastErrorCategory: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const repository = (
  overrides: Partial<GroupLineConfigurationRepository> = {},
): GroupLineConfigurationRepository => ({
  list: vi.fn(),
  createVersion: vi.fn().mockResolvedValue(configuration),
  getForTest: vi.fn(),
  recordTest: vi.fn(),
  activate: vi.fn().mockResolvedValue({ ...configuration, status: 'ACTIVE' }),
  ...overrides,
});
const crypto: LineSecretCryptoPort = {
  encryptSecrets: vi
    .fn()
    .mockReturnValue({
      loginSecret: 'encrypted-login',
      messagingSecret: 'encrypted-message',
      accessToken: 'encrypted-token',
      loginSecretMask: '••••1234',
      messagingSecretMask: '••••5678',
      accessTokenMask: '••••9012',
      keyVersion: 1,
    }),
  decrypt: vi.fn((value: string) => `plain:${value}`),
};

describe('group dedicated LINE configuration', () => {
  it('encrypts all secrets before persistence', async () => {
    const repo = repository();
    await new CreateGroupLineConfigurationVersion(repo, crypto).execute({
      actorUserId: 'actor',
      workspaceId: configuration.workspaceId,
      groupId: configuration.groupId,
      environment: 'PRODUCTION',
      reason: 'テストグループで利用',
      loginChannelId: 'login',
      loginChannelSecret: 'login-secret',
      messagingChannelId: 'message',
      messagingChannelSecret: 'message-secret',
      channelAccessToken: 'access-token',
      quotaWarningPercent: 80,
      quotaLowPriorityStop: 90,
    });
    expect(crypto.encryptSecrets).toHaveBeenCalledOnce();
    expect(repo.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        secrets: expect.objectContaining({ accessToken: 'encrypted-token' }),
      }),
    );
  });

  it('records a safe provider failure without throwing secret values', async () => {
    const recordTest = vi.fn();
    const repo = repository({
      getForTest: vi
        .fn()
        .mockResolvedValue({
          configuration,
          loginSecret: 'encrypted-login',
          messagingSecret: 'encrypted-message',
          accessToken: 'encrypted-token',
        }),
      recordTest,
    });
    const result = await new TestGroupLineConfigurationConnection(repo, crypto, {
      validate: vi.fn().mockRejectedValue(new Error('provider down')),
    }).execute({
      actorUserId: 'actor',
      workspaceId: configuration.workspaceId,
      groupId: configuration.groupId,
      configurationId: configuration.id,
      environment: 'PRODUCTION',
      callbackUrl: 'https://example.test/callback',
    });
    expect(result).toEqual({
      success: false,
      errorCategory: 'PROVIDER_UNAVAILABLE',
      botDisplayName: null,
    });
    expect(recordTest).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: 'PROVIDER_UNAVAILABLE' }),
    );
  });

  it('requires a meaningful reason before activation', async () => {
    const repo = repository();
    await expect(
      new ActivateGroupLineConfiguration(repo).execute({
        actorUserId: 'actor',
        workspaceId: configuration.workspaceId,
        groupId: configuration.groupId,
        configurationId: configuration.id,
        environment: 'PRODUCTION',
        reason: 'x',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.activate).not.toHaveBeenCalled();
  });
});
