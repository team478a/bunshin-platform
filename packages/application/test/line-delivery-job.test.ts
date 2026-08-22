/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import { CompleteJob, ExecuteLineDeliveryJob, FailJob, type Job, type JobRepository } from '../src';

const now = new Date('2026-08-22T06:00:00Z');
const deliveryId = '77d8baef-d7de-48d7-975e-c7c0ea4c81bf';
const job: Job = {
  id: 'job-1',
  environment: 'PRODUCTION',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  capabilityType: 'SOCIAL',
  correlationId: 'correlation-1',
  requestedBy: 'user-1',
  jobType: 'LINE_MISSION_DELIVER',
  payloadReference: `line-delivery:${deliveryId}`,
  idempotencyKey: `line-delivery:${deliveryId}`,
  status: 'LEASED',
  priority: 50,
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

function repository(): JobRepository {
  return {
    enqueue: vi.fn(),
    claim: vi.fn(),
    complete: vi.fn().mockResolvedValue({ ...job, status: 'SUCCEEDED' }),
    fail: vi.fn((input) =>
      Promise.resolve({
        ...job,
        status: input.nextRetryAt ? ('RETRY_SCHEDULED' as const) : ('DEAD' as const),
        lastErrorCategory: input.failure.errorCategory,
      }),
    ),
    cancel: vi.fn(),
  };
}

describe('LINE delivery job', () => {
  it('completes a sent delivery job with the scoped opaque delivery reference', async () => {
    const jobs = repository();
    const handler = { execute: vi.fn().mockResolvedValue({ status: 'SENT', warning: false }) };
    await expect(
      new ExecuteLineDeliveryJob(
        handler,
        new CompleteJob(jobs, () => now),
        new FailJob(jobs),
      ).execute(job, 'worker-1'),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(handler.execute).toHaveBeenCalledWith({ job, deliveryId, workerId: 'worker-1' });
  });

  it('schedules retry only for retryable provider outcomes', async () => {
    const jobs = repository();
    const handler = {
      execute: vi.fn().mockResolvedValue({
        status: 'FAILED',
        category: 'RATE_LIMITED',
        retryable: true,
      }),
    };
    await expect(
      new ExecuteLineDeliveryJob(
        handler,
        new CompleteJob(jobs),
        new FailJob(jobs, () => now),
      ).execute(job, 'worker-1'),
    ).resolves.toMatchObject({ status: 'RETRY_SCHEDULED', lastErrorCategory: 'RATE_LIMITED' });
  });

  it('finishes a non-retryable cancellation without retrying the provider', async () => {
    const jobs = repository();
    const handler = {
      execute: vi.fn().mockResolvedValue({
        status: 'CANCELLED',
        category: 'GLOBALLY_PAUSED',
        retryable: false,
      }),
    };
    await expect(
      new ExecuteLineDeliveryJob(handler, new CompleteJob(jobs), new FailJob(jobs)).execute(
        job,
        'worker-1',
      ),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(jobs.fail).not.toHaveBeenCalled();
  });

  it('rejects an unscoped or malformed delivery job before invoking its handler', async () => {
    const jobs = repository();
    const handler = { execute: vi.fn() };
    await expect(
      new ExecuteLineDeliveryJob(
        handler,
        new CompleteJob(jobs),
        new FailJob(jobs, () => now),
      ).execute(
        { ...job, workspaceId: 'workspace-other', payloadReference: 'line-delivery:not-a-uuid' },
        'worker-1',
      ),
    ).resolves.toMatchObject({ status: 'DEAD', lastErrorCategory: 'INVALID_LINE_DELIVERY_JOB' });
    expect(handler.execute).not.toHaveBeenCalled();
  });
});
