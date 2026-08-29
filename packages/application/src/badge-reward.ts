import { ApplicationError } from '@bunshin/shared';

export const BADGE_REWARD_TYPES = ['ENTITLEMENT'] as const;
export type BadgeRewardType = (typeof BADGE_REWARD_TYPES)[number];
export type BadgeRewardLinkStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type BadgeRewardOutboxStatus =
  'PENDING' | 'PROCESSING' | 'COMPLETED' | 'RETRY' | 'DEAD' | 'CANCELLED';
export type BadgeRewardEntitlementStatus = 'ACTIVE' | 'CONSUMED' | 'REVOKED' | 'EXPIRED';

export interface BadgeRewardPolicy {
  type: BadgeRewardType;
  featureKey: string;
  quantity: number;
  expiresInDays: number | null;
  maxUnitCostUsdMicros: number;
  revocationPolicy: 'REVOKE_UNUSED';
}

export interface BadgeRewardQueueResult {
  rewardLinkId: string;
  outboxId: string;
  status: BadgeRewardLinkStatus;
  alreadyQueued: boolean;
}

export interface BadgeRewardEntitlementRecord {
  id: string;
  workspaceId: string;
  userId: string;
  badgeAwardId: string;
  rewardLinkId: string;
  featureKey: string;
  quantityGranted: number;
  quantityRemaining: number;
  status: BadgeRewardEntitlementStatus;
  expiresAt: Date | null;
}

export interface BadgeRewardRepository {
  queue(input: {
    workspaceId: string;
    userId: string;
    badgeAwardId: string;
    policy: BadgeRewardPolicy;
    now: Date;
  }): Promise<BadgeRewardQueueResult | null>;
  fulfillEntitlement(input: {
    workspaceId: string;
    userId: string;
    rewardLinkId: string;
    outboxId: string;
    now: Date;
  }): Promise<BadgeRewardEntitlementRecord | null>;
}

const featureKey = (value: string) => {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)*$/.test(normalized) || normalized.length > 120)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reward featureKey');
  return normalized;
};

const policy = (value: BadgeRewardPolicy): BadgeRewardPolicy => {
  if (value.type !== 'ENTITLEMENT' || value.revocationPolicy !== 'REVOKE_UNUSED')
    throw new ApplicationError('VALIDATION_ERROR', 'unsupported badge reward policy');
  if (!Number.isSafeInteger(value.quantity) || value.quantity < 1 || value.quantity > 100)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reward quantity');
  if (
    value.expiresInDays !== null &&
    (!Number.isSafeInteger(value.expiresInDays) ||
      value.expiresInDays < 1 ||
      value.expiresInDays > 365)
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reward expiry');
  if (
    !Number.isSafeInteger(value.maxUnitCostUsdMicros) ||
    value.maxUnitCostUsdMicros < 0 ||
    value.maxUnitCostUsdMicros > 100_000_000
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reward cost cap');
  return { ...value, featureKey: featureKey(value.featureKey) };
};

export class QueueBadgeReward {
  constructor(private readonly repository: BadgeRewardRepository) {}
  async execute(input: {
    workspaceId: string;
    userId: string;
    badgeAwardId: string;
    policy: BadgeRewardPolicy;
    now?: Date;
  }) {
    const result = await this.repository.queue({
      ...input,
      policy: policy(input.policy),
      now: input.now ?? new Date(),
    });
    if (!result) throw new ApplicationError('NOT_FOUND', 'active badge award not found');
    return result;
  }
}

export class FulfillBadgeRewardEntitlement {
  constructor(private readonly repository: BadgeRewardRepository) {}
  async execute(input: {
    workspaceId: string;
    userId: string;
    rewardLinkId: string;
    outboxId: string;
    now?: Date;
  }) {
    const result = await this.repository.fulfillEntitlement({
      ...input,
      now: input.now ?? new Date(),
    });
    if (!result) throw new ApplicationError('NOT_FOUND', 'pending badge reward not found');
    return result;
  }
}
