import { ApplicationError } from '@bunshin/shared';
import type { FailJob, Job, JobEnvironment } from './job-runtime';

export const IMPROVEMENT_FEEDBACK_RETENTION_JOB_TYPE = 'IMPROVEMENT_FEEDBACK_PURGE';
export const improvementFeedbackPurgePayload = (serviceId: string) =>
  `feedback-purge:feedback-retention-v1:${serviceId}`;

export interface ImprovementFeedbackRetentionJobRepository {
  schedule(environment: JobEnvironment): Promise<{ scheduled: number }>;
  /** Atomically purge a bounded batch and complete/reschedule the persisted leased Job. */
  execute(job: Job, workerId: string): Promise<Job>;
}

export class ExecuteImprovementFeedbackRetentionJob {
  constructor(
    private readonly repository: ImprovementFeedbackRetentionJobRepository,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string): Promise<Job> {
    try {
      return await this.repository.execute(job, workerId);
    } catch (error) {
      // A lost/expired lease must not be used to record failure for another execution.
      if (error instanceof ApplicationError && error.code === 'CONFLICT') throw error;
      return this.fail.execute(job, workerId, {
        errorCategory: 'FEEDBACK_RETENTION_FAILED',
        retryable: !(
          error instanceof ApplicationError &&
          ['VALIDATION_ERROR', 'FORBIDDEN', 'NOT_FOUND'].includes(error.code)
        ),
      });
    }
  }
}
