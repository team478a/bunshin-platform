import { ApplicationError } from '@bunshin/shared';
import type { CompleteJob, FailJob, Job } from './job-runtime';

export const SOCIAL_PUBLICATION_JOB_TYPE = 'SOCIAL_PUBLICATION_PUBLISH';

export interface SocialPublicationJobHandler {
  execute(input: {
    workspaceId: string;
    intentId: string;
    actorUserId: string;
    attemptCount: number;
  }): Promise<void>;
  markFailed(input: {
    workspaceId: string;
    intentId: string;
    errorCategory: string;
  }): Promise<void>;
}

export class SocialPublicationJobError extends Error {
  constructor(
    readonly category: string,
    readonly retryable: boolean,
  ) {
    super(category);
  }
}

/** Job adapter with an explicit no-retry classification for ambiguous publish outcomes. */
export class ExecuteSocialPublicationJob {
  constructor(
    private readonly handler: SocialPublicationJobHandler,
    private readonly complete: CompleteJob,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string) {
    const reference = /^social-publication:([0-9a-f-]{36})$/.exec(job.payloadReference);
    if (job.jobType !== SOCIAL_PUBLICATION_JOB_TYPE || !reference || !job.requestedBy)
      return this.fail.execute(job, workerId, {
        errorCategory: 'UNSUPPORTED_SOCIAL_PUBLICATION_JOB',
        retryable: false,
      });
    try {
      await this.handler.execute({
        workspaceId: job.workspaceId,
        intentId: reference[1]!,
        actorUserId: job.requestedBy,
        attemptCount: job.attemptCount,
      });
      return this.complete.execute(job.id, workerId);
    } catch (error) {
      const classified =
        error instanceof SocialPublicationJobError
          ? error
          : error instanceof ApplicationError &&
              [
                'CONFIGURATION_ERROR',
                'FORBIDDEN',
                'VALIDATION_ERROR',
                'NOT_FOUND',
                'CONFLICT',
              ].includes(error.code)
            ? new SocialPublicationJobError(`SOCIAL_PUBLICATION_${error.code}`, false)
            : new SocialPublicationJobError('SOCIAL_PUBLICATION_UNEXPECTED', true);
      const failed = await this.fail.execute(job, workerId, {
        errorCategory: classified.category,
        retryable: classified.retryable,
      });
      if (failed.status === 'DEAD')
        await this.handler.markFailed({
          workspaceId: job.workspaceId,
          intentId: reference[1]!,
          errorCategory: classified.category,
        });
      return failed;
    }
  }
}
