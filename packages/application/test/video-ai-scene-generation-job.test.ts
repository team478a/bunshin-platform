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
    const handler: VideoAiSceneGenerationJobHandler = {
      execute: vi.fn().mockResolvedValue({ status: 'GENERATING' }),
      markFailed: vi.fn(),
    };
    const complete = { execute: vi.fn() } as unknown as CompleteJob;
    const fail = {
      execute: vi.fn().mockResolvedValue({ status: 'RETRYABLE_FAILURE' }),
    } as unknown as FailJob;

    await new ExecuteVideoAiSceneGenerationJob(handler, complete, fail).execute(job(), 'worker');

    expect(handler.execute).toHaveBeenCalledOnce();
    expect(complete.execute).not.toHaveBeenCalled();
    expect(fail.execute).toHaveBeenCalledWith(
      expect.anything(),
      'worker',
      expect.objectContaining({ errorCategory: 'VIDEO_AI_SCENE_PENDING', retryable: true }),
    );
  });

  it('persists a terminal provider failure and completes the job', async () => {
    const handler: VideoAiSceneGenerationJobHandler = {
      execute: vi.fn().mockResolvedValue({ status: 'FAILED', errorCode: 'CONTENT_POLICY' }),
      markFailed: vi.fn(),
    };
    const complete = { execute: vi.fn() } as unknown as CompleteJob;
    const fail = { execute: vi.fn() } as unknown as FailJob;

    await new ExecuteVideoAiSceneGenerationJob(handler, complete, fail).execute(job(), 'worker');

    expect(handler.markFailed).toHaveBeenCalledWith({
      workspaceId: id,
      generationId: id,
      errorCode: 'CONTENT_POLICY',
    });
    expect(complete.execute).toHaveBeenCalledWith(id, 'worker');
  });
});
