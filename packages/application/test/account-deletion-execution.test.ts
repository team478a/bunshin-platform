import { describe, expect, it, vi } from 'vitest';
import {
  CompleteAccountDeletionPurge,
  PrepareNextAccountDeletion,
  type AccountDeletionExecutionRepository,
} from '../src';

describe('PrepareNextAccountDeletion', () => {
  it('derives a bounded lease and execution version', async () => {
    const claimAndSuspendNext = vi.fn().mockResolvedValue(null);
    const now = new Date('2026-08-22T09:00:00Z');
    await new PrepareNextAccountDeletion(
      { claimAndSuspendNext } satisfies AccountDeletionExecutionRepository,
      () => now,
    ).execute('deletion-worker');

    expect(claimAndSuspendNext).toHaveBeenCalledWith({
      workerId: 'deletion-worker',
      now,
      leaseExpiresAt: new Date('2026-08-22T09:05:00Z'),
      executionVersion: 1,
    });
  });

  it('rejects an invalid worker before repository access', async () => {
    const claimAndSuspendNext = vi.fn();
    await expect(
      new PrepareNextAccountDeletion({ claimAndSuspendNext }).execute(' '),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(claimAndSuspendNext).not.toHaveBeenCalled();
  });
});

describe('CompleteAccountDeletionPurge', () => {
  it('passes an explicit request, user and worker boundary to the repository', async () => {
    const completeAfterAuthDeletion = vi.fn().mockResolvedValue(null);
    const now = new Date('2026-08-22T10:00:00Z');
    await new CompleteAccountDeletionPurge({ completeAfterAuthDeletion }, () => now).execute({
      requestId: 'request-1',
      userId: 'user-1',
      workerId: 'worker-1',
    });
    expect(completeAfterAuthDeletion).toHaveBeenCalledWith({
      requestId: 'request-1',
      userId: 'user-1',
      workerId: 'worker-1',
      now,
    });
  });

  it('rejects invalid input before accessing the purge repository', async () => {
    const completeAfterAuthDeletion = vi.fn();
    await expect(
      new CompleteAccountDeletionPurge({ completeAfterAuthDeletion }).execute({
        requestId: '',
        userId: 'user-1',
        workerId: 'worker-1',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(completeAfterAuthDeletion).not.toHaveBeenCalled();
  });
});
