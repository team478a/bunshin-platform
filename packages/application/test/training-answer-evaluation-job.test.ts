import { describe, expect, it, vi } from 'vitest';
import {
  ExecuteTrainingAnswerEvaluationJob,
  TrainingAnswerEvaluationJobError,
  type Job,
  type TrainingAnswerEvaluationJobHandler,
} from '../src/index';

const job = {
  id: 'job-1',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  bunshinId: null,
  capabilityType: null,
  correlationId: 'correlation',
  requestedBy: '55555555-5555-4555-8555-555555555555',
  environment: 'PRODUCTION',
  jobType: 'TRAINING_ANSWER_EVALUATE',
  idempotencyKey: 'training-evaluation-1',
  payloadReference:
    'training-evaluation:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333:44444444-4444-4444-8444-444444444444:55555555-5555-4555-8555-555555555555',
  priority: 40,
  maxAttempts: 3,
  status: 'LEASED',
  scheduledAt: new Date(),
  attemptCount: 1,
  leaseOwner: 'worker',
  leaseExpiresAt: new Date(),
  nextRetryAt: null,
  lastErrorCategory: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Job;

describe('ExecuteTrainingAnswerEvaluationJob', () => {
  it('passes only the scoped reference to the handler and completes', async () => {
    const execute = vi.fn();
    const completeExecute = vi.fn().mockResolvedValue({ ...job, status: 'SUCCEEDED' });
    await new ExecuteTrainingAnswerEvaluationJob(
      { execute, markFailed: vi.fn() },
      { execute: completeExecute } as never,
      { execute: vi.fn() } as never,
    ).execute(job, 'worker');

    expect(execute).toHaveBeenCalledWith({
      workspaceId: job.workspaceId,
      groupId: '22222222-2222-4222-8222-222222222222',
      enrollmentId: '33333333-3333-4333-8333-333333333333',
      answerId: '44444444-4444-4444-8444-444444444444',
      actorUserId: '55555555-5555-4555-8555-555555555555',
      jobId: 'job-1',
      attemptCount: 1,
    });
    expect(completeExecute).toHaveBeenCalledWith(job.id, 'worker');
  });

  it('schedules a retry for a transient provider failure', async () => {
    const markFailed = vi.fn();
    const handler: TrainingAnswerEvaluationJobHandler = {
      execute: vi
        .fn()
        .mockRejectedValue(
          new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_PROVIDER_ERROR', true),
        ),
      markFailed,
    };
    const failExecute = vi.fn().mockResolvedValue({ ...job, status: 'RETRY_SCHEDULED' });
    await new ExecuteTrainingAnswerEvaluationJob(
      handler,
      { execute: vi.fn() } as never,
      { execute: failExecute } as never,
    ).execute(job, 'worker');

    expect(failExecute).toHaveBeenCalledWith(
      job,
      'worker',
      expect.objectContaining({ retryable: true }),
    );
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('marks the answer failed only after the job becomes dead', async () => {
    const markFailed = vi.fn();
    const handler: TrainingAnswerEvaluationJobHandler = {
      execute: vi.fn().mockRejectedValue(new Error('provider unavailable')),
      markFailed,
    };
    const failExecute = vi.fn().mockResolvedValue({ ...job, status: 'DEAD' });
    await new ExecuteTrainingAnswerEvaluationJob(
      handler,
      { execute: vi.fn() } as never,
      { execute: failExecute } as never,
    ).execute(job, 'worker');

    expect(markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        answerId: '44444444-4444-4444-8444-444444444444',
        errorCode: 'TRAINING_EVALUATION_PROVIDER_ERROR',
      }),
    );
  });
});
