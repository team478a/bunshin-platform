import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import type {
  AiProviderConfiguration,
  AiProviderConfigurationRepository,
} from '@bunshin/application';
import { resolveOpenAiRuntimeConfiguration } from '../src/ai/runtime-provider-configuration';

const active: AiProviderConfiguration = {
  id: '11111111-1111-4111-8111-111111111111',
  environment: 'DEVELOPMENT',
  provider: 'OPENAI',
  version: 2,
  status: 'ACTIVE',
  apiKeyConfigured: true,
  apiKeyMask: '••••1234',
  model: 'gpt-5-mini',
  dailyBudgetUsdMicros: 1_000_000,
  monthlyBudgetUsdMicros: 10_000_000,
  globallyPaused: false,
  keyVersion: 1,
  lastVerifiedAt: new Date('2026-08-24T00:00:00Z'),
  lastErrorCategory: null,
  createdAt: new Date('2026-08-24T00:00:00Z'),
  updatedAt: new Date('2026-08-24T00:00:00Z'),
};

function repository(
  value: Awaited<ReturnType<AiProviderConfigurationRepository['getActiveForRuntime']>>,
): AiProviderConfigurationRepository {
  return {
    listForAdmin: vi.fn(),
    createVersion: vi.fn(),
    getForConnectionTest: vi.fn(),
    recordConnectionTest: vi.fn(),
    activate: vi.fn(),
    pause: vi.fn(),
    getActiveForRuntime: vi.fn().mockResolvedValue(value),
  };
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
});

describe('OpenAI runtime configuration', () => {
  it('uses and decrypts the active admin configuration', async () => {
    await expect(
      resolveOpenAiRuntimeConfiguration({
        repository: repository({
          configuration: active,
          encryptedApiKey: 'sealed',
          dailySpentUsdMicros: 0,
          monthlySpentUsdMicros: 0,
        }),
        crypto: { encrypt: vi.fn(), decrypt: vi.fn().mockReturnValue('plain-key') },
        legacyApiKey: 'legacy-key',
      }),
    ).resolves.toEqual({
      apiKey: 'plain-key',
      model: 'gpt-5-mini',
      source: 'ADMIN_CONFIGURATION',
    });
  });

  it('uses the legacy environment only while no active configuration exists', async () => {
    await expect(
      resolveOpenAiRuntimeConfiguration({
        repository: repository(null),
        crypto: { encrypt: vi.fn(), decrypt: vi.fn() },
        legacyApiKey: 'legacy-key',
        legacyModel: 'legacy-model',
      }),
    ).resolves.toEqual({
      apiKey: 'legacy-key',
      model: 'legacy-model',
      source: 'LEGACY_ENVIRONMENT',
    });
  });

  it('does not bypass a paused active configuration with the legacy key', async () => {
    await expect(
      resolveOpenAiRuntimeConfiguration({
        repository: repository({
          configuration: { ...active, globallyPaused: true },
          encryptedApiKey: 'sealed',
          dailySpentUsdMicros: 0,
          monthlySpentUsdMicros: 0,
        }),
        crypto: { encrypt: vi.fn(), decrypt: vi.fn() },
        legacyApiKey: 'legacy-key',
      }),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR', message: 'provider is paused' });
  });
});
