import { ApplicationError } from '@bunshin/shared';
import type { CompleteJob, FailJob, Job } from './index';

export const TRAINING_ANSWER_EVALUATION_JOB_TYPE = 'TRAINING_ANSWER_EVALUATE';

export interface TrainingAnswerEvaluationJobHandler {
  execute(input: {
    workspaceId: string;
    groupId: string;
    enrollmentId: string;
    answerId: string;
    actorUserId: string;
    jobId: string;
    attemptCount: number;
  }): Promise<void>;
  markFailed(input: {
    workspaceId: string;
    groupId: string;
    enrollmentId: string;
    answerId: string;
    actorUserId: string;
    jobId: string;
    attemptCount: number;
    errorCode: string;
  }): Promise<void>;
}

export class TrainingAnswerEvaluationJobError extends Error {
  constructor(
    readonly category: string,
    readonly retryable: boolean,
  ) {
    super(category);
  }
}

export class ExecuteTrainingAnswerEvaluationJob {
  constructor(
    private readonly handler: TrainingAnswerEvaluationJobHandler,
    private readonly complete: CompleteJob,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string) {
    const match =
      /^training-evaluation:([0-9a-f-]{36}):([0-9a-f-]{36}):([0-9a-f-]{36}):([0-9a-f-]{36})$/u.exec(
        job.payloadReference,
      );
    if (job.jobType !== TRAINING_ANSWER_EVALUATION_JOB_TYPE || !match) {
      return this.fail.execute(job, workerId, {
        errorCategory: 'UNSUPPORTED_TRAINING_EVALUATION_JOB',
        retryable: false,
      });
    }
    const input = {
      workspaceId: job.workspaceId,
      groupId: match[1]!,
      enrollmentId: match[2]!,
      answerId: match[3]!,
      actorUserId: match[4]!,
      jobId: job.id,
      attemptCount: job.attemptCount,
    };
    try {
      await this.handler.execute(input);
      return this.complete.execute(job.id, workerId);
    } catch (error) {
      const classified =
        error instanceof TrainingAnswerEvaluationJobError
          ? error
          : error instanceof ApplicationError &&
              ['VALIDATION_ERROR', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT'].includes(error.code)
            ? new TrainingAnswerEvaluationJobError(`TRAINING_EVALUATION_${error.code}`, false)
            : new TrainingAnswerEvaluationJobError('TRAINING_EVALUATION_PROVIDER_ERROR', true);
      const result = await this.fail.execute(job, workerId, {
        errorCategory: classified.category,
        retryable: classified.retryable,
      });
      if (result.status === 'DEAD') {
        await this.handler.markFailed({ ...input, errorCode: classified.category });
      }
      return result;
    }
  }
}
