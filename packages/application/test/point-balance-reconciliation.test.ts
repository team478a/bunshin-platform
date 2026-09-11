import { describe, expect, it, vi } from 'vitest';
import {
  InspectPointBalances,
  type PointBalanceReconciliationRepository,
} from '../src/point-balance-reconciliation';

describe('point balance reconciliation', () => {
  it('inspects a bounded number of mismatches', async () => {
    const result = { accountsChecked: 12, mismatchCount: 1, mismatches: [] };
    const inspect = vi.fn().mockResolvedValue(result);
    const repository: PointBalanceReconciliationRepository = { inspect };

    await expect(new InspectPointBalances(repository).execute({ limit: 50 })).resolves.toEqual(
      result,
    );
    expect(inspect).toHaveBeenCalledWith({ limit: 50 });
  });

  it('rejects an unbounded inspection', () => {
    const repository: PointBalanceReconciliationRepository = { inspect: vi.fn() };
    expect(() => new InspectPointBalances(repository).execute({ limit: 501 })).toThrow(
      'invalid point reconciliation limit',
    );
  });
});
