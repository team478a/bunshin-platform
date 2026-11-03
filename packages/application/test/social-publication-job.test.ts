import { describe, expect, it, vi } from 'vitest';
import {
  ExecuteSocialPublicationJob,
  SOCIAL_PUBLICATION_JOB_TYPE,
  SocialPublicationJobError,
} from '../src/social-publication-job';

const job = {
  id: 'job-1',
  environment: 'DEVELOPMENT' as const,
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  capabilityType: 'SOCIAL' as const,
  jobType: SOCIAL_PUBLICATION_JOB_TYPE,
  payloadReference: 'social-publication:00000000-0000-4000-8000-000000000001',
  idempotencyKey: 'publication-1',
  correlationId: 'request-1',
  requestedBy: 'user-1',
  status: 'LEASED' as const,
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
};

describe('ExecuteSocialPublicationJob', () => {
  it('completes a terminal or successfully published intent', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const complete = { execute: vi.fn().mockResolvedValue({ ...job, status: 'SUCCEEDED' }) };
    const fail = { execute: vi.fn() };
    await new ExecuteSocialPublicationJob(
      { execute, markFailed: vi.fn() },
      complete as never,
      fail as never,
    ).execute(job, 'worker-1');
    expect(execute).toHaveBeenCalledWith({
      workspaceId: job.workspaceId,
      intentId: '00000000-0000-4000-8000-000000000001',
      actorUserId: job.requestedBy,
      attemptCount: 1,
    });
    expect(complete.execute).toHaveBeenCalledWith(job.id, 'worker-1');
    expect(fail.execute).not.toHaveBeenCalled();
  });

  it('retries only classified pre-publish failures', async () => {
    const error = new SocialPublicationJobError('INSTAGRAM_CONTAINER_PROCESSING', true);
    const fail = {
      execute: vi.fn().mockResolvedValue({ ...job, status: 'RETRY_SCHEDULED' }),
    };
    const markFailed = vi.fn();
    await new ExecuteSocialPublicationJob(
      { execute: vi.fn().mockRejectedValue(error), markFailed },
      { execute: vi.fn() } as never,
      fail as never,
    ).execute(job, 'worker-1');
    expect(fail.execute).toHaveBeenCalledWith(job, 'worker-1', {
      errorCategory: error.category,
      retryable: true,
    });
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('marks terminal failures without accepting an invalid payload reference', async () => {
    const fail = { execute: vi.fn().mockResolvedValue({ ...job, status: 'DEAD' }) };
    const handler = { execute: vi.fn(), markFailed: vi.fn() };
    await new ExecuteSocialPublicationJob(
      handler,
      { execute: vi.fn() } as never,
      fail as never,
    ).execute({ ...job, payloadReference: 'token=secret' }, 'worker-1');
    expect(handler.execute).not.toHaveBeenCalled();
    expect(fail.execute).toHaveBeenCalledWith(
      expect.objectContaining({ payloadReference: 'token=secret' }),
      'worker-1',
      { errorCategory: 'UNSUPPORTED_SOCIAL_PUBLICATION_JOB', retryable: false },
    );
  });
});
