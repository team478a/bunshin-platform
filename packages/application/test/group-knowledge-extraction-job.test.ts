import { describe, expect, it, vi } from 'vitest';
import {
  ExecuteGroupKnowledgeExtractionJob,
  GroupKnowledgeExtractionError,
  type GroupKnowledgeExtractionJobHandler,
  type Job,
} from '../src/index';

const job = {
  id: 'job-1',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  bunshinId: null,
  capabilityType: null,
  correlationId: 'correlation',
  requestedBy: 'actor',
  environment: 'PRODUCTION',
  jobType: 'GROUP_KNOWLEDGE_EXTRACT',
  idempotencyKey: 'knowledge-1',
  payloadReference:
    'group-knowledge:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333:44444444-4444-4444-8444-444444444444',
  priority: 100,
  maxAttempts: 3,
  status: 'LEASED',
  scheduledAt: new Date(),
  attemptCount: 1,
  leaseOwner: 'worker',
  leaseExpiresAt: new Date(),
  nextRetryAt: null,
  lastErrorCategory: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Job;

describe('ExecuteGroupKnowledgeExtractionJob', () => {
  it('scoped referenceだけをhandlerへ渡して完了する', async () => {
    const execute = vi.fn();
    const handler: GroupKnowledgeExtractionJobHandler = {
      execute,
      markFailed: vi.fn(),
    };
    const completeExecute = vi.fn().mockResolvedValue({ ...job, status: 'SUCCEEDED' });
    const complete = { execute: completeExecute };
    const fail = { execute: vi.fn() };
    await new ExecuteGroupKnowledgeExtractionJob(handler, complete as never, fail as never).execute(
      job,
      'worker',
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: job.workspaceId,
        groupId: '22222222-2222-4222-8222-222222222222',
        sourceId: '33333333-3333-4333-8333-333333333333',
        actorUserId: '44444444-4444-4444-8444-444444444444',
      }),
    );
    expect(completeExecute).toHaveBeenCalled();
  });

  it('再試行可能なProvider障害をJobへ返す', async () => {
    const markFailed = vi.fn();
    const handler: GroupKnowledgeExtractionJobHandler = {
      execute: vi.fn().mockRejectedValue(new GroupKnowledgeExtractionError('PROVIDER', true)),
      markFailed,
    };
    const failExecute = vi.fn().mockResolvedValue({ ...job, status: 'RETRY_SCHEDULED' });
    const fail = { execute: failExecute };
    await new ExecuteGroupKnowledgeExtractionJob(
      handler,
      { execute: vi.fn() } as never,
      fail as never,
    ).execute(job, 'worker');
    expect(failExecute).toHaveBeenCalledWith(
      job,
      'worker',
      expect.objectContaining({ errorCategory: 'PROVIDER', retryable: true }),
    );
    expect(markFailed).not.toHaveBeenCalled();
  });
});
