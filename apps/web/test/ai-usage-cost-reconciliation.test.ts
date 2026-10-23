import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  user: { userId: '11111111-1111-4111-8111-111111111111' },
  rows: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      provider: 'openai',
      taskType: 'DAILY_MISSION_PIPELINE',
      model: 'gpt-5-mini',
      status: 'FAILED',
      inputTokens: null,
      outputTokens: null,
      occurredAt: new Date('2026-10-18T03:30:47Z'),
    },
  ],
  repair: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaAiUsageCostReconciliationRepository: class {
    listUnknownCosts() {
      return Promise.resolve(state.rows);
    }
    repairUnknownCosts = state.repair;
  },
}));

import {
  listUnknownAiUsageCostsResponse,
  repairUnknownAiUsageCostsResponse,
} from '../src/http/ai-usage-cost-reconciliation';

const request = (body?: unknown) =>
  new Request(
    'http://localhost/api/admin/ai-usage-cost-reconciliation',
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { origin: 'http://localhost', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );

describe('AI usage cost reconciliation HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('ENCRYPTION_KEY', 'encryption-root-at-least-thirty-two-bytes');
    state.user = { userId: '11111111-1111-4111-8111-111111111111' };
    state.repair.mockResolvedValue({ scanned: 1, updated: 1, alreadyReconciled: 0 });
  });

  it('returns a body-free current-month preview', async () => {
    const response = await listUnknownAiUsageCostsResponse(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      data: { rows: [{ taskType: 'DAILY_MISSION_PIPELINE' }] },
    });
  });

  it('requires an explicit evidence reference for a repair', async () => {
    const response = await repairUnknownAiUsageCostsResponse(
      request({
        reason: '精算',
        evidenceReference: '',
        updates: [
          {
            usageEventId: '22222222-2222-4222-8222-222222222222',
            estimatedCostUsdMicros: 250,
            pricingVersion: 'provider-approved-v1',
          },
        ],
      }),
    );
    expect(response.status).toBe(400);
    expect(state.repair).not.toHaveBeenCalled();
  });

  it('passes approved repair values without exposing any secret', async () => {
    const response = await repairUnknownAiUsageCostsResponse(
      request({
        reason: '課金証跡を確認',
        evidenceReference: 'invoice:2026-10-openai',
        updates: [
          {
            usageEventId: '22222222-2222-4222-8222-222222222222',
            estimatedCostUsdMicros: 250,
            pricingVersion: 'provider-approved-v1',
          },
        ],
      }),
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain('api');
    expect(state.repair).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceReference: 'invoice:2026-10-openai' }),
    );
  });
});
