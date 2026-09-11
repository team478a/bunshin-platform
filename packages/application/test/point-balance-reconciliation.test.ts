import { describe, expect, it, vi } from 'vitest';
import {
  InspectPointBalances,
  RepairPointBalance,
  type PointBalanceReconciliationRepository,
} from '../src/point-balance-reconciliation';

describe('point balance reconciliation', () => {
  it('inspects a bounded number of mismatches', async () => {
    const result = { accountsChecked: 12, mismatchCount: 1, mismatches: [] };
    const inspect = vi.fn().mockResolvedValue(result);
    const repository: PointBalanceReconciliationRepository = { inspect, repair: vi.fn() };

    await expect(new InspectPointBalances(repository).execute({ limit: 50 })).resolves.toEqual(
      result,
    );
    expect(inspect).toHaveBeenCalledWith({ limit: 50 });
  });

  it('rejects an unbounded inspection', () => {
    const repository: PointBalanceReconciliationRepository = {
      inspect: vi.fn(),
      repair: vi.fn(),
    };
    expect(() => new InspectPointBalances(repository).execute({ limit: 501 })).toThrow(
      'invalid point reconciliation limit',
    );
  });

  it('repairs an unchanged mismatch with a recorded reason', async () => {
    const repair = vi.fn().mockResolvedValue({
      accountId: 'account-1',
      previousBalance: 20,
      repairedBalance: 15,
    });
    const repository: PointBalanceReconciliationRepository = { inspect: vi.fn(), repair };

    await expect(
      new RepairPointBalance(repository).execute({
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        actorUserId: 'admin-1',
        expectedStoredBalance: 20,
        expectedLedgerBalance: 15,
        expectedRevision: 3,
        reason: '  障害調査で表示残高のずれを確認したため  ',
      }),
    ).resolves.toEqual({ accountId: 'account-1', previousBalance: 20, repairedBalance: 15 });
    expect(repair).toHaveBeenCalledWith(
      expect.objectContaining({ reason: '障害調査で表示残高のずれを確認したため' }),
    );
  });

  it('rejects a repair without a sufficient reason', async () => {
    const repository: PointBalanceReconciliationRepository = {
      inspect: vi.fn(),
      repair: vi.fn(),
    };
    await expect(
      new RepairPointBalance(repository).execute({
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        actorUserId: 'admin-1',
        expectedStoredBalance: 20,
        expectedLedgerBalance: 15,
        expectedRevision: 3,
        reason: '短い理由',
      }),
    ).rejects.toThrow('invalid point balance repair');
  });
});
