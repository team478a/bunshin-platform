/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import {
  CompleteAccountDeletionPurge,
  PrepareNextAccountDeletion,
  RetryBlockedAccountDeletion,
  RunAccountDeletionBatch,
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

describe('RunAccountDeletionBatch', () => {
  it('deletes Auth before invoking the purge boundary', async () => {
    const order: string[] = [];
    const prepare = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          requestId: 'request-1',
          userId: 'user-1',
          status: 'PROCESSING',
          attemptCount: 1,
          blockedReason: null,
          leaseExpiresAt: new Date(),
        })
        .mockResolvedValueOnce(null),
    } as unknown as PrepareNextAccountDeletion;
    const orchestration = {
      findEmailIdentity: vi.fn().mockResolvedValue({ providerUserId: 'provider-1' }),
      recordAuthFailure: vi.fn(),
      inspect: vi.fn(),
    };
    const auth = {
      deleteUser: vi.fn(() => {
        order.push('auth');
        return Promise.resolve({ success: true as const, alreadyAbsent: false });
      }),
    };
    const purge = {
      execute: vi.fn(() => {
        order.push('purge');
        return Promise.resolve({
          requestId: 'request-1',
          userId: 'user-1',
          status: 'COMPLETED' as const,
          blockedReason: null,
        });
      }),
    } as unknown as CompleteAccountDeletionPurge;
    const result = await new RunAccountDeletionBatch(prepare, orchestration, auth, purge).execute(
      'worker-1',
    );
    expect(order).toEqual(['auth', 'purge']);
    expect(result).toMatchObject({ completed: 1, infrastructureFailures: 0 });
  });

  it('records retryable Auth failures without invoking purge', async () => {
    const prepare = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          requestId: 'request-1',
          userId: 'user-1',
          status: 'PROCESSING',
          attemptCount: 1,
          blockedReason: null,
          leaseExpiresAt: new Date(),
        })
        .mockResolvedValueOnce(null),
    } as unknown as PrepareNextAccountDeletion;
    const orchestration = {
      findEmailIdentity: vi.fn().mockResolvedValue({ providerUserId: 'provider-1' }),
      recordAuthFailure: vi.fn().mockResolvedValue(true),
      inspect: vi.fn(),
    };
    const purge = { execute: vi.fn() } as unknown as CompleteAccountDeletionPurge;
    const result = await new RunAccountDeletionBatch(
      prepare,
      orchestration,
      {
        deleteUser: () =>
          Promise.resolve({ success: false, category: 'AUTH_RATE_LIMITED', retryable: true }),
      },
      purge,
    ).execute('worker-1');
    expect(result.retryScheduled).toBe(1);
    expect(purge.execute).not.toHaveBeenCalled();
  });

  it('reports dry-run counts without claiming a request', async () => {
    const prepare = { execute: vi.fn() } as unknown as PrepareNextAccountDeletion;
    const result = await new RunAccountDeletionBatch(
      prepare,
      {
        findEmailIdentity: vi.fn(),
        recordAuthFailure: vi.fn(),
        inspect: vi.fn().mockResolvedValue({ due: 2, processing: 1, blocked: 3 }),
      },
      { deleteUser: vi.fn() },
      { execute: vi.fn() } as unknown as CompleteAccountDeletionPurge,
    ).dryRun();
    expect(result).toMatchObject({ mode: 'dry-run', inspected: 6, blocked: 3, retryScheduled: 1 });
    expect(prepare.execute).not.toHaveBeenCalled();
  });
});

describe('RetryBlockedAccountDeletion', () => {
  it('requires a meaningful reason', async () => {
    const retryBlocked = vi.fn();
    await expect(
      new RetryBlockedAccountDeletion({ retryBlocked }).execute({
        requestId: 'request-1',
        actorUserId: 'admin-1',
        reason: 'short',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(retryBlocked).not.toHaveBeenCalled();
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
