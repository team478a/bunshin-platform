import { ApplicationError } from '@bunshin/shared';

export const POINT_TRANSACTION_TYPES = [
  'GRANT',
  'CONSUME',
  'REVERSAL',
  'REFUND',
  'EXPIRE',
  'RECOVERY',
] as const;
export type PointTransactionType = (typeof POINT_TRANSACTION_TYPES)[number];

export interface PointAccountSnapshot {
  id: string;
  workspaceId: string;
  userId: string;
  availablePoints: number;
  recoveryDue: number;
  updatedAt: Date;
}

export interface PointTransactionRecord {
  id: string;
  accountId: string;
  workspaceId: string;
  userId: string;
  groupId: string | null;
  campaignId: string | null;
  type: PointTransactionType;
  amount: number;
  idempotencyKey: string;
  sourceType: string;
  sourceId: string | null;
  ruleVersionId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface PointLedgerRepository {
  getAccount(input: {
    workspaceId: string;
    actorUserId: string;
  }): Promise<PointAccountSnapshot | null>;
  grant(input: {
    workspaceId: string;
    actorUserId: string;
    amount: number;
    idempotencyKey: string;
    sourceType: string;
    sourceId: string | null;
    groupId: string | null;
    campaignId: string | null;
    ruleVersionId: string | null;
    expiresAt: Date | null;
  }): Promise<{ account: PointAccountSnapshot; transaction: PointTransactionRecord } | null>;
  consume(input: {
    workspaceId: string;
    actorUserId: string;
    amount: number;
    idempotencyKey: string;
    sourceType: string;
    sourceId: string | null;
    groupId: string | null;
    campaignId: string | null;
  }): Promise<{ account: PointAccountSnapshot; transaction: PointTransactionRecord } | null>;
  refund(input: {
    workspaceId: string;
    actorUserId: string;
    consumptionTransactionId: string;
    idempotencyKey: string;
    reason: string;
  }): Promise<{ account: PointAccountSnapshot; transaction: PointTransactionRecord } | null>;
}

const positiveInteger = (value: number) => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new ApplicationError('VALIDATION_ERROR', 'points must be a positive safe integer');
  return value;
};

const required = (value: string, field: string, max = 200) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export class GetPointAccount {
  constructor(private readonly repository: PointLedgerRepository) {}
  async execute(input: { workspaceId: string; actorUserId: string }) {
    const account = await this.repository.getAccount(input);
    if (!account) throw new ApplicationError('NOT_FOUND', 'point account not found');
    return account;
  }
}

export class GrantPoints {
  constructor(private readonly repository: PointLedgerRepository) {}
  async execute(input: Parameters<PointLedgerRepository['grant']>[0]) {
    const result = await this.repository.grant({
      ...input,
      amount: positiveInteger(input.amount),
      idempotencyKey: required(input.idempotencyKey, 'idempotency key'),
      sourceType: required(input.sourceType, 'source type', 100),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'point grant is not allowed');
    return result;
  }
}

export class ConsumePoints {
  constructor(private readonly repository: PointLedgerRepository) {}
  async execute(input: Parameters<PointLedgerRepository['consume']>[0]) {
    const result = await this.repository.consume({
      ...input,
      amount: positiveInteger(input.amount),
      idempotencyKey: required(input.idempotencyKey, 'idempotency key'),
      sourceType: required(input.sourceType, 'source type', 100),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'insufficient or unavailable points');
    return result;
  }
}

export class RefundPoints {
  constructor(private readonly repository: PointLedgerRepository) {}
  async execute(input: Parameters<PointLedgerRepository['refund']>[0]) {
    const result = await this.repository.refund({
      ...input,
      consumptionTransactionId: required(
        input.consumptionTransactionId,
        'consumption transaction id',
      ),
      idempotencyKey: required(input.idempotencyKey, 'idempotency key'),
      reason: required(input.reason, 'reason', 500),
    });
    if (!result) throw new ApplicationError('NOT_FOUND', 'consumption transaction not found');
    return result;
  }
}
