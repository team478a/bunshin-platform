import { ApplicationError } from '@bunshin/shared';

export type BadgeEntitlementUsageStatus = 'CONSUMED' | 'REFUNDED';

export interface BadgeEntitlementUsageRecord {
  id: string;
  workspaceId: string;
  userId: string;
  entitlementId: string;
  featureKey: string;
  resourceType: string;
  resourceId: string;
  operationKey: string;
  estimatedCostUsdMicros: number;
  status: BadgeEntitlementUsageStatus;
  consumedAt: Date;
  refundedAt: Date | null;
  refundReason: string | null;
}

export interface BadgeEntitlementConsumptionRepository {
  consume(input: {
    workspaceId: string;
    userId: string;
    featureKey: string;
    resourceType: string;
    resourceId: string;
    operationKey: string;
    estimatedCostUsdMicros: number;
    now: Date;
  }): Promise<BadgeEntitlementUsageRecord | null>;
  findByResource(input: {
    workspaceId: string;
    userId: string;
    resourceType: string;
    resourceId: string;
  }): Promise<BadgeEntitlementUsageRecord | null>;
  refund(input: {
    workspaceId: string;
    userId: string;
    usageId: string;
    reason: string;
    now: Date;
  }): Promise<BadgeEntitlementUsageRecord | null>;
}

const required = (value: string, field: string, max = 200) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

const normalizedFeatureKey = (value: string) => {
  const normalized = required(value, 'feature key', 120).toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)*$/.test(normalized))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid feature key');
  return normalized;
};

export class TryConsumeBadgeEntitlement {
  constructor(private readonly repository: BadgeEntitlementConsumptionRepository) {}
  execute(input: {
    workspaceId: string;
    userId: string;
    featureKey: string;
    resourceType: string;
    resourceId: string;
    operationKey: string;
    estimatedCostUsdMicros: number;
    now?: Date;
  }) {
    if (!Number.isSafeInteger(input.estimatedCostUsdMicros) || input.estimatedCostUsdMicros < 0)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid estimated cost');
    return this.repository.consume({
      workspaceId: required(input.workspaceId, 'workspace id'),
      userId: required(input.userId, 'user id'),
      featureKey: normalizedFeatureKey(input.featureKey),
      resourceType: required(input.resourceType, 'resource type', 100),
      resourceId: required(input.resourceId, 'resource id'),
      operationKey: required(input.operationKey, 'operation key'),
      estimatedCostUsdMicros: input.estimatedCostUsdMicros,
      now: input.now ?? new Date(),
    });
  }
}

export class GetBadgeEntitlementUsageByResource {
  constructor(private readonly repository: BadgeEntitlementConsumptionRepository) {}
  execute(input: {
    workspaceId: string;
    userId: string;
    resourceType: string;
    resourceId: string;
  }) {
    return this.repository.findByResource({
      workspaceId: required(input.workspaceId, 'workspace id'),
      userId: required(input.userId, 'user id'),
      resourceType: required(input.resourceType, 'resource type', 100),
      resourceId: required(input.resourceId, 'resource id'),
    });
  }
}

export class RefundBadgeEntitlementUsage {
  constructor(private readonly repository: BadgeEntitlementConsumptionRepository) {}
  async execute(input: {
    workspaceId: string;
    userId: string;
    usageId: string;
    reason: string;
    now?: Date;
  }) {
    const value = await this.repository.refund({
      workspaceId: required(input.workspaceId, 'workspace id'),
      userId: required(input.userId, 'user id'),
      usageId: required(input.usageId, 'usage id'),
      reason: required(input.reason, 'reason', 500),
      now: input.now ?? new Date(),
    });
    if (!value) throw new ApplicationError('CONFLICT', 'badge entitlement refund failed');
    return value;
  }
}
