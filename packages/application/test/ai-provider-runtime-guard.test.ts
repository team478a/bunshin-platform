import { describe, expect, it, vi } from 'vitest';
import {
  ResolveAiProviderRuntimeConfiguration,
  type AiProviderConfiguration,
  type AiProviderConfigurationRepository,
} from '../src/index';

const configuration: AiProviderConfiguration = {
  id: '11111111-1111-4111-8111-111111111111',
  environment: 'PRODUCTION',
  provider: 'OPENAI',
  version: 1,
  status: 'ACTIVE',
  apiKeyConfigured: true,
  apiKeyMask: '••••1234',
  model: 'gpt-5-mini',
  dailyBudgetUsdMicros: 1_000_000,
  monthlyBudgetUsdMicros: 5_000_000,
  globallyPaused: false,
  keyVersion: 1,
  lastVerifiedAt: new Date('2026-08-24T00:00:00Z'),
  lastErrorCategory: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const repository = (
  snapshot: Awaited<ReturnType<AiProviderConfigurationRepository['getActiveForRuntime']>>,
): AiProviderConfigurationRepository => ({
  listForAdmin: vi.fn(),
  createVersion: vi.fn(),
  getForConnectionTest: vi.fn(),
  recordConnectionTest: vi.fn(),
  activate: vi.fn(),
  pause: vi.fn(),
  getActiveForRuntime: vi.fn(() => Promise.resolve(snapshot)),
});
const snapshot = {
  configuration,
  encryptedApiKey: 'sealed',
  dailySpentUsdMicros: 100,
  monthlySpentUsdMicros: 200,
};

describe('ResolveAiProviderRuntimeConfiguration', () => {
  it('returns only an active, verified, unpaused and funded configuration', async () => {
    await expect(
      new ResolveAiProviderRuntimeConfiguration(repository(snapshot)).execute({
        environment: 'PRODUCTION',
        provider: 'OPENAI',
        now: new Date('2026-08-24T12:00:00Z'),
      }),
    ).resolves.toEqual(snapshot);
  });

  it.each([
    [{ globallyPaused: true }, 'CONFIGURATION_ERROR'],
    [{ lastVerifiedAt: null }, 'CONFIGURATION_ERROR'],
    [{ lastErrorCategory: 'CREDENTIAL_INVALID' }, 'CONFIGURATION_ERROR'],
  ] as const)('fails closed for unsafe configuration %j', async (override, code) => {
    await expect(
      new ResolveAiProviderRuntimeConfiguration(
        repository({ ...snapshot, configuration: { ...configuration, ...override } }),
      ).execute({ environment: 'PRODUCTION', provider: 'OPENAI' }),
    ).rejects.toMatchObject({ code });
  });

  it('stops at either daily or monthly budget', async () => {
    await expect(
      new ResolveAiProviderRuntimeConfiguration(
        repository({ ...snapshot, dailySpentUsdMicros: configuration.dailyBudgetUsdMicros }),
      ).execute({ environment: 'PRODUCTION', provider: 'OPENAI' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
