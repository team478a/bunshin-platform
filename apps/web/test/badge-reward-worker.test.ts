/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  badgeRewardWorkerResponse,
  type BadgeRewardWorkerPort,
} from '../src/http/badge-reward-worker';

const secret = 'cron-secret-at-least-thirty-two-bytes';
const worker = (): BadgeRewardWorkerPort => ({
  execute: vi.fn(() =>
    Promise.resolve({
      claimed: 2,
      completed: 1,
      retryScheduled: 1,
      dead: 0,
      infrastructureFailures: 0,
      drained: true,
    }),
  ),
});

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  vi.stubEnv('CRON_SECRET', secret);
});

describe('badge reward worker HTTP boundary', () => {
  it('rejects missing credentials before constructing the worker', async () => {
    const factory = vi.fn(() => Promise.resolve(worker()));
    const response = await badgeRewardWorkerResponse(
      new Request('http://localhost/api/internal/badge-rewards/run', { method: 'POST' }),
      factory,
    );
    expect(response.status).toBe(401);
    expect(factory).not.toHaveBeenCalled();
  });

  it('uses a server-fixed batch and returns aggregate counts only', async () => {
    const value = worker();
    const response = await badgeRewardWorkerResponse(
      new Request('http://localhost/api/internal/badge-rewards/run?batchSize=100', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      }),
      () => Promise.resolve(value),
    );
    expect(response.status).toBe(200);
    expect(value.execute).toHaveBeenCalledWith({
      workerId: expect.stringMatching(/^badge-reward-/),
      batchSize: 5,
    });
    await expect(response.json()).resolves.toMatchObject({ completed: 1, retryScheduled: 1 });
  });

  it('does not expose internal error messages', async () => {
    const response = await badgeRewardWorkerResponse(
      new Request('http://localhost/api/internal/badge-rewards/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      }),
      () => Promise.resolve({ execute: () => Promise.reject(new Error(`failed ${secret}`)) }),
    );
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).toContain('INTERNAL_ERROR');
    expect(body).not.toContain(secret);
  });
});
