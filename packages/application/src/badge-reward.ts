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

export interface BadgeRewardWorkItem {
  outboxId: string;
  rewardLinkId: string;
  workspaceId: string;
  userId: string;
  attemptCount: number;
  maxAttempts: number;
}

export interface BadgeRewardWorkerSummary {
  claimed: number;
  completed: number;
  retryScheduled: number;
  dead: number;
  infrastructureFailures: number;
  drained: boolean;
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
  claimNext(input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<BadgeRewardWorkItem | null>;
  fail(input: {
    outboxId: string;
    rewardLinkId: string;
    workerId: string;
    failureCode: string;
    now: Date;
    retryAt: Date;
  }): Promise<'RETRY' | 'DEAD' | null>;
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

const safeFailureCode = (error: unknown) =>
  error instanceof ApplicationError
    ? `APPLICATION_${error.code}`
    : 'BADGE_REWARD_FULFILLMENT_FAILED';

export class RunBadgeRewardWorkerBatch {
  constructor(
    private readonly repository: BadgeRewardRepository,
    private readonly now = () => new Date(),
    private readonly maximumBatchSize = 10,
    private readonly leaseMilliseconds = 60_000,
  ) {}

  async execute(input: {
    workerId: string;
    batchSize?: number;
  }): Promise<BadgeRewardWorkerSummary> {
    const workerId = input.workerId.trim();
    const batchSize = input.batchSize ?? 5;
    if (workerId.length < 3 || workerId.length > 120)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge reward workerId');
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > this.maximumBatchSize)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge reward batch size');
    const summary: BadgeRewardWorkerSummary = {
      claimed: 0,
      completed: 0,
      retryScheduled: 0,
      dead: 0,
      infrastructureFailures: 0,
      drained: false,
    };
    while (summary.claimed < batchSize) {
      const claimedAt = this.now();
      const item = await this.repository.claimNext({
        workerId,
        now: claimedAt,
        leaseExpiresAt: new Date(claimedAt.getTime() + this.leaseMilliseconds),
      });
      if (!item) {
        summary.drained = true;
        break;
      }
      summary.claimed += 1;
      try {
        const completed = await this.repository.fulfillEntitlement({
          workspaceId: item.workspaceId,
          userId: item.userId,
          rewardLinkId: item.rewardLinkId,
          outboxId: item.outboxId,
          now: this.now(),
        });
        if (!completed)
          throw new ApplicationError('CONFLICT', 'badge reward fulfillment unavailable');
        summary.completed += 1;
      } catch (error) {
        const failedAt = this.now();
        const delay = Math.min(3_600_000, 30_000 * 2 ** Math.max(0, item.attemptCount - 1));
        const status = await this.repository.fail({
          outboxId: item.outboxId,
          rewardLinkId: item.rewardLinkId,
          workerId,
          failureCode: safeFailureCode(error),
          now: failedAt,
          retryAt: new Date(failedAt.getTime() + delay),
        });
        if (status === 'RETRY') summary.retryScheduled += 1;
        else if (status === 'DEAD') summary.dead += 1;
        else summary.infrastructureFailures += 1;
      }
    }
    return summary;
  }
}
