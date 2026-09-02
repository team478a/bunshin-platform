import { ApplicationError } from '@bunshin/shared';
import type { CompleteJob, FailJob, Job } from './index';

export const SERVICE_LINE_BROADCAST_JOB_TYPE = 'SERVICE_LINE_BROADCAST_DELIVER';

export interface ServiceLineBroadcastJobHandler {
  execute(input: { job: Job; broadcastId: string; workerId: string }): Promise<{
    retryable: boolean;
    category?: string;
  }>;
}

const reference =
  /^service-line-broadcast:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export class ExecuteServiceLineBroadcastJob {
  constructor(
    private readonly handler: ServiceLineBroadcastJobHandler,
    private readonly complete: CompleteJob,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string) {
    const broadcastId = reference.exec(job.payloadReference)?.[1];
    if (job.jobType !== SERVICE_LINE_BROADCAST_JOB_TYPE || job.bunshinId || !broadcastId)
      return this.fail.execute(job, workerId, {
        errorCategory: 'INVALID_SERVICE_LINE_BROADCAST_JOB',
        retryable: false,
      });
    try {
      const result = await this.handler.execute({ job, broadcastId, workerId });
      if (!result.retryable) return this.complete.execute(job.id, workerId);
      return this.fail.execute(job, workerId, {
        errorCategory: result.category ?? 'SERVICE_LINE_BROADCAST_RETRY',
        retryable: true,
      });
    } catch (error) {
      return this.fail.execute(job, workerId, {
        errorCategory:
          error instanceof ApplicationError
            ? `SERVICE_LINE_BROADCAST_${error.code}`
            : 'SERVICE_LINE_BROADCAST_UNEXPECTED',
        retryable:
          !(error instanceof ApplicationError) ||
          !['NOT_FOUND', 'FORBIDDEN', 'VALIDATION_ERROR'].includes(error.code),
      });
    }
  }
}
