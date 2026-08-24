import { describe, expect, it, vi } from 'vitest';
import {
  ActivateAiProviderConfiguration,
  TestAiProviderConfigurationConnection,
  type AiProviderConfiguration,
  type AiProviderConfigurationRepository,
} from '../src/index';

const configuration: AiProviderConfiguration = {
  id: '11111111-1111-4111-8111-111111111111',
  environment: 'PRODUCTION',
  provider: 'OPENAI',
  version: 1,
  status: 'DRAFT',
  apiKeyConfigured: true,
  apiKeyMask: '••••1234',
  model: 'gpt-5-mini',
  dailyBudgetUsdMicros: 1,
  monthlyBudgetUsdMicros: 1,
  globallyPaused: true,
  keyVersion: 1,
  lastVerifiedAt: null,
  lastErrorCategory: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const repository = (): AiProviderConfigurationRepository => ({
  listForAdmin: vi.fn(),
  createVersion: vi.fn(),
  getForConnectionTest: vi.fn(() => Promise.resolve({ configuration, encryptedApiKey: 'sealed' })),
  recordConnectionTest: vi.fn(),
  activate: vi.fn(() => Promise.resolve(configuration)),
  pause: vi.fn(),
  getActiveForRuntime: vi.fn(),
});

describe('AI provider operations', () => {
  it('decrypts only inside the connection test and records the result', async () => {
    const recordConnectionTest = vi.fn();
    const repo = { ...repository(), recordConnectionTest };
    const validate = vi.fn(() => Promise.resolve({ success: true, errorCategory: null }));
    await new TestAiProviderConfigurationConnection(
      repo,
      { encrypt: vi.fn(), decrypt: vi.fn(() => 'plain-key') },
      { validate },
    ).execute({
      actorUserId: 'admin',
      configurationId: configuration.id,
      environment: 'PRODUCTION',
    });
    expect(validate).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'plain-key', provider: 'OPENAI' }),
    );
    expect(recordConnectionTest).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('requires an auditable reason before activation', async () => {
    await expect(
      new ActivateAiProviderConfiguration(repository()).execute({
        actorUserId: 'admin',
        configurationId: configuration.id,
        environment: 'PRODUCTION',
        reason: '',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
