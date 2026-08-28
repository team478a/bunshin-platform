import { ApplicationError } from '@bunshin/shared';
import type { CompleteJob, FailJob, Job } from './index';
import type { SocialImageLayout } from './social-image-templates';

export const SOCIAL_IMAGE_GENERATION_JOB_TYPE = 'SOCIAL_IMAGE_GENERATE';

export type SocialImageGenerationExecutionBlockReason =
  | 'REQUEST_UNAVAILABLE'
  | 'PILOT_STOPPED'
  | 'DAILY_LIMIT_REACHED'
  | 'MONTHLY_LIMIT_REACHED'
  | 'MEMBER_MONTHLY_LIMIT_REACHED';

export interface SocialImageGenerationExecutionContext {
  requestId: string;
  workspaceId: string;
  groupId: string;
  ownerUserId: string;
  bunshinId: string;
  dailyMissionId: string;
  layout: SocialImageLayout;
  model: string;
  quality: string;
}

export interface SocialImageGenerationExecutionRepository {
  claim(input: {
    workspaceId: string;
    requestId: string;
    now: Date;
    dailyFrom: Date;
    monthlyFrom: Date;
  }): Promise<
    | { allowed: true; context: SocialImageGenerationExecutionContext }
    | { allowed: false; reason: SocialImageGenerationExecutionBlockReason }
  >;
  moveToComposing(input: { workspaceId: string; requestId: string }): Promise<boolean>;
  complete(input: {
    context: SocialImageGenerationExecutionContext;
    mediaId: string;
    sourceStorageKey: string | null;
    completedStorageKey: string;
    thumbnailStorageKey: string;
    contentHash: string;
  }): Promise<boolean>;
  markFailed(input: { workspaceId: string; requestId: string; errorCode: string }): Promise<void>;
}

export class ClaimSocialImageGenerationExecution {
  constructor(
    private readonly repository: SocialImageGenerationExecutionRepository,
    private readonly now = () => new Date(),
  ) {}

  async execute(input: { workspaceId: string; requestId: string }) {
    const now = this.now();
    const result = await this.repository.claim({
      ...input,
      now,
      dailyFrom: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      monthlyFrom: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    });
    if (!result.allowed)
      throw new SocialImageGenerationJobHandlerError(`SOCIAL_IMAGE_${result.reason}`, false);
    return result.context;
  }
}

export interface SocialImageGenerationJobHandler {
  execute(input: { workspaceId: string; requestId: string; attemptCount: number }): Promise<void>;
  markFailed(input: { workspaceId: string; requestId: string; errorCode: string }): Promise<void>;
}

export class SocialImageGenerationJobHandlerError extends Error {
  constructor(
    readonly category: string,
    readonly retryable: boolean,
  ) {
    super(category);
  }
}

export class ExecuteSocialImageGenerationJob {
  constructor(
    private readonly handler: SocialImageGenerationJobHandler,
    private readonly complete: CompleteJob,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string) {
    const reference = /^social-image:([0-9a-f-]{36})$/.exec(job.payloadReference);
    if (job.jobType !== SOCIAL_IMAGE_GENERATION_JOB_TYPE || !reference)
      return this.fail.execute(job, workerId, {
        errorCategory: 'UNSUPPORTED_SOCIAL_IMAGE_JOB',
        retryable: false,
      });
    try {
      await this.handler.execute({
        workspaceId: job.workspaceId,
        requestId: reference[1]!,
        attemptCount: job.attemptCount,
      });
      return this.complete.execute(job.id, workerId);
    } catch (error) {
      const classified =
        error instanceof SocialImageGenerationJobHandlerError
          ? error
          : error instanceof ApplicationError &&
              ['CONFIGURATION_ERROR', 'FORBIDDEN', 'VALIDATION_ERROR', 'CONFLICT'].includes(
                error.code,
              )
            ? new SocialImageGenerationJobHandlerError(`SOCIAL_IMAGE_${error.code}`, false)
            : new SocialImageGenerationJobHandlerError('SOCIAL_IMAGE_UNEXPECTED', true);
      const failedJob = await this.fail.execute(job, workerId, {
        errorCategory: classified.category,
        retryable: classified.retryable,
      });
      if (failedJob.status === 'DEAD')
        await this.handler.markFailed({
          workspaceId: job.workspaceId,
          requestId: reference[1]!,
          errorCode: classified.category,
        });
      return failedJob;
    }
  }
}
