/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import {
  CancelJob,
  ClaimJob,
  CompleteJob,
  EnqueueJob,
  FailJob,
  type Job,
  type JobRepository,
} from '../src';

const now = new Date('2026-08-22T00:00:00.000Z');
const job: Job = {
  id: 'job-1',
  environment: 'PRODUCTION',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  capabilityType: 'SOCIAL',
  correlationId: 'correlation-1',
  requestedBy: 'user-1',
  jobType: 'DAILY_MISSION_GENERATE',
  payloadReference: 'daily-mission:2026-08-22',
  idempotencyKey: 'mission:bunshin-1:2026-08-22',
  status: 'LEASED',
  priority: 100,
  scheduledAt: now,
  attemptCount: 1,
  maxAttempts: 5,
  leaseOwner: 'worker-1',
  leaseExpiresAt: new Date(now.getTime() + 60_000),
  nextRetryAt: null,
  lastErrorCategory: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: now,
  updatedAt: now,
};

const repository = (): JobRepository => ({
  enqueue: vi.fn(() => Promise.resolve(job)),
  claim: vi.fn(() => Promise.resolve(job)),
  complete: vi.fn(() => Promise.resolve({ ...job, status: 'SUCCEEDED' as const })),
  fail: vi.fn((input) =>
    Promise.resolve({
      ...job,
      status: input.nextRetryAt ? ('RETRY_SCHEDULED' as const) : ('DEAD' as const),
      nextRetryAt: input.nextRetryAt,
    }),
  ),
  cancel: vi.fn(() => Promise.resolve({ ...job, status: 'CANCELLED' as const })),
});

describe('Job Core', () => {
  it('validates enqueue metadata and delegates idempotent persistence', async () => {
    const repo = repository();
    const service = new EnqueueJob(repo);
    const input = {
      environment: 'PRODUCTION' as const,
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      capabilityType: 'SOCIAL' as const,
      correlationId: 'correlation-1',
      requestedBy: 'user-1',
      jobType: 'DAILY_MISSION_GENERATE',
      payloadReference: 'daily-mission:2026-08-22',
      idempotencyKey: 'mission:bunshin-1:2026-08-22',
    };
    await expect(service.enqueue(input)).resolves.toEqual({ id: 'job-1' });
    expect(repo.enqueue).toHaveBeenCalledWith(input);
    await expect(service.enqueue({ ...input, payloadReference: '' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('claims only within the requested environment and creates a bounded lease', async () => {
    const repo = repository();
    await new ClaimJob(repo, 60_000, () => now).execute('STAGING', 'worker-1');
    expect(repo.claim).toHaveBeenCalledWith({
      environment: 'STAGING',
      workerId: 'worker-1',
      now,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    });
  });

  it('uses exponential backoff for retryable failures', async () => {
    const repo = repository();
    const result = await new FailJob(repo, () => now, 30_000, 3_600_000).execute(
      { ...job, attemptCount: 3 },
      'worker-1',
      { errorCategory: 'PROVIDER_TEMPORARY', retryable: true },
    );
    expect(result.status).toBe('RETRY_SCHEDULED');
    expect(repo.fail).toHaveBeenCalledWith(
      expect.objectContaining({ nextRetryAt: new Date(now.getTime() + 120_000) }),
    );
  });

  it('marks non-retryable or exhausted work dead', async () => {
    const repo = repository();
    await new FailJob(repo, () => now).execute({ ...job, attemptCount: 5 }, 'worker-1', {
      errorCategory: 'INVALID_PAYLOAD',
      retryable: true,
    });
    expect(repo.fail).toHaveBeenCalledWith(expect.objectContaining({ nextRetryAt: null }));
  });

  it('rejects completion when the lease is no longer owned', async () => {
    const repo = repository();
    vi.mocked(repo.complete).mockResolvedValue(null);
    await expect(
      new CompleteJob(repo, () => now).execute('job-1', 'other-worker'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('keeps cancellation environment-scoped', async () => {
    const repo = repository();
    await new CancelJob(repo, () => now).execute('job-1', 'DEVELOPMENT');
    expect(repo.cancel).toHaveBeenCalledWith({
      jobId: 'job-1',
      environment: 'DEVELOPMENT',
      now,
    });
  });
});
