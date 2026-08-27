import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const now = new Date('2026-08-24T00:00:00Z');
const configuration = {
  id: '11111111-1111-4111-8111-111111111111',
  environment: 'DEVELOPMENT' as const,
  provider: 'OPENAI' as const,
  version: 1,
  status: 'DRAFT' as const,
  encryptedApiKey: 'sealed-value',
  apiKeyConfigured: true,
  apiKeyMask: '••••1234',
  model: 'gpt-5-mini',
  dailyBudgetUsdMicros: 1_000_000,
  monthlyBudgetUsdMicros: 5_000_000,
  globallyPaused: true,
  keyVersion: 1,
  lastVerifiedAt: null,
  lastErrorCategory: null,
  createdAt: now,
  updatedAt: now,
};
interface TestState {
  user: { userId: string } | null;
  allowed: boolean;
  createVersion: ReturnType<typeof vi.fn>;
}
const state = vi.hoisted<TestState>(() => ({
  user: { userId: 'admin-1' },
  allowed: true,
  createVersion: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaAiProviderConfigurationRepository: class {
    listForAdmin() {
      return Promise.resolve(state.allowed ? [configuration] : null);
    }
    createVersion = state.createVersion;
  },
}));

import {
  createAiProviderConfigurationResponse,
  listAiProviderConfigurationsResponse,
} from '../src/http/ai-provider-configurations';
const request = (body?: unknown) =>
  new Request(
    'http://localhost/api/admin/ai-provider-configurations',
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { origin: 'http://localhost', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );

describe('AI provider configuration HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('ENCRYPTION_KEY', 'encryption-root-at-least-thirty-two-bytes');
    state.user = { userId: 'admin-1' };
    state.allowed = true;
    state.createVersion.mockResolvedValue(configuration);
  });

  it('requires authentication and hides unauthorized admins', async () => {
    state.user = null;
    expect((await listAiProviderConfigurationsResponse(request())).status).toBe(401);
    state.user = { userId: 'member-1' };
    state.allowed = false;
    expect((await listAiProviderConfigurationsResponse(request())).status).toBe(404);
  });

  it('creates a no-store draft without returning plaintext API keys', async () => {
    const response = await createAiProviderConfigurationResponse(
      request({
        provider: 'OPENAI',
        reason: '最初の設定を準備',
        model: 'gpt-5-mini',
        dailyBudgetUsd: 1,
        monthlyBudgetUsd: 5,
        apiKey: 'provider-secret-1234',
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain('provider-secret-1234');
    expect(state.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        dailyBudgetUsdMicros: 1_000_000,
        monthlyBudgetUsdMicros: 5_000_000,
        apiKey: expect.objectContaining({ encryptedValue: expect.any(String) }),
      }),
    );
  });

  it('accepts Creatomate without an AI model', async () => {
    const response = await createAiProviderConfigurationResponse(
      request({
        provider: 'CREATOMATE',
        reason: '動画サービスを準備',
        model: null,
        dailyBudgetUsd: 1,
        monthlyBudgetUsd: 5,
        requestCostUsd: 0,
        apiKey: 'creatomate-secret-1234',
      }),
    );
    expect(response.status).toBe(201);
    expect(state.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'CREATOMATE', model: null }),
    );
  });
});
