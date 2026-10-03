import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import { ExecuteImprovementFeedbackRetentionJob, type Job } from '../src';

afterEach(() => vi.unstubAllGlobals());
describe('feedback retention Job execution boundary', () => {
  const job = { id: 'synthetic', attemptCount: 1, maxAttempts: 5 } as Job;
  it.each(['SUCCEEDED', 'RETRY_SCHEDULED'] as const)(
    'returns atomic repository outcome %s',
    async (status) => {
      vi.stubGlobal('fetch', () => {
        throw new Error('network forbidden');
      });
      const result = { ...job, status };
      const execute = vi.fn().mockResolvedValue(result);
      const fail = { execute: vi.fn() };
      expect(
        await new ExecuteImprovementFeedbackRetentionJob(
          { execute, schedule: vi.fn() },
          fail as never,
        ).execute(job, 'worker'),
      ).toBe(result);
      expect(execute).toHaveBeenCalledWith(job, 'worker');
      expect(fail.execute).not.toHaveBeenCalled();
    },
  );
  it('routes infrastructure errors through existing bounded failure policy', async () => {
    const fail = { execute: vi.fn().mockResolvedValue({ ...job, status: 'RETRY_SCHEDULED' }) };
    const repo = {
      execute: vi.fn().mockRejectedValue(new Error('private DB failure')),
      schedule: vi.fn(),
    };
    await new ExecuteImprovementFeedbackRetentionJob(repo, fail as never).execute(job, 'worker');
    expect(fail.execute).toHaveBeenCalledWith(job, 'worker', {
      errorCategory: 'FEEDBACK_RETENTION_FAILED',
      retryable: true,
    });
  });
  it('does not use a stale lease to fail another worker execution', async () => {
    const fail = { execute: vi.fn() };
    const repo = {
      execute: vi.fn().mockRejectedValue(new ApplicationError('CONFLICT', 'lease')),
      schedule: vi.fn(),
    };
    await expect(
      new ExecuteImprovementFeedbackRetentionJob(repo, fail as never).execute(job, 'old-worker'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fail.execute).not.toHaveBeenCalled();
  });
  it('does not retry malformed execution input', async () => {
    const fail = { execute: vi.fn().mockResolvedValue({ ...job, status: 'DEAD' }) };
    const repo = {
      execute: vi.fn().mockRejectedValue(new ApplicationError('VALIDATION_ERROR', 'payload')),
      schedule: vi.fn(),
    };
    await new ExecuteImprovementFeedbackRetentionJob(repo, fail as never).execute(job, 'worker');
    expect(fail.execute).toHaveBeenCalledWith(job, 'worker', {
      errorCategory: 'FEEDBACK_RETENTION_FAILED',
      retryable: false,
    });
  });
});
