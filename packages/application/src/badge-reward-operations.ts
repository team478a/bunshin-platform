import { ApplicationError } from '@bunshin/shared';
import type {
  BadgeRewardEntitlementStatus,
  BadgeRewardLinkStatus,
  BadgeRewardOutboxStatus,
} from './badge-reward';

export interface BadgeRewardOperationItem {
  rewardLinkId: string;
  workspaceId: string;
  workspaceName: string;
  groupId: string | null;
  groupName: string | null;
  userId: string;
  userDisplayName: string;
  badgeTitle: string;
  linkStatus: BadgeRewardLinkStatus;
  outboxStatus: BadgeRewardOutboxStatus;
  attemptCount: number;
  maxAttempts: number;
  failureCode: string | null;
  entitlementStatus: BadgeRewardEntitlementStatus | null;
  quantityRemaining: number | null;
  expiresAt: Date | null;
  updatedAt: Date;
}

export interface BadgeRewardUsageAuditItem {
  usageId: string;
  workspaceId: string;
  workspaceName: string;
  userDisplayName: string;
  badgeTitle: string;
  featureKey: string;
  resourceType: string;
  status: 'CONSUMED' | 'REFUNDED';
  consumedAt: Date;
  refundedAt: Date | null;
  refundReason: string | null;
}

export interface BadgeRewardAdminAuditItem {
  auditId: string;
  workspaceId: string | null;
  rewardLinkId: string | null;
  action: string;
  reason: string;
  performedBy: string;
  occurredAt: Date;
}

export interface BadgeRewardOperationsSnapshot {
  rewards: BadgeRewardOperationItem[];
  usages: BadgeRewardUsageAuditItem[];
  audits: BadgeRewardAdminAuditItem[];
}

export interface BadgeRewardOperationsRepository {
  inspect(input: {
    workspaceId: string | null;
    limit: number;
  }): Promise<BadgeRewardOperationsSnapshot>;
  retry(input: {
    workspaceId: string;
    rewardLinkId: string;
    actorUserId: string;
    reason: string;
    now: Date;
  }): Promise<BadgeRewardOperationItem | null>;
  fulfillManually(input: {
    workspaceId: string;
    rewardLinkId: string;
    actorUserId: string;
    reason: string;
    now: Date;
  }): Promise<BadgeRewardOperationItem | null>;
}

const required = (value: string, field: string, max = 1000) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export class InspectBadgeRewardOperations {
  constructor(private readonly repository: BadgeRewardOperationsRepository) {}
  execute(input: { workspaceId?: string | null; limit?: number } = {}) {
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid operation limit');
    return this.repository.inspect({
      workspaceId: input.workspaceId ? required(input.workspaceId, 'workspace id', 200) : null,
      limit,
    });
  }
}

abstract class MutateBadgeRewardOperation {
  abstract executeRepository(input: {
    workspaceId: string;
    rewardLinkId: string;
    actorUserId: string;
    reason: string;
    now: Date;
  }): Promise<BadgeRewardOperationItem | null>;
  async execute(input: {
    workspaceId: string;
    rewardLinkId: string;
    actorUserId: string;
    reason: string;
    now?: Date;
  }) {
    const result = await this.executeRepository({
      workspaceId: required(input.workspaceId, 'workspace id', 200),
      rewardLinkId: required(input.rewardLinkId, 'reward link id', 200),
      actorUserId: required(input.actorUserId, 'actor user id', 200),
      reason: required(input.reason, 'operation reason'),
      now: input.now ?? new Date(),
    });
    if (!result) throw new ApplicationError('CONFLICT', 'badge reward operation unavailable');
    return result;
  }
}

export class RetryBadgeRewardOperation extends MutateBadgeRewardOperation {
  constructor(private readonly repository: BadgeRewardOperationsRepository) {
    super();
  }
  executeRepository(input: Parameters<BadgeRewardOperationsRepository['retry']>[0]) {
    return this.repository.retry(input);
  }
}

export class FulfillBadgeRewardManually extends MutateBadgeRewardOperation {
  constructor(private readonly repository: BadgeRewardOperationsRepository) {
    super();
  }
  executeRepository(input: Parameters<BadgeRewardOperationsRepository['fulfillManually']>[0]) {
    return this.repository.fulfillManually(input);
  }
}
