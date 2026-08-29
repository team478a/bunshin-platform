import { describe, expect, it, vi } from 'vitest';
import { ExecuteBadgeLineDeliveryJob, ScheduleBadgeLineDeliveryJobs, type Job } from '../src';

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    environment: 'PRODUCTION',
    workspaceId: 'workspace-1',
    bunshinId: null,
    capabilityType: null,
    correlationId: 'badge-line:delivery-1',
    requestedBy: 'user-1',
    jobType: 'BADGE_LINE_DELIVER',
    idempotencyKey: 'badge-line-delivery:PRODUCTION:delivery-1',
    payloadReference: 'badge-line-delivery:11111111-1111-4111-8111-111111111111',
    priority: 60,
    maxAttempts: 3,
    status: 'LEASED',
    scheduledAt: new Date(),
    attemptCount: 1,
    leaseOwner: 'worker-1',
    leaseExpiresAt: new Date(),
    nextRetryAt: null,
    lastErrorCategory: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('badge LINE delivery jobs', () => {
  it('enqueues each pending delivery with an environment-scoped idempotency key', async () => {
    const enqueue = vi.fn().mockResolvedValue({ id: 'job-1' });
    const result = await new ScheduleBadgeLineDeliveryJobs(
      {
        listPending: vi
          .fn()
          .mockResolvedValue([
            { deliveryId: 'delivery-1', workspaceId: 'workspace-1', userId: 'user-1' },
          ]),
      },
      { enqueue },
    ).execute('PRODUCTION');
    expect(result).toEqual({ candidates: 1, enqueued: 1, truncated: false });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'BADGE_LINE_DELIVER',
        idempotencyKey: 'badge-line-delivery:PRODUCTION:delivery-1',
      }),
    );
  });

  it('completes a sent delivery job', async () => {
    const complete = { execute: vi.fn().mockResolvedValue({ status: 'SUCCEEDED' }) };
    const fail = { execute: vi.fn() };
    const executor = new ExecuteBadgeLineDeliveryJob(
      { execute: vi.fn().mockResolvedValue({ status: 'SENT', warning: false }) },
      complete as never,
      fail as never,
    );
    await executor.execute(job(), 'worker-1');
    expect(complete.execute).toHaveBeenCalledWith('job-1', 'worker-1');
    expect(fail.execute).not.toHaveBeenCalled();
  });

  it('schedules retry for a retryable provider failure', async () => {
    const complete = { execute: vi.fn() };
    const fail = { execute: vi.fn().mockResolvedValue({ status: 'RETRY_SCHEDULED' }) };
    const executor = new ExecuteBadgeLineDeliveryJob(
      {
        execute: vi.fn().mockResolvedValue({
          status: 'FAILED',
          category: 'TIMEOUT',
          retryable: true,
        }),
      },
      complete as never,
      fail as never,
    );
    await executor.execute(job(), 'worker-1');
    expect(fail.execute).toHaveBeenCalledWith(
      expect.anything(),
      'worker-1',
      expect.objectContaining({ errorCategory: 'TIMEOUT', retryable: true }),
    );
  });
});
