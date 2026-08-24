import { describe, expect, it, vi } from 'vitest';
import {
  CreateAiProviderConfigurationVersion,
  type AiProviderConfiguration,
  type AiProviderConfigurationRepository,
  type AiProviderSecretCryptoPort,
} from '../src/index';

const value: AiProviderConfiguration = {
  id: '00000000-0000-4000-8000-000000000001',
  environment: 'PRODUCTION',
  provider: 'OPENAI',
  version: 1,
  status: 'DRAFT',
  apiKeyConfigured: false,
  apiKeyMask: null,
  model: 'gpt-5-mini',
  dailyBudgetUsdMicros: 1_000_000,
  monthlyBudgetUsdMicros: 5_000_000,
  globallyPaused: true,
  keyVersion: 1,
  lastVerifiedAt: null,
  lastErrorCategory: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const repository = (
  createVersion = vi.fn(() => Promise.resolve(value)),
): AiProviderConfigurationRepository => ({
  listForAdmin: vi.fn(),
  createVersion,
  getForConnectionTest: vi.fn(),
  recordConnectionTest: vi.fn(),
  activate: vi.fn(),
  pause: vi.fn(),
  getActiveForRuntime: vi.fn(),
});
const encrypt = vi.fn(() => ({
  encryptedValue: 'sealed-key',
  mask: '••••1234',
  keyVersion: 1,
}));
const crypto: AiProviderSecretCryptoPort = { encrypt, decrypt: vi.fn() };

describe('CreateAiProviderConfigurationVersion', () => {
  it('allows preparing a paused OpenAI draft before an API key is available', async () => {
    const createVersion = vi.fn(() => Promise.resolve(value));
    await new CreateAiProviderConfigurationVersion(repository(createVersion), crypto).execute({
      actorUserId: 'actor',
      environment: 'PRODUCTION',
      provider: 'OPENAI',
      reason: '本番向け予算を先に設定',
      model: 'gpt-5-mini',
      dailyBudgetUsdMicros: 1_000_000,
      monthlyBudgetUsdMicros: 5_000_000,
    });
    expect(encrypt).not.toHaveBeenCalled();
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: null, model: 'gpt-5-mini' }),
    );
  });

  it('encrypts a supplied API key and never passes plaintext to persistence', async () => {
    const createVersion = vi.fn(() => Promise.resolve(value));
    await new CreateAiProviderConfigurationVersion(repository(createVersion), crypto).execute({
      actorUserId: 'actor',
      environment: 'PRODUCTION',
      provider: 'EXA',
      reason: '検索サービスの鍵を登録',
      dailyBudgetUsdMicros: 500_000,
      monthlyBudgetUsdMicros: 2_000_000,
      apiKey: 'exa-secret-1234',
    });
    expect(encrypt).toHaveBeenCalledWith('exa-secret-1234');
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: expect.objectContaining({ encryptedValue: 'sealed-key' }),
      }),
    );
    expect(JSON.stringify(createVersion.mock.calls)).not.toContain('exa-secret-1234');
  });

  it('rejects an OpenAI draft without a model', async () => {
    await expect(
      new CreateAiProviderConfigurationVersion(repository(), crypto).execute({
        actorUserId: 'actor',
        environment: 'PRODUCTION',
        provider: 'OPENAI',
        reason: 'モデルなしは登録しない',
        dailyBudgetUsdMicros: 1,
        monthlyBudgetUsdMicros: 1,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires a model for Grok and accepts its prepared draft', async () => {
    const createVersion = vi.fn(() => Promise.resolve({ ...value, provider: 'GROK' as const }));
    await new CreateAiProviderConfigurationVersion(repository(createVersion), crypto).execute({
      actorUserId: 'actor',
      environment: 'PRODUCTION',
      provider: 'GROK',
      reason: 'Xの話題調査を準備',
      model: 'grok-4.6',
      dailyBudgetUsdMicros: 1_000_000,
      monthlyBudgetUsdMicros: 5_000_000,
    });
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'GROK', model: 'grok-4.6' }),
    );
  });

  it('rejects a monthly budget below the daily budget', async () => {
    await expect(
      new CreateAiProviderConfigurationVersion(repository(), crypto).execute({
        actorUserId: 'actor',
        environment: 'PRODUCTION',
        provider: 'FIRECRAWL',
        reason: '不正な予算を拒否',
        dailyBudgetUsdMicros: 2,
        monthlyBudgetUsdMicros: 1,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
