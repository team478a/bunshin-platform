import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import type {
  AiProviderConfiguration,
  AiProviderConfigurationRepository,
  AiProviderRuntimeAdmissionRepository,
} from '@bunshin/application';
import {
  reserveLearningProviderRuntimeConfiguration,
  resolveLearningProviderRuntimeConfiguration,
} from '../src/ai/learning-provider-runtime';

const googleConfiguration: AiProviderConfiguration = {
  id: '11111111-1111-4111-8111-111111111111',
  environment: 'STAGING',
  provider: 'GOOGLE',
  version: 1,
  status: 'ACTIVE',
  apiKeyConfigured: true,
  apiKeyMask: '••••1234',
  model: 'new-google-model',
  modelCapabilities: ['STRUCTURED_OUTPUT', 'IMAGE_INPUT', 'LONG_CONTEXT'],
  dailyBudgetUsdMicros: 1_000_000,
  monthlyBudgetUsdMicros: 5_000_000,
  requestCostUsdMicros: 300,
  globallyPaused: false,
  keyVersion: 1,
  lastVerifiedAt: new Date('2026-10-19T00:00:00.000Z'),
  lastErrorCategory: null,
  createdAt: new Date('2026-10-19T00:00:00.000Z'),
  updatedAt: new Date('2026-10-19T00:00:00.000Z'),
};

function providerRepository() {
  const getActiveForRuntime = vi.fn().mockResolvedValue({
    configuration: googleConfiguration,
    encryptedApiKey: 'sealed',
    dailySpentUsdMicros: 0,
    monthlySpentUsdMicros: 0,
    monthlyUnknownCostEvents: 0,
  });
  const row = {
    configuration: googleConfiguration,
    encryptedApiKey: 'sealed',
    dailySpentUsdMicros: 0,
    monthlySpentUsdMicros: 0,
    monthlyUnknownCostEvents: 0,
  };
  const repo: AiProviderConfigurationRepository & Partial<AiProviderRuntimeAdmissionRepository> = {
    listForAdmin: vi.fn(),
    createVersion: vi.fn(),
    getForConnectionTest: vi.fn(),
    recordConnectionTest: vi.fn(),
    activate: vi.fn(),
    pause: vi.fn(),
    getActiveForRuntime,
  };
  return { repo, row, getActiveForRuntime };
}

describe('learning provider runtime', () => {
  it('blocks evaluation-only Google in production before any provider lookup', async () => {
    const { repo, getActiveForRuntime } = providerRepository();
    await expect(
      resolveLearningProviderRuntimeConfiguration('google', 'LEARNING_LESSON', {
        repository: repo,
        crypto: { encrypt: vi.fn(), decrypt: vi.fn() },
        environment: 'PRODUCTION',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(getActiveForRuntime).not.toHaveBeenCalled();
  });

  it('uses admin-configured model capabilities and the existing provider reservation outside production', async () => {
    const { repo, row } = providerRepository();
    const admission = {
      id: '33333333-3333-4333-8333-333333333333',
      environment: 'STAGING' as const,
      provider: 'GOOGLE' as const,
      operationHash: 'a'.repeat(64),
    };
    const reserveActiveForRuntime = vi.fn().mockResolvedValue({ ...row, admission });
    const settleRuntimeAdmission = vi.fn().mockResolvedValue(true);
    Object.assign(repo, { reserveActiveForRuntime, settleRuntimeAdmission });
    const decrypt = vi.fn().mockReturnValue('provider-secret');

    const resolved = await resolveLearningProviderRuntimeConfiguration(
      'google',
      'LEARNING_LESSON',
      {
        repository: repo,
        crypto: { encrypt: vi.fn(), decrypt },
        environment: 'STAGING',
      },
    );
    expect(resolved).toMatchObject({
      provider: 'google',
      model: 'new-google-model',
      modelCapabilities: ['STRUCTURED_OUTPUT', 'IMAGE_INPUT', 'LONG_CONTEXT'],
      source: 'ADMIN_CONFIGURATION',
    });
    expect(decrypt).toHaveBeenCalledWith('sealed');

    const reserved = await reserveLearningProviderRuntimeConfiguration(
      'learning-eval:scenario-1',
      'google',
      'LEARNING_LESSON',
      250,
      1,
      {
        repository: repo,
        crypto: { encrypt: vi.fn(), decrypt },
        environment: 'STAGING',
      },
    );
    expect(reserveActiveForRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'GOOGLE',
        operationKey: 'learning-eval:scenario-1',
        reservedCostUsdMicros: 250,
      }),
    );
    expect(reserved.admission).toEqual(admission);
  });
});
