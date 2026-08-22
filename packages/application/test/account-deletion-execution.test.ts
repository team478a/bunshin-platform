import { describe, expect, it, vi } from 'vitest';
import { PrepareNextAccountDeletion, type AccountDeletionExecutionRepository } from '../src';

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
