import { describe, expect, it, vi } from 'vitest';
import {
  purgeExpiredSupportCases,
  SUPPORT_CASE_RETENTION_DAYS,
} from '../src/support-case-retention';

describe('support case retention', () => {
  it('uses a 90-day cutoff and only deletes still-resolved selected cases', async () => {
    const now = new Date('2026-10-15T00:00:00.000Z');
    const findMany = vi.fn().mockResolvedValue([{ id: 'case-1' }, { id: 'case-2' }]);
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = { supportCase: { findMany, deleteMany } };
    const client = {
      $transaction: vi.fn((operation: (tx: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    };

    await expect(purgeExpiredSupportCases(client as never, { now, limit: 2 })).resolves.toEqual({
      scanned: 2,
      deleted: 1,
      possiblyMore: true,
    });
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    expect(SUPPORT_CASE_RETENTION_DAYS).toBe(90);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'RESOLVED', resolvedAt: { lte: cutoff } },
      select: { id: true },
      orderBy: [{ resolvedAt: 'asc' }, { id: 'asc' }],
      take: 2,
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['case-1', 'case-2'] },
        status: 'RESOLVED',
        resolvedAt: { lte: cutoff },
      },
    });
  });

  it('does not issue a delete when no resolved cases have expired', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const deleteMany = vi.fn();
    const transaction = { supportCase: { findMany, deleteMany } };
    const client = {
      $transaction: vi.fn((operation: (tx: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    };
    await expect(
      purgeExpiredSupportCases(client as never, { now: new Date('2026-10-15T00:00:00Z') }),
    ).resolves.toEqual({ scanned: 0, deleted: 0, possiblyMore: false });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('rejects invalid batch limits and timestamps before touching the database', async () => {
    const $transaction = vi.fn();
    const client = { $transaction };
    await expect(purgeExpiredSupportCases(client as never, { limit: 1001 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(
      purgeExpiredSupportCases(client as never, { now: new Date(Number.NaN) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect($transaction).not.toHaveBeenCalled();
  });
});
