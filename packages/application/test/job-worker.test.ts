import { describe, expect, it, vi } from 'vitest';
import { RunJobWorkerBatch, type Job, type JobExecutor, type JobStatus } from '../src';

const job = (id: string): Job => ({
  id,
  environment: 'DEVELOPMENT',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  capabilityType: 'SOCIAL',
  correlationId: 'correlation-1',
  requestedBy: 'user-1',
  jobType: 'DAILY_MISSION_GENERATE',
  payloadReference: 'daily-mission:2026-08-24',
  idempotencyKey: id,
  status: 'LEASED',
  priority: 100,
  scheduledAt: new Date(),
  attemptCount: 1,
  maxAttempts: 5,
  leaseOwner: 'worker-1',
  leaseExpiresAt: new Date(Date.now() + 60_000),
  nextRetryAt: null,
  lastErrorCategory: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('RunJobWorkerBatch', () => {
  it('drains a bounded environment-specific batch and aggregates outcomes', async () => {
    const queue = [job('1'), job('2'), job('3')];
    const claims = {
      execute: vi.fn(() => Promise.resolve(queue.shift() ?? null)),
    };
    const results: JobStatus[] = ['SUCCEEDED', 'RETRY_SCHEDULED', 'DEAD'];
    const executor: JobExecutor = {
      execute: vi.fn((value) => Promise.resolve({ ...value, status: results.shift()! })),
    };
    const summary = await new RunJobWorkerBatch(claims, executor).execute({
      environment: 'DEVELOPMENT',
      workerId: 'worker-1',
      batchSize: 5,
    });
    expect(summary).toEqual({
      environment: 'DEVELOPMENT',
      claimed: 3,
      succeeded: 1,
      retryScheduled: 1,
      dead: 1,
      infrastructureFailures: 0,
      drained: true,
    });
    expect(claims.execute).toHaveBeenCalledWith('DEVELOPMENT', 'worker-1');
  });

  it('stops at the requested batch limit', async () => {
    const claims = { execute: vi.fn(() => Promise.resolve(job('next'))) };
    const executor: JobExecutor = {
      execute: vi.fn((value) => Promise.resolve({ ...value, status: 'SUCCEEDED' })),
    };
    const summary = await new RunJobWorkerBatch(claims, executor).execute({
      environment: 'PRODUCTION',
      workerId: 'worker-1',
      batchSize: 2,
    });
    expect(summary).toMatchObject({ claimed: 2, succeeded: 2, drained: false });
  });

  it('continues after an infrastructure failure and enforces maximum batch size', async () => {
    const queue = [job('1'), job('2')];
    const claims = { execute: vi.fn(() => Promise.resolve(queue.shift() ?? null)) };
    const executor: JobExecutor = {
      execute: vi
        .fn()
        .mockRejectedValueOnce(new Error('connection lost'))
        .mockImplementation((value: Job) =>
          Promise.resolve({ ...value, status: 'SUCCEEDED' as const }),
        ),
    };
    const worker = new RunJobWorkerBatch(claims, executor);
    await expect(
      worker.execute({ environment: 'DEVELOPMENT', workerId: 'worker-1', batchSize: 11 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      worker.execute({ environment: 'DEVELOPMENT', workerId: 'worker-1', batchSize: 5 }),
    ).resolves.toMatchObject({
      claimed: 2,
      succeeded: 1,
      infrastructureFailures: 1,
      drained: true,
    });
  });
});
