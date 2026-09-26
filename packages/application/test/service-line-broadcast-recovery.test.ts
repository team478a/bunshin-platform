import { describe, expect, it, vi } from 'vitest';
import type { JobDispatcher } from '../src/job-runtime';
import {
  RecoverServiceLineBroadcastJobs,
  type ServiceLineBroadcastRecoveryRepository,
} from '../src/service-line-broadcast-recovery';

const first = {
  workspaceId: 'workspace-1',
  broadcastId: '11111111-1111-4111-8111-111111111111',
  requestedBy: 'user-1',
  scheduledAt: new Date('2026-09-26T04:00:00.000Z'),
  updatedAt: new Date('2026-09-26T04:01:00.000Z'),
};

describe('RecoverServiceLineBroadcastJobs', () => {
  it('enqueues deterministic recovery jobs and isolates individual failures', async () => {
    const repository: ServiceLineBroadcastRecoveryRepository = {
      listUnqueued: vi.fn().mockResolvedValue({
        candidates: [first, { ...first, broadcastId: '22222222-2222-4222-8222-222222222222' }],
        truncated: true,
      }),
    };
    const enqueue = vi
      .fn()
      .mockResolvedValueOnce({ id: 'job-1' })
      .mockRejectedValueOnce(new Error('temporary database error'));
    const result = await new RecoverServiceLineBroadcastJobs(repository, {
      enqueue,
    } satisfies JobDispatcher).execute('PRODUCTION');

    expect(result).toEqual({ candidates: 2, enqueued: 1, failures: 1, truncated: true });
    expect(enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspaceId: first.workspaceId,
        payloadReference: `service-line-broadcast:${first.broadcastId}`,
        idempotencyKey: `service-line-broadcast-recovery:${first.broadcastId}:${first.updatedAt.toISOString()}`,
        maxAttempts: 3,
      }),
    );
  });
});
