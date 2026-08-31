import { ApplicationError } from '@bunshin/shared';
import type { CompleteJob, FailJob, Job } from './index';

export const VIDEO_AI_SCENE_GENERATION_JOB_TYPE = 'VIDEO_AI_SCENE_GENERATION_PROCESS';

export interface VideoAiSceneGenerationJobHandler {
  execute(input: { workspaceId: string; generationId: string }): Promise<{
    status: 'SUBMITTED' | 'GENERATING' | 'SUCCEEDED' | 'FAILED';
    errorCode?: string;
  }>;
  markFailed(input: {
    workspaceId: string;
    generationId: string;
    errorCode: string;
  }): Promise<void>;
}

export class VideoAiSceneGenerationJobHandlerError extends Error {
  constructor(
    readonly category: string,
    readonly retryable: boolean,
  ) {
    super(category);
  }
}

/**
 * The worker accepts a single scene at a time. It intentionally retries only pending provider
 * work; terminal provider failures are persisted once and do not cause a new paid request.
 */
export class ExecuteVideoAiSceneGenerationJob {
  constructor(
    private readonly handler: VideoAiSceneGenerationJobHandler,
    private readonly complete: CompleteJob,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string) {
    const reference = /^video-ai-scene:([0-9a-f-]{36})$/i.exec(job.payloadReference);
    if (job.jobType !== VIDEO_AI_SCENE_GENERATION_JOB_TYPE || !reference)
      return this.fail.execute(job, workerId, {
        errorCategory: 'UNSUPPORTED_VIDEO_AI_SCENE_JOB',
        retryable: false,
      });
    try {
      const result = await this.handler.execute({
        workspaceId: job.workspaceId,
        generationId: reference[1]!,
      });
      if (result.status === 'SUBMITTED' || result.status === 'GENERATING')
        return this.fail.execute(job, workerId, {
          errorCategory: 'VIDEO_AI_SCENE_PENDING',
          retryable: true,
        });
      if (result.status === 'FAILED') {
        await this.handler.markFailed({
          workspaceId: job.workspaceId,
          generationId: reference[1]!,
          errorCode: result.errorCode ?? 'PROVIDER_GENERATION_FAILED',
        });
      }
      return this.complete.execute(job.id, workerId);
    } catch (error) {
      const classified =
        error instanceof VideoAiSceneGenerationJobHandlerError
          ? error
          : error instanceof ApplicationError && error.code === 'CONFIGURATION_ERROR'
            ? new VideoAiSceneGenerationJobHandlerError('VIDEO_AI_CONFIGURATION', false)
            : new VideoAiSceneGenerationJobHandlerError('VIDEO_AI_SCENE_UNEXPECTED', true);
      const failed = await this.fail.execute(job, workerId, {
        errorCategory: classified.category,
        retryable: classified.retryable,
      });
      if (failed.status === 'DEAD')
        await this.handler.markFailed({
          workspaceId: job.workspaceId,
          generationId: reference[1]!,
          errorCode: classified.category,
        });
      return failed;
    }
  }
}
