/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { jobWorkerResponse, type JobWorkerPort } from '../src/http/job-worker';

const secret = 'cron-secret-at-least-thirty-two-bytes';
const worker = (): JobWorkerPort => ({
  execute: vi.fn((input) =>
    Promise.resolve({
      environment: input.environment,
      claimed: 2,
      succeeded: 1,
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

describe('job worker HTTP boundary', () => {
  it('rejects missing and incorrect bearer secrets before constructing a worker', async () => {
    const factory = vi.fn(() => Promise.resolve(worker()));
    const missing = await jobWorkerResponse(
      new Request('http://localhost/api/internal/jobs/run', { method: 'POST' }),
      factory,
    );
    expect(missing.status).toBe(401);
    const wrong = await jobWorkerResponse(
      new Request('http://localhost/api/internal/jobs/run', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' },
      }),
      factory,
    );
    expect(wrong.status).toBe(401);
    expect(factory).not.toHaveBeenCalled();
  });

  it('derives environment and fixed batch size only from server configuration', async () => {
    const value = worker();
    const response = await jobWorkerResponse(
      new Request('http://localhost/api/internal/jobs/run?environment=PRODUCTION&batchSize=100', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      }),
      () => Promise.resolve(value),
    );
    expect(response.status).toBe(200);
    expect(value.execute).toHaveBeenCalledWith({
      environment: 'DEVELOPMENT',
      workerId: expect.stringMatching(/^http-/),
      batchSize: 5,
    });
    await expect(response.json()).resolves.toMatchObject({ claimed: 2, drained: true });
  });

  it('fails closed before claiming when production handlers are not configured', async () => {
    const response = await jobWorkerResponse(
      new Request('http://localhost/api/internal/jobs/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'CONFIGURATION_ERROR' },
    });
  });
});
