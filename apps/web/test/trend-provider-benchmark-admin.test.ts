import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const state = vi.hoisted<{
  user: { userId: string } | null;
  admin: boolean;
  findCase: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  createCase: ReturnType<typeof vi.fn>;
}>(() => ({
  user: { userId: 'admin-1' },
  admin: true,
  findCase: vi.fn(),
  upsert: vi.fn(),
  createCase: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaPlatformAdminRepository: class {
    findActivePlatformAdminByUserId() {
      return Promise.resolve(state.admin ? { id: 'admin' } : null);
    }
  },
  prisma: {
    trendProviderBenchmarkCase: { create: state.createCase, findFirst: state.findCase },
    trendProviderBenchmarkObservation: { upsert: state.upsert },
  },
}));
import { saveTrendProviderBenchmarkResponse } from '../src/http/trend-provider-benchmark-admin';

const request = (body: unknown) =>
  new Request('http://localhost/api/admin/trend-provider-benchmark', {
    method: 'POST',
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const observation = (evidenceLines = 'https://example.com/topic | 2026-08-24') => ({
  action: 'SAVE_OBSERVATION',
  caseId: '11111111-1111-4111-8111-111111111111',
  provider: 'GROK',
  successful: true,
  evidenceLines,
  costUsd: 0.01,
  latencyMs: 800,
  relevanceRating: 4,
  sourceQualityRating: 4,
  notes: '',
});

describe('trend provider benchmark admin HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('ENCRYPTION_KEY', 'encryption-root-at-least-thirty-two-bytes');
    state.user = { userId: 'admin-1' };
    state.admin = true;
    state.findCase.mockResolvedValue({ id: observation().caseId });
    state.upsert.mockResolvedValue({ id: 'saved' });
    state.createCase.mockResolvedValue({ id: 'case' });
  });

  it('管理者だけが現在環境の比較結果を保存できる', async () => {
    const response = await saveTrendProviderBenchmarkResponse(request(observation()));
    expect(response.status).toBe(200);
    expect(state.findCase).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ environment: 'DEVELOPMENT' }) }),
    );
    expect(state.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ costUsdMicros: 10_000 }) }),
    );
    state.admin = false;
    expect((await saveTrendProviderBenchmarkResponse(request(observation()))).status).toBe(404);
  });

  it('危険なURLと重複URLを保存しない', async () => {
    expect(
      (await saveTrendProviderBenchmarkResponse(request(observation('http://example.com')))).status,
    ).toBe(400);
    expect(
      (
        await saveTrendProviderBenchmarkResponse(
          request(observation('https://example.com\nhttps://example.com')),
        )
      ).status,
    ).toBe(400);
    expect(state.upsert).not.toHaveBeenCalled();
  });
});
