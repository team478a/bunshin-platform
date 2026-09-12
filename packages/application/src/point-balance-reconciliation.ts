import { ApplicationError } from '@bunshin/shared';

export interface PointBalanceMismatch {
  accountId: string;
  workspaceId: string;
  userId: string;
  availablePoints: number;
  recoveryDue: number;
  storedBalance: number;
  ledgerBalance: number;
  difference: number;
  revision: number;
}

export interface PointBalanceRepairResult {
  accountId: string;
  previousBalance: number;
  repairedBalance: number;
}

export interface PointBalanceReconciliationResult {
  accountsChecked: number;
  mismatchCount: number;
  mismatches: PointBalanceMismatch[];
}

export interface PointBalanceReconciliationRepository {
  inspect(input: { limit: number }): Promise<PointBalanceReconciliationResult>;
  repair(input: {
    accountId: string;
    workspaceId: string;
    userId: string;
    actorUserId: string;
    expectedStoredBalance: number;
    expectedLedgerBalance: number;
    expectedRevision: number;
    reason: string;
  }): Promise<PointBalanceRepairResult | null>;
}

export class RepairPointBalance {
  constructor(private readonly repository: PointBalanceReconciliationRepository) {}

  async execute(input: {
    accountId: string;
    workspaceId: string;
    userId: string;
    actorUserId: string;
    expectedStoredBalance: number;
    expectedLedgerBalance: number;
    expectedRevision: number;
    reason: string;
  }) {
    const reason = input.reason.trim();
    if (
      !input.accountId ||
      !input.workspaceId ||
      !input.userId ||
      !input.actorUserId ||
      !Number.isSafeInteger(input.expectedStoredBalance) ||
      !Number.isSafeInteger(input.expectedLedgerBalance) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      reason.length < 10 ||
      reason.length > 1000
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid point balance repair');
    const result = await this.repository.repair({ ...input, reason });
    if (!result) throw new ApplicationError('NOT_FOUND', 'point account not found');
    return result;
  }
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
