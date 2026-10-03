import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunJobWorkerBatch, type Job } from '@bunshin/application';
vi.mock('server-only', () => ({}));
import { jobWorkerResponse } from '../src/http/job-worker';

// Test-only ports, not a production stop guard, queue, or drain implementation.
const secret = 'synthetic-maintenance-rehearsal-secret';
const epoch = Date.parse('2026-10-04T00:00:00Z');
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
const job = (): Job => ({
  id: 'synthetic-job',
  environment: 'DEVELOPMENT',
  workspaceId: 'synthetic-workspace',
  requestedBy: 'synthetic-user',
  bunshinId: null,
  capabilityType: null,
  correlationId: 'synthetic',
  jobType: 'SYNTHETIC_TEST_JOB',
  payloadReference: 'synthetic',
  idempotencyKey: 'synthetic',
  status: 'LEASED',
  priority: 100,
  scheduledAt: new Date(epoch),
  attemptCount: 1,
  maxAttempts: 5,
  leaseOwner: 'synthetic-worker',
  leaseExpiresAt: new Date(epoch + 300_000),
  nextRetryAt: null,
  lastErrorCategory: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date(epoch),
  updatedAt: new Date(epoch),
});
function request(method = 'GET') {
  return new Request('http://localhost/api/internal/jobs/run', {
    method,
    headers: { authorization: `Bearer ${secret}` },
  });
}
const retention = () => Promise.resolve({ scheduled: 0, orphanedScopesDetected: false });
const expiration = () => Promise.resolve({ expire: () => Promise.resolve(0) });

beforeEach(() => {
  for (const [key, value] of Object.entries({
    NODE_ENV: 'test',
    APP_ENV: 'development',
    APP_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgres://synthetic-not-used',
    DIRECT_URL: 'postgres://synthetic-not-used',
    SESSION_SECRET: 'synthetic-session-secret-at-least-32-bytes',
    CRON_SECRET: secret,
  }))
    vi.stubEnv(key, value);
  vi.stubGlobal('fetch', () => {
    throw new Error('external communication forbidden in characterization');
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Feedback maintenance stop/drain characterization (not production readiness)', () => {
  it('characterization: authorized run GET and POST schedule retention before claiming without any schedule-route call', async () => {
    const events: string[] = [];
    const worker = new RunJobWorkerBatch(
      {
        execute: () => {
          events.push('claim');
          return Promise.resolve(null);
        },
      },
      {
        execute: () => {
          throw new Error('no job should be executed');
        },
      },
    );
    for (const method of ['GET', 'POST']) {
      const response = await jobWorkerResponse(
        request(method),
        () => Promise.resolve(worker),
        () =>
          Promise.resolve({
            expire: () => {
              events.push('expire');
              return Promise.resolve(0);
            },
          }),
        () =>
          Promise.resolve({
            schedule: () => {
              events.push('retention');
              return retention();
            },
          }),
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ drained: true, claimed: 0 });
    }
    expect(events).toEqual(['retention', 'claim', 'expire', 'retention', 'claim', 'expire']);
  });

  it('characterization: one empty batch reports drained while another executor remains active past its fixture lease', async () => {
    const entered = barrier();
    const finish = barrier();
    const savedJob = job();
    let now = epoch;
    let claims = 0;
    let activeExecutors = 0;
    let firstSettled = false;
    const worker = new RunJobWorkerBatch(
      { execute: () => Promise.resolve(++claims === 1 ? savedJob : null) },
      {
        execute: async (value) => {
          activeExecutors++;
          entered.release();
          await finish.promise;
          activeExecutors--;
          // Port result only. Not proof that a real DB accepts an expired lease commit.
          return { ...value, status: 'RETRY_SCHEDULED' as const };
        },
      },
      () => now,
    );
    const call = () =>
      jobWorkerResponse(
        request(),
        () => Promise.resolve(worker),
        expiration,
        () => Promise.resolve({ schedule: retention }),
      );
    const first = call().finally(() => {
      firstSettled = true;
    });
    try {
      await entered.promise;
      const second = await call();
      await expect(second.json()).resolves.toMatchObject({ drained: true, claimed: 0 });
      expect(activeExecutors).toBe(1);
      expect(firstSettled).toBe(false);
      now = epoch + 360_000;
      expect(savedJob.leaseExpiresAt!.getTime()).toBeLessThan(now);
      expect(activeExecutors).toBe(1);
      expect(firstSettled).toBe(false);
      expect(claims).toBe(2);
    } finally {
      finish.release();
      await first;
    }
    expect(activeExecutors).toBe(0);
    expect(firstSettled).toBe(true);
    expect(claims).toBe(2);
  });

  it('characterization: another request can report drained while retention is pending before any claim', async () => {
    const entered = barrier();
    const finish = barrier();
    let schedulingCalls = 0;
    let pendingRetention = 0;
    let claims = 0;
    const worker = new RunJobWorkerBatch(
      {
        execute: () => {
          claims++;
          return Promise.resolve(null);
        },
      },
      {
        execute: () => {
          throw new Error('no job should be executed');
        },
      },
    );
    const call = () =>
      jobWorkerResponse(
        request(),
        () => Promise.resolve(worker),
        expiration,
        () =>
          Promise.resolve({
            schedule: async () => {
              if (++schedulingCalls === 1) {
                pendingRetention++;
                entered.release();
                await finish.promise;
                pendingRetention--;
              }
              return retention();
            },
          }),
      );
    const first = call();
    try {
      await entered.promise;
      expect(claims).toBe(0);
      const second = await call();
      await expect(second.json()).resolves.toMatchObject({ drained: true, claimed: 0 });
      expect(claims).toBe(1);
      expect(pendingRetention).toBe(1);
    } finally {
      finish.release();
      await first;
    }
    expect(pendingRetention).toBe(0);
    expect(claims).toBe(2);
  });

  it('characterization: drained and HTTP200 coexist with an infrastructure failure and an unresolved fixture lease', async () => {
    const savedJob = job();
    let claims = 0;
    const worker = new RunJobWorkerBatch(
      { execute: () => Promise.resolve(++claims === 1 ? savedJob : null) },
      { execute: () => Promise.reject(new Error('synthetic infrastructure failure')) },
    );
    const response = await jobWorkerResponse(
      request(),
      () => Promise.resolve(worker),
      expiration,
      () => Promise.resolve({ schedule: retention }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      drained: true,
      claimed: 1,
      succeeded: 0,
      infrastructureFailures: 1,
    });
    expect(savedJob.status).toBe('LEASED');
    expect(savedJob.leaseOwner).toBe('synthetic-worker');
  });
});
