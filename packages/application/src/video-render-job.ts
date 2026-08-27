import { ApplicationError } from '@bunshin/shared';
import type { CompleteJob, FailJob, Job } from './index';

export const VIDEO_RENDER_JOB_TYPE = 'VIDEO_RENDER_PROCESS';

export interface VideoRenderJobHandler {
  execute(input: { workspaceId: string; renderId: string }): Promise<{ status: string }>;
  markFailed(input: { workspaceId: string; renderId: string; errorCode: string }): Promise<void>;
}

export class VideoRenderJobHandlerError extends Error {
  constructor(
    readonly category: string,
    readonly retryable: boolean,
  ) {
    super(category);
  }
}

export class ExecuteVideoRenderJob {
  constructor(
    private readonly handler: VideoRenderJobHandler,
    private readonly complete: CompleteJob,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string) {
    const reference = /^video-render:([0-9a-f-]{36})$/.exec(job.payloadReference);
    if (job.jobType !== VIDEO_RENDER_JOB_TYPE || !reference)
      return this.fail.execute(job, workerId, {
        errorCategory: 'UNSUPPORTED_VIDEO_RENDER_JOB',
        retryable: false,
      });
    try {
      const result = await this.handler.execute({
        workspaceId: job.workspaceId,
        renderId: reference[1]!,
      });
      if (result.status === 'PENDING') {
        const failedJob = await this.fail.execute(job, workerId, {
          errorCategory: 'VIDEO_RENDER_PENDING',
          retryable: true,
        });
        if (failedJob.status === 'DEAD')
          await this.handler.markFailed({
            workspaceId: job.workspaceId,
            renderId: reference[1]!,
            errorCode: 'PROVIDER_TIMEOUT',
          });
        return failedJob;
      }
      return this.complete.execute(job.id, workerId);
    } catch (error) {
      const classified =
        error instanceof VideoRenderJobHandlerError
          ? error
          : error instanceof ApplicationError && error.code === 'CONFIGURATION_ERROR'
            ? new VideoRenderJobHandlerError('VIDEO_RENDER_CONFIGURATION', false)
            : new VideoRenderJobHandlerError('VIDEO_RENDER_UNEXPECTED', true);
      const failedJob = await this.fail.execute(job, workerId, {
        errorCategory: classified.category,
        retryable: classified.retryable,
      });
      if (failedJob.status === 'DEAD')
        await this.handler.markFailed({
          workspaceId: job.workspaceId,
          renderId: reference[1]!,
          errorCode: classified.category,
        });
      return failedJob;
    }
  }
}
