import { FortunePolicyError } from '@bunshin/capability-fortune';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({
  user: null as { userId: string } | null,
  join: vi.fn(),
  today: vi.fn(),
  draw: vi.fn(),
  history: vi.fn(),
  reading: vi.fn(),
  delete: vi.fn(),
  recordUse: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('../src/fortune/runtime', () => ({
  fortuneDailyReadingService: () => Promise.resolve(state),
}));
vi.mock('../src/services/service-membership', () => ({
  recordServiceUse: state.recordUse,
}));

import {
  drawFortuneResponse,
  getFortuneTodayResponse,
  joinFortuneResponse,
} from '../src/http/fortune';

const request = (path: string, init?: RequestInit) =>
  new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: { origin: 'http://localhost:3000', ...init?.headers },
  });

describe('fortune HTTP contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    state.user = { userId: 'user-1' };
    state.today.mockResolvedValue({ participant: null, reading: null });
    state.join.mockResolvedValue({
      id: 'participant-1',
      ageConfirmedAt: new Date(),
    });
    state.draw.mockResolvedValue({ id: 'reading-1' });
    state.recordUse.mockResolvedValue({ id: 'membership-1' });
  });

  it('requires authentication for reads', async () => {
    state.user = null;
    expect(
      (await getFortuneTodayResponse(request('/api/services/fortune/today'), 'fortune')).status,
    ).toBe(401);
  });

  it('records service-scoped use before returning a reading', async () => {
    const response = await getFortuneTodayResponse(
      request('/api/services/fortune/today'),
      'fortune',
    );
    expect(response.status).toBe(200);
    expect(state.recordUse).toHaveBeenCalledWith('fortune', 'user-1');
  });

  it('requires an explicit age confirmation and rejects authority fields', async () => {
    for (const body of [{ ageConfirmed: false }, { ageConfirmed: true, actorUserId: 'attacker' }]) {
      const response = await joinFortuneResponse(
        request('/api/services/fortune/participation', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        'fortune',
      );
      expect(response.status).toBe(400);
    }
    expect(state.join).not.toHaveBeenCalled();
  });

  it('accepts only approved themes and maps missing approved knowledge to unavailable', async () => {
    const invalid = await drawFortuneResponse(
      request('/api/services/fortune/today', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme: 'MONEY' }),
      }),
      'fortune',
    );
    expect(invalid.status).toBe(400);
    state.draw.mockRejectedValueOnce(new FortunePolicyError('KNOWLEDGE_NOT_READY', 'not ready'));
    const unavailable = await drawFortuneResponse(
      request('/api/services/fortune/today', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme: 'WORK' }),
      }),
      'fortune',
    );
    expect(unavailable.status).toBe(503);
  });
});
