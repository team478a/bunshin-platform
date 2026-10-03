/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  jobWorkerResponse,
  type JobWorkerPort,
  type ServiceCreditExpirationPort,
  type FeedbackRetentionSchedulingPort,
} from '../src/http/job-worker';

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

const expiration = (expired = 0): ServiceCreditExpirationPort => ({
  expire: vi.fn(() => Promise.resolve(expired)),
});

const retention = (): FeedbackRetentionSchedulingPort => ({
  schedule: vi.fn(() => Promise.resolve({ scheduled: 2, orphanedScopesDetected: false })),
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
      () => Promise.resolve(expiration()),
      () => Promise.resolve(retention()),
    );
    expect(missing.status).toBe(401);
    const wrong = await jobWorkerResponse(
      new Request('http://localhost/api/internal/jobs/run', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' },
      }),
      factory,
      () => Promise.resolve(expiration()),
      () => Promise.resolve(retention()),
    );
    expect(wrong.status).toBe(401);
    expect(factory).not.toHaveBeenCalled();
  });

  it('derives environment and fixed batch size only from server configuration', async () => {
    const value = worker();
    const scheduler = retention();
    const response = await jobWorkerResponse(
      new Request('http://localhost/api/internal/jobs/run?environment=PRODUCTION&batchSize=100', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      }),
      () => Promise.resolve(value),
      () => Promise.resolve(expiration(3)),
      () => Promise.resolve(scheduler),
    );
    expect(response.status).toBe(200);
    expect(scheduler.schedule).toHaveBeenCalledWith('DEVELOPMENT');
    expect(value.execute).toHaveBeenCalledWith({
      environment: 'DEVELOPMENT',
      workerId: expect.stringMatching(/^http-/),
      batchSize: 5,
    });
    await expect(response.json()).resolves.toMatchObject({
      claimed: 2,
      drained: true,
      expiredServiceCredits: 3,
      scheduledFeedbackRetentionJobs: 2,
      feedbackRetentionOrphanedScopesDetected: false,
    });
  });

  it('maps worker failures without exposing authorization secrets', async () => {
    const response = await jobWorkerResponse(
      new Request('http://localhost/api/internal/jobs/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      }),
      () =>
        Promise.resolve({
          execute: () => Promise.reject(new Error(`database failed ${secret}`)),
        }),
      () => Promise.resolve(expiration()),
      () => Promise.resolve(retention()),
    );
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain('INTERNAL_ERROR');
    expect(body).not.toContain(secret);
  });

  it('reports retention scheduling failure without blocking ordinary Jobs or leaking errors', async () => {
    const value = worker();
    const response = await jobWorkerResponse(
      new Request('http://localhost/api/internal/jobs/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      }),
      () => Promise.resolve(value),
      () => Promise.resolve(expiration()),
      () => Promise.reject(new Error(`private failure ${secret}`)),
    );
    expect(response.status).toBe(200);
    expect(value.execute).toHaveBeenCalledOnce();
    const body = await response.text();
    expect(body).toContain('"feedbackRetentionSchedulingFailed":true');
    expect(body).toContain('"scheduledFeedbackRetentionJobs":null');
    expect(body).toContain('"feedbackRetentionOrphanedScopesDetected":null');
    expect(body).not.toContain(secret);
    expect(body).not.toContain('private failure');
  });

  it('does not construct or invoke retention scheduling before Cron authorization', async () => {
    const factory = vi.fn(() => Promise.resolve(retention()));
    const response = await jobWorkerResponse(
      new Request('http://localhost/api/internal/jobs/run'),
      () => Promise.resolve(worker()),
      () => Promise.resolve(expiration()),
      factory,
    );
    expect(response.status).toBe(401);
    expect(factory).not.toHaveBeenCalled();
  });

  it('reports orphan presence only through authenticated Cron without forwarding identities or counts', async () => {
    const value = worker();
    const scheduler = {
      schedule: vi.fn(() =>
        Promise.resolve({
          scheduled: 0,
          orphanedScopesDetected: true,
          workspaceId: 'private-workspace',
          serviceId: 'private-service',
          userId: 'private-user',
          rawCount: 123,
          sourceIds: ['private-source'],
        }),
      ),
    };
    const response = await jobWorkerResponse(
      new Request('http://localhost/api/internal/jobs/run', {
        headers: { authorization: `Bearer ${secret}` },
      }),
      () => Promise.resolve(value),
      () => Promise.resolve(expiration()),
      () => Promise.resolve(scheduler),
    );
    expect(response.status).toBe(200);
    expect(value.execute).toHaveBeenCalledOnce();
    const body = await response.text();
    expect(body).toContain('"feedbackRetentionOrphanedScopesDetected":true');
    expect(body).toContain('"feedbackRetentionSchedulingFailed":false');
    expect(body).not.toMatch(/private-|sourceIds|rawCount/);
  });
});
