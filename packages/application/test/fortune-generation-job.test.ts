import { describe, expect, it, vi } from 'vitest';
import { ExecuteFortuneGenerationJob, FortuneGenerationJobError, type Job } from '../src';

const job = {
  id: 'job-a',
  workspaceId: 'workspace-a',
  bunshinId: 'bunshin-a',
  requestedBy: 'user-a',
  capabilityType: 'FORTUNE',
  jobType: 'FORTUNE_READING_GENERATE',
  payloadReference:
    'fortune-generation:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002',
  attemptCount: 1,
  maxAttempts: 3,
} as Job;

function setup() {
  const handler = { execute: vi.fn().mockResolvedValue(undefined) };
  const complete = { execute: vi.fn().mockResolvedValue({ ...job, status: 'SUCCEEDED' }) };
  const fail = { execute: vi.fn().mockResolvedValue({ ...job, status: 'DEAD' }) };
  return {
    handler,
    complete,
    fail,
    executor: new ExecuteFortuneGenerationJob(handler, complete as never, fail as never),
  };
}

describe('fortune job dispatch', () => {
  it('passes scoped references and the current worker lease without copying personal content', async () => {
    const test = setup();
    await test.executor.execute(job, 'worker-a');
    expect(test.handler.execute).toHaveBeenCalledWith({
      workspaceId: job.workspaceId,
      bunshinId: job.bunshinId,
      serviceSettingId: '00000000-0000-4000-8000-000000000001',
      readingId: '00000000-0000-4000-8000-000000000002',
      actorUserId: 'user-a',
      jobId: 'job-a',
      workerId: 'worker-a',
      attemptCount: 1,
      maxAttempts: 3,
    });
    expect(test.complete.execute).toHaveBeenCalledWith(job.id, 'worker-a');
  });

  it.each([
    { capabilityType: 'SOCIAL' },
    { bunshinId: null },
    { jobType: 'OTHER' },
    { payloadReference: job.payloadReference + ':extra' },
    {
      payloadReference:
        'fortune-generation:------------------------------------:------------------------------------',
    },
  ])('rejects invalid or foreign jobs: %o', async (patch) => {
    const test = setup();
    await test.executor.execute({ ...job, ...patch } as Job, 'worker-a');
    expect(test.handler.execute).not.toHaveBeenCalled();
    expect(test.fail.execute).toHaveBeenCalledWith(expect.anything(), 'worker-a', {
      errorCategory: 'INVALID_FORTUNE_JOB',
      retryable: false,
    });
  });

  it.each([true, false])('preserves the classified failure retryability: %s', async (retryable) => {
    const test = setup();
    test.handler.execute.mockRejectedValue(
      new FortuneGenerationJobError('FORTUNE_TEST', retryable),
    );
    await test.executor.execute(job, 'worker-a');
    expect(test.fail.execute).toHaveBeenCalledWith(job, 'worker-a', {
      errorCategory: 'FORTUNE_TEST',
      retryable,
    });
    expect(test.complete.execute).not.toHaveBeenCalled();
  });

  it('does not expose unknown infrastructure error contents', async () => {
    const test = setup();
    test.handler.execute.mockRejectedValue(new Error('sensitive details'));
    await test.executor.execute(job, 'worker-a');
    expect(test.fail.execute).toHaveBeenCalledWith(job, 'worker-a', {
      errorCategory: 'FORTUNE_INFRASTRUCTURE_ERROR',
      retryable: true,
    });
  });
});
