import { ApplicationError } from '@bunshin/shared';

export interface PointBalanceMismatch {
  accountId: string;
  workspaceId: string;
  userId: string;
  storedBalance: number;
  ledgerBalance: number;
  difference: number;
}

export interface PointBalanceReconciliationResult {
  accountsChecked: number;
  mismatchCount: number;
  mismatches: PointBalanceMismatch[];
}

export interface PointBalanceReconciliationRepository {
  inspect(input: { limit: number }): Promise<PointBalanceReconciliationResult>;
}

export class InspectPointBalances {
  constructor(private readonly repository: PointBalanceReconciliationRepository) {}

  execute(input: { limit?: number } = {}) {
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid point reconciliation limit');
    return this.repository.inspect({ limit });
  }
}
