import { describe, expect, it, vi } from 'vitest';
import {
  ClaimSocialImageGenerationExecution,
  ExecuteSocialImageGenerationJob,
  SOCIAL_IMAGE_GENERATION_JOB_TYPE,
  SocialImageGenerationJobHandlerError,
  type Job,
} from '../src';

const job = {
  id: 'job-1',
  environment: 'PRODUCTION',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  bunshinId: null,
  capabilityType: null,
  jobType: SOCIAL_IMAGE_GENERATION_JOB_TYPE,
  payloadReference: 'social-image:00000000-0000-4000-8000-000000000002',
  idempotencyKey: 'social-image:00000000-0000-4000-8000-000000000002',
  correlationId: 'request-1',
  requestedBy: '00000000-0000-4000-8000-000000000003',
  status: 'LEASED',
  priority: 40,
  maxAttempts: 3,
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
} satisfies Job;

describe('ExecuteSocialImageGenerationJob', () => {
  it('completes only after the handler succeeds', async () => {
    const handler = { execute: vi.fn(), markFailed: vi.fn() };
    const complete = { execute: vi.fn().mockResolvedValue({ ...job, status: 'SUCCEEDED' }) };
    const fail = { execute: vi.fn() };
    await new ExecuteSocialImageGenerationJob(handler, complete as never, fail as never).execute(
      job,
      'worker-1',
    );
    expect(handler.execute).toHaveBeenCalledWith({
      workspaceId: job.workspaceId,
      requestId: '00000000-0000-4000-8000-000000000002',
      attemptCount: 1,
    });
    expect(complete.execute).toHaveBeenCalledWith(job.id, 'worker-1');
    expect(fail.execute).not.toHaveBeenCalled();
  });

  it('retries temporary provider failures without exposing provider details', async () => {
    const handler = {
      execute: vi
        .fn()
        .mockRejectedValue(new SocialImageGenerationJobHandlerError('OPENAI_RATE_LIMIT', true)),
      markFailed: vi.fn(),
    };
    const fail = {
      execute: vi.fn().mockResolvedValue({ ...job, status: 'RETRY_SCHEDULED' }),
    };
    await new ExecuteSocialImageGenerationJob(
      handler,
      { execute: vi.fn() } as never,
      fail as never,
    ).execute(job, 'worker-1');
    expect(fail.execute).toHaveBeenCalledWith(job, 'worker-1', {
      errorCategory: 'OPENAI_RATE_LIMIT',
      retryable: true,
    });
    expect(handler.markFailed).not.toHaveBeenCalled();
  });

  it('marks the request failed only when retries are exhausted', async () => {
    const handler = {
      execute: vi.fn().mockRejectedValue(new Error('secret provider response')),
      markFailed: vi.fn(),
    };
    const fail = { execute: vi.fn().mockResolvedValue({ ...job, status: 'DEAD' }) };
    await new ExecuteSocialImageGenerationJob(
      handler,
      { execute: vi.fn() } as never,
      fail as never,
    ).execute(job, 'worker-1');
    expect(fail.execute).toHaveBeenCalledWith(job, 'worker-1', {
      errorCategory: 'SOCIAL_IMAGE_UNEXPECTED',
      retryable: true,
    });
    expect(handler.markFailed).toHaveBeenCalledWith({
      workspaceId: job.workspaceId,
      requestId: '00000000-0000-4000-8000-000000000002',
      errorCode: 'SOCIAL_IMAGE_UNEXPECTED',
    });
  });
});

describe('ClaimSocialImageGenerationExecution', () => {
  it('uses UTC day and month boundaries and fails closed on a stopped pilot', async () => {
    const claim = vi.fn().mockResolvedValue({ allowed: false, reason: 'PILOT_STOPPED' });
    const now = new Date('2026-08-28T23:30:00.000Z');
    await expect(
      new ClaimSocialImageGenerationExecution({ claim } as never, () => now).execute({
        workspaceId: job.workspaceId,
        requestId: '00000000-0000-4000-8000-000000000002',
      }),
    ).rejects.toMatchObject({ category: 'SOCIAL_IMAGE_PILOT_STOPPED', retryable: false });
    expect(claim).toHaveBeenCalledWith({
      workspaceId: job.workspaceId,
      requestId: '00000000-0000-4000-8000-000000000002',
      now,
      dailyFrom: new Date('2026-08-28T00:00:00.000Z'),
      monthlyFrom: new Date('2026-08-01T00:00:00.000Z'),
    });
  });
});
