import { ApplicationError } from '@bunshin/shared';
import type { CompleteJob, FailJob, Job, JobDispatcher, JobEnvironment } from './index';
import type { BadgeLineDeliveryExecutionResult } from './badge-line-notification';

export const BADGE_LINE_DELIVERY_JOB_TYPE = 'BADGE_LINE_DELIVER';

export interface BadgeLineJobCandidate {
  deliveryId: string;
  workspaceId: string;
  userId: string;
}

export interface BadgeLineJobCandidateRepository {
  listPending(input: {
    environment: JobEnvironment;
    limit: number;
  }): Promise<BadgeLineJobCandidate[]>;
}

export class ScheduleBadgeLineDeliveryJobs {
  constructor(
    private readonly candidates: BadgeLineJobCandidateRepository,
    private readonly jobs: JobDispatcher,
  ) {}

  async execute(environment: JobEnvironment, limit = 30) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge LINE job batch size');
    const candidates = await this.candidates.listPending({ environment, limit });
    let enqueued = 0;
    for (const candidate of candidates) {
      await this.jobs.enqueue({
        environment,
        workspaceId: candidate.workspaceId,
        correlationId: `badge-line:${candidate.deliveryId}`,
        requestedBy: candidate.userId,
        jobType: BADGE_LINE_DELIVERY_JOB_TYPE,
        payloadReference: `badge-line-delivery:${candidate.deliveryId}`,
        idempotencyKey: `badge-line-delivery:${environment}:${candidate.deliveryId}`,
        priority: 60,
        maxAttempts: 3,
      });
      enqueued += 1;
    }
    return { candidates: candidates.length, enqueued, truncated: candidates.length === limit };
  }
}

export interface BadgeLineDeliveryJobHandler {
  execute(input: {
    job: Job;
    deliveryId: string;
    workerId: string;
  }): Promise<BadgeLineDeliveryExecutionResult>;
}

const reference =
  /^badge-line-delivery:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export class ExecuteBadgeLineDeliveryJob {
  constructor(
    private readonly handler: BadgeLineDeliveryJobHandler,
    private readonly complete: CompleteJob,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string) {
    const deliveryId = reference.exec(job.payloadReference)?.[1];
    if (job.jobType !== BADGE_LINE_DELIVERY_JOB_TYPE || job.bunshinId || !deliveryId)
      return this.fail.execute(job, workerId, {
        errorCategory: 'INVALID_BADGE_LINE_DELIVERY_JOB',
        retryable: false,
      });
    try {
      const result = await this.handler.execute({ job, deliveryId, workerId });
      if (result.status === 'SENT' || (result.status !== 'BUSY' && !result.retryable))
        return this.complete.execute(job.id, workerId);
      return this.fail.execute(job, workerId, {
        errorCategory: result.category ?? 'BADGE_LINE_DELIVERY_BUSY',
        retryable: true,
      });
    } catch (error) {
      const category =
        error instanceof ApplicationError
          ? `BADGE_LINE_DELIVERY_${error.code}`
          : 'BADGE_LINE_DELIVERY_UNEXPECTED';
      const retryable =
        !(error instanceof ApplicationError) ||
        !['NOT_FOUND', 'FORBIDDEN', 'VALIDATION_ERROR'].includes(error.code);
      return this.fail.execute(job, workerId, { errorCategory: category, retryable });
    }
  }
}
