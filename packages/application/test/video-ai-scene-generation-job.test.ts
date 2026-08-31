import { describe, expect, it, vi } from 'vitest';
import {
  ExecuteVideoAiSceneGenerationJob,
  VIDEO_AI_SCENE_GENERATION_JOB_TYPE,
  type CompleteJob,
  type FailJob,
  type Job,
  type VideoAiSceneGenerationJobHandler,
} from '../src';

const id = '11111111-1111-4111-8111-111111111111';
const job = (overrides: Partial<Job> = {}) =>
  ({
    id,
    workspaceId: id,
    jobType: VIDEO_AI_SCENE_GENERATION_JOB_TYPE,
    payloadReference: `video-ai-scene:${id}`,
    ...overrides,
  }) as Job;

describe('individual AI video scene job', () => {
  it('retries a provider request that is still generating without creating another request', async () => {
    const execute = vi.fn().mockResolvedValue({ status: 'GENERATING' });
    const markFailed = vi.fn();
    const completeExecute = vi.fn();
    const failExecute = vi.fn().mockResolvedValue({ status: 'RETRYABLE_FAILURE' });
    const handler: VideoAiSceneGenerationJobHandler = {
      execute,
      markFailed,
    };
    const complete = { execute: completeExecute } as unknown as CompleteJob;
    const fail = { execute: failExecute } as unknown as FailJob;

    await new ExecuteVideoAiSceneGenerationJob(handler, complete, fail).execute(job(), 'worker');

    expect(execute).toHaveBeenCalledOnce();
    expect(completeExecute).not.toHaveBeenCalled();
    expect(failExecute).toHaveBeenCalledWith(
      expect.anything(),
      'worker',
      expect.objectContaining({ errorCategory: 'VIDEO_AI_SCENE_PENDING', retryable: true }),
    );
  });

  it('persists a terminal provider failure and completes the job', async () => {
    const execute = vi.fn().mockResolvedValue({ status: 'FAILED', errorCode: 'CONTENT_POLICY' });
    const markFailed = vi.fn();
    const completeExecute = vi.fn();
    const failExecute = vi.fn();
    const handler: VideoAiSceneGenerationJobHandler = {
      execute,
      markFailed,
    };
    const complete = { execute: completeExecute } as unknown as CompleteJob;
    const fail = { execute: failExecute } as unknown as FailJob;

    await new ExecuteVideoAiSceneGenerationJob(handler, complete, fail).execute(job(), 'worker');

    expect(markFailed).toHaveBeenCalledWith({
      workspaceId: id,
      generationId: id,
      errorCode: 'CONTENT_POLICY',
    });
    expect(completeExecute).toHaveBeenCalledWith(id, 'worker');
  });
});
