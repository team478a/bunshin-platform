import { ApplicationError } from '@bunshin/shared';

export const POINT_REWARD_TYPES = [
  'SOCIAL_IMAGE_GENERATION',
  'ALTERNATIVE_PLAN_GENERATION',
] as const;
export type PointRewardType = (typeof POINT_REWARD_TYPES)[number];

export const POINT_REDEMPTION_STATUSES = ['RESERVED', 'CONFIRMED', 'RELEASED', 'REFUNDED'] as const;
export type PointRedemptionStatus = (typeof POINT_REDEMPTION_STATUSES)[number];

export interface PointRewardCatalogItemRecord {
  id: string;
  rewardKey: string;
  version: number;
  rewardType: PointRewardType;
  title: string;
  description: string;
  pointCost: number;
}

export interface PointRedemptionRecord {
  id: string;
  workspaceId: string;
  userId: string;
  accountId: string;
  catalogItemId: string;
  consumptionTransactionId: string;
  status: PointRedemptionStatus;
  pointCost: number;
  idempotencyKey: string;
  resourceType: string | null;
  resourceId: string | null;
  reservedAt: Date;
  reservationExpiresAt: Date;
  confirmedAt: Date | null;
  releasedAt: Date | null;
  refundedAt: Date | null;
  failureReason: string | null;
}

export interface PointRedemptionRepository {
  listCatalog(input: {
    workspaceId: string;
    actorUserId: string;
    now: Date;
  }): Promise<PointRewardCatalogItemRecord[] | null>;
  reserve(input: {
    workspaceId: string;
    actorUserId: string;
    catalogItemId: string;
    idempotencyKey: string;
    resourceType: string | null;
    resourceId: string | null;
    now: Date;
    reservationExpiresAt: Date;
  }): Promise<PointRedemptionRecord | null>;
  transition(input: {
    workspaceId: string;
    actorUserId: string;
    redemptionId: string;
    targetStatus: 'CONFIRMED' | 'RELEASED' | 'REFUNDED';
    reason: string | null;
    now: Date;
  }): Promise<PointRedemptionRecord | null>;
}

const required = (value: string, field: string, max = 200) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export class ListPointRewardCatalog {
  constructor(private readonly repository: PointRedemptionRepository) {}
  async execute(input: { workspaceId: string; actorUserId: string; now?: Date }) {
    const value = await this.repository.listCatalog({ ...input, now: input.now ?? new Date() });
    if (!value) throw new ApplicationError('FORBIDDEN', 'point catalog is not available');
    return value;
  }
}

export class ReservePointReward {
  constructor(private readonly repository: PointRedemptionRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    catalogItemId: string;
    idempotencyKey: string;
    resourceType?: string | null;
    resourceId?: string | null;
    now?: Date;
    reservationMinutes?: number;
  }) {
    const now = input.now ?? new Date();
    const minutes = input.reservationMinutes ?? 15;
    if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 60)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reservation minutes');
    const value = await this.repository.reserve({
      workspaceId: required(input.workspaceId, 'workspace id'),
      actorUserId: required(input.actorUserId, 'actor user id'),
      catalogItemId: required(input.catalogItemId, 'catalog item id'),
      idempotencyKey: required(input.idempotencyKey, 'idempotency key', 160),
      resourceType: input.resourceType ? required(input.resourceType, 'resource type', 100) : null,
      resourceId: input.resourceId ? required(input.resourceId, 'resource id') : null,
      now,
      reservationExpiresAt: new Date(now.getTime() + minutes * 60_000),
    });
    if (!value) throw new ApplicationError('FORBIDDEN', 'point reward cannot be reserved');
    return value;
  }
}

abstract class TransitionPointRedemption {
  abstract readonly targetStatus: 'CONFIRMED' | 'RELEASED' | 'REFUNDED';
  constructor(protected readonly repository: PointRedemptionRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    redemptionId: string;
    reason?: string | null;
    now?: Date;
  }) {
    if (this.targetStatus !== 'CONFIRMED' && !input.reason)
      throw new ApplicationError('VALIDATION_ERROR', 'reason is required');
    const value = await this.repository.transition({
      workspaceId: required(input.workspaceId, 'workspace id'),
      actorUserId: required(input.actorUserId, 'actor user id'),
      redemptionId: required(input.redemptionId, 'redemption id'),
      targetStatus: this.targetStatus,
      reason: input.reason ? required(input.reason, 'reason', 500) : null,
      now: input.now ?? new Date(),
    });
    if (!value) throw new ApplicationError('CONFLICT', 'point redemption transition failed');
    return value;
  }
}

export class ConfirmPointRedemption extends TransitionPointRedemption {
  readonly targetStatus = 'CONFIRMED' as const;
}
export class ReleasePointRedemption extends TransitionPointRedemption {
  readonly targetStatus = 'RELEASED' as const;
}
export class RefundPointRedemption extends TransitionPointRedemption {
  readonly targetStatus = 'REFUNDED' as const;
}
