import { ApplicationError } from '@bunshin/shared';
import type { Job, JobEnvironment } from './index';

export interface JobClaimer {
  execute(environment: JobEnvironment, workerId: string): Promise<Job | null>;
}

export interface JobExecutor {
  execute(job: Job, workerId: string): Promise<Job>;
}

export interface JobWorkerSummary {
  environment: JobEnvironment;
  claimed: number;
  succeeded: number;
  retryScheduled: number;
  dead: number;
  infrastructureFailures: number;
  drained: boolean;
}

export class RunJobWorkerBatch {
  constructor(
    private readonly claims: JobClaimer,
    private readonly executor: JobExecutor,
    private readonly now = () => Date.now(),
    private readonly maximumBatchSize = 10,
    private readonly maximumRuntimeMilliseconds = 25_000,
  ) {}

  async execute(input: {
    environment: JobEnvironment;
    workerId: string;
    batchSize?: number;
  }): Promise<JobWorkerSummary> {
    const batchSize = input.batchSize ?? 5;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > this.maximumBatchSize)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid worker batch size');
    const startedAt = this.now();
    const summary: JobWorkerSummary = {
      environment: input.environment,
      claimed: 0,
      succeeded: 0,
      retryScheduled: 0,
      dead: 0,
      infrastructureFailures: 0,
      drained: false,
    };
    while (
      summary.claimed < batchSize &&
      this.now() - startedAt < this.maximumRuntimeMilliseconds
    ) {
      const job = await this.claims.execute(input.environment, input.workerId);
      if (!job) {
        summary.drained = true;
        break;
      }
      summary.claimed += 1;
      try {
        const result = await this.executor.execute(job, input.workerId);
        if (result.status === 'SUCCEEDED') summary.succeeded += 1;
        else if (result.status === 'RETRY_SCHEDULED') summary.retryScheduled += 1;
        else if (result.status === 'DEAD') summary.dead += 1;
        else summary.infrastructureFailures += 1;
      } catch {
        summary.infrastructureFailures += 1;
      }
    }
    return summary;
  }
}
