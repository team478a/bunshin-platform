import type { CompleteJob, FailJob, Job } from './job-runtime';

export const FORTUNE_GENERATION_JOB_TYPE = 'FORTUNE_READING_GENERATE';
export const fortuneGenerationPayloadReference = (serviceSettingId: string, readingId: string) =>
  `fortune-generation:${serviceSettingId}:${readingId}`;

export interface FortuneGenerationJobInput {
  workspaceId: string;
  bunshinId: string;
  serviceSettingId: string;
  readingId: string;
  actorUserId: string;
  jobId: string;
  workerId: string;
  attemptCount: number;
  maxAttempts: number;
}

export interface FortuneGenerationJobHandler {
  execute(input: FortuneGenerationJobInput): Promise<void>;
}

export class FortuneGenerationJobError extends Error {
  constructor(
    readonly category: string,
    readonly retryable: boolean,
  ) {
    super(category);
  }
}

export class ExecuteFortuneGenerationJob {
  constructor(
    private readonly handler: FortuneGenerationJobHandler,
    private readonly complete: CompleteJob,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string): Promise<Job> {
    const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    const match = new RegExp(`^fortune-generation:(${uuid}):(${uuid})$`, 'u').exec(
      job.payloadReference,
    );
    if (
      job.jobType !== FORTUNE_GENERATION_JOB_TYPE ||
      job.capabilityType !== 'FORTUNE' ||
      !job.bunshinId ||
      !match
    )
      return this.fail.execute(job, workerId, {
        errorCategory: 'INVALID_FORTUNE_JOB',
        retryable: false,
      });
    try {
      await this.handler.execute({
        workspaceId: job.workspaceId,
        bunshinId: job.bunshinId,
        serviceSettingId: match[1]!,
        readingId: match[2]!,
        actorUserId: job.requestedBy,
        jobId: job.id,
        workerId,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
      });
    } catch (error) {
      return this.fail.execute(job, workerId, {
        errorCategory:
          error instanceof FortuneGenerationJobError
            ? error.category
            : 'FORTUNE_INFRASTRUCTURE_ERROR',
        retryable: error instanceof FortuneGenerationJobError ? error.retryable : true,
      });
    }
    return this.complete.execute(job.id, workerId);
  }
}
