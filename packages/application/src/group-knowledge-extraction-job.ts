import { ApplicationError } from '@bunshin/shared';
import type { CompleteJob, FailJob, Job } from './index';

export const GROUP_KNOWLEDGE_EXTRACTION_JOB_TYPE = 'GROUP_KNOWLEDGE_EXTRACT';

export interface GroupKnowledgeExtractionJobHandler {
  execute(input: {
    workspaceId: string;
    groupId: string;
    sourceId: string;
    actorUserId: string;
    attemptCount: number;
  }): Promise<void>;
  markFailed(input: {
    workspaceId: string;
    groupId: string;
    sourceId: string;
    actorUserId: string;
    errorCode: string;
  }): Promise<void>;
}

export class GroupKnowledgeExtractionError extends Error {
  constructor(
    readonly category: string,
    readonly retryable: boolean,
  ) {
    super(category);
  }
}

export class ExecuteGroupKnowledgeExtractionJob {
  constructor(
    private readonly handler: GroupKnowledgeExtractionJobHandler,
    private readonly complete: CompleteJob,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string) {
    const match = /^group-knowledge:([0-9a-f-]{36}):([0-9a-f-]{36}):([0-9a-f-]{36})$/u.exec(
      job.payloadReference,
    );
    if (job.jobType !== GROUP_KNOWLEDGE_EXTRACTION_JOB_TYPE || !match)
      return this.fail.execute(job, workerId, {
        errorCategory: 'UNSUPPORTED_GROUP_KNOWLEDGE_JOB',
        retryable: false,
      });
    const input = {
      workspaceId: job.workspaceId,
      groupId: match[1]!,
      sourceId: match[2]!,
      actorUserId: match[3]!,
      attemptCount: job.attemptCount,
    };
    try {
      await this.handler.execute(input);
      return this.complete.execute(job.id, workerId);
    } catch (error) {
      const classified =
        error instanceof GroupKnowledgeExtractionError
          ? error
          : error instanceof ApplicationError &&
              ['VALIDATION_ERROR', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT'].includes(error.code)
            ? new GroupKnowledgeExtractionError(`GROUP_KNOWLEDGE_${error.code}`, false)
            : new GroupKnowledgeExtractionError('GROUP_KNOWLEDGE_PROVIDER_ERROR', true);
      const result = await this.fail.execute(job, workerId, {
        errorCategory: classified.category,
        retryable: classified.retryable,
      });
      if (result.status === 'DEAD')
        await this.handler.markFailed({ ...input, errorCode: classified.category });
      return result;
    }
  }
}
