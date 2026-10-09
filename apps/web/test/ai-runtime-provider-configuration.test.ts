import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import type {
  AiProviderConfiguration,
  AiProviderConfigurationRepository,
} from '@bunshin/application';
import {
  resolveOpenAiRuntimeConfiguration,
  resolveVideoAiRuntimeConfiguration,
} from '../src/ai/runtime-provider-configuration';

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
  it.each(['SOCIAL_PLANNER', 'TRAINING_ASSESSMENT'] as const)(
    'reuses current admin and legacy configuration for %s',
    async (task) => {
      const deps = {
        repository: repository({
          configuration: active,
          encryptedApiKey: 'sealed',
          dailySpentUsdMicros: 0,
          monthlySpentUsdMicros: 0,
        }),
        crypto: { encrypt: vi.fn(), decrypt: vi.fn().mockReturnValue('synthetic-key') },
        legacyApiKey: 'synthetic-legacy-key',
        legacyModel: 'gpt-5.2',
      };
      await expect(resolveOpenAiRuntimeConfiguration(deps, task)).resolves.toMatchObject({
        model: active.model,
        source: 'ADMIN_CONFIGURATION',
      });
      await expect(
        resolveOpenAiRuntimeConfiguration({ ...deps, repository: repository(null) }, task),
      ).resolves.toMatchObject({ model: 'gpt-5.2', source: 'LEGACY_ENVIRONMENT' });
      await expect(
        resolveOpenAiRuntimeConfiguration(
          { ...deps, repository: repository(null), legacyModel: 'unknown-model' },
          task,
        ),
      ).rejects.toMatchObject({
        code: 'CONFIGURATION_ERROR',
        cause: { reason: 'MODEL_NOT_REGISTERED' },
      });
    },
  );
  it('does not decrypt or fallback when the admin model is incompatible', async () => {
    const decrypt = vi.fn();
    await expect(
      resolveOpenAiRuntimeConfiguration(
        {
          repository: repository({
            configuration: { ...active, model: 'unreviewed-model' },
            encryptedApiKey: 'sealed',
            dailySpentUsdMicros: 0,
            monthlySpentUsdMicros: 0,
          }),
          crypto: { encrypt: vi.fn(), decrypt },
          legacyApiKey: 'synthetic',
          legacyModel: 'gpt-5.2',
        },
        'SOCIAL_PLANNER',
      ),
    ).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
      cause: { reason: 'MODEL_NOT_REGISTERED' },
    });
    expect(decrypt).not.toHaveBeenCalled();
  });
  it.each([
    {
      configuration: { ...active, globallyPaused: true },
      dailySpentUsdMicros: 0,
      monthlySpentUsdMicros: 0,
    },
    {
      configuration: { ...active, lastVerifiedAt: null },
      dailySpentUsdMicros: 0,
      monthlySpentUsdMicros: 0,
    },
    {
      configuration: { ...active, environment: 'STAGING' as const },
      dailySpentUsdMicros: 0,
      monthlySpentUsdMicros: 0,
    },
    {
      configuration: active,
      dailySpentUsdMicros: active.dailyBudgetUsdMicros,
      monthlySpentUsdMicros: 0,
    },
    {
      configuration: active,
      dailySpentUsdMicros: 0,
      monthlySpentUsdMicros: active.monthlyBudgetUsdMicros,
    },
  ])('keeps runtime gates before task compatibility %j', async (snapshot) => {
    const decrypt = vi.fn();
    await expect(
      resolveOpenAiRuntimeConfiguration(
        {
          repository: repository({ ...snapshot, encryptedApiKey: 'sealed' }),
          crypto: { encrypt: vi.fn(), decrypt },
          legacyApiKey: 'synthetic',
        },
        'TRAINING_ASSESSMENT',
      ),
    ).rejects.toThrow();
    expect(decrypt).not.toHaveBeenCalled();
  });
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
      requestCostUsdMicros: 0,
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
      requestCostUsdMicros: 0,
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

describe('video AI runtime configuration', () => {
  it('uses only the active, verified configuration for the current environment', async () => {
    await expect(
      resolveVideoAiRuntimeConfiguration({
        provider: 'FAL',
        repository: repository({
          configuration: {
            ...active,
            provider: 'FAL',
            model: 'fal-ai/kling-video/o1/reference-to-video',
            requestCostUsdMicros: 112_000,
          },
          encryptedApiKey: 'sealed',
          dailySpentUsdMicros: 0,
          monthlySpentUsdMicros: 0,
        }),
        crypto: { encrypt: vi.fn(), decrypt: vi.fn().mockReturnValue('plain-fal-key') },
      }),
    ).resolves.toEqual({
      provider: 'FAL',
      apiKey: 'plain-fal-key',
      model: 'fal-ai/kling-video/o1/reference-to-video',
      dailyBudgetUsdMicros: 1_000_000,
      monthlyBudgetUsdMicros: 10_000_000,
      estimatedCostUsdMicrosPerSecond: 112_000,
    });
  });

  it('does not support an environment-variable fallback for paid video generation', async () => {
    await expect(
      resolveVideoAiRuntimeConfiguration({
        provider: 'FAL',
        repository: repository(null),
        crypto: { encrypt: vi.fn(), decrypt: vi.fn() },
      }),
    ).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
      message: 'active provider configuration required',
    });
  });
});
