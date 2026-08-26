import { ApplicationError } from '@bunshin/shared';

export type GroupFeatureAccessStatus = 'ENABLED' | 'DISABLED';

export interface FeatureDefinitionRecord {
  key: string;
  parentKey: string | null;
  name: string;
  description: string;
  status: 'ACTIVE' | 'RETIRED';
}

export interface GroupFeaturePolicyRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  featureKey: string;
  status: GroupFeatureAccessStatus;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  config: unknown;
  startsAt: Date | null;
  endsAt: Date | null;
  setByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMemberFeatureAssignmentRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  featureKey: string;
  status: GroupFeatureAccessStatus;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  config: unknown;
  startsAt: Date | null;
  endsAt: Date | null;
  assignedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EffectiveGroupFeatureAccess {
  allowed: boolean;
  reason:
    | 'ALLOWED'
    | 'FEATURE_UNAVAILABLE'
    | 'GROUP_NOT_ALLOWED'
    | 'MEMBER_NOT_ALLOWED'
    | 'OUTSIDE_VALIDITY_PERIOD';
  dailyLimit: number | null;
  monthlyLimit: number | null;
}

type AccessInput = {
  workspaceId: string;
  groupId: string;
  featureKey: string;
  status: GroupFeatureAccessStatus;
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
  config?: unknown;
  startsAt?: Date | null;
  endsAt?: Date | null;
  reason: string;
  actorUserId: string;
};

export interface GroupFeatureEntitlementRepository {
  listDefinitions(): Promise<FeatureDefinitionRecord[]>;
  setGroupPolicy(input: AccessInput): Promise<GroupFeaturePolicyRecord | null>;
  setMemberAssignment(
    input: AccessInput & { groupMembershipId: string },
  ): Promise<GroupMemberFeatureAssignmentRecord | null>;
  resolveAccess(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    featureKey: string;
    now: Date;
  }): Promise<EffectiveGroupFeatureAccess | null>;
}

const featureKey = (value: string) => {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)*$/.test(normalized) || normalized.length > 120)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid featureKey');
  return normalized;
};

const limit = (value: number | null | undefined, field: string) => {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 1_000_000)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
};

const normalizedAccess = <T extends AccessInput>(input: T) => {
  const reason = input.reason.trim();
  if (reason.length < 1 || reason.length > 1000)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
  if (input.startsAt && input.endsAt && input.startsAt >= input.endsAt)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid validity period');
  return {
    ...input,
    featureKey: featureKey(input.featureKey),
    dailyLimit: limit(input.dailyLimit, 'dailyLimit'),
    monthlyLimit: limit(input.monthlyLimit, 'monthlyLimit'),
    config: input.config ?? {},
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    reason,
  };
};

export class GroupFeatureEntitlementService {
  constructor(private readonly repository: GroupFeatureEntitlementRepository) {}

  listDefinitions() {
    return this.repository.listDefinitions();
  }

  async setGroupPolicy(input: AccessInput) {
    const value = await this.repository.setGroupPolicy(normalizedAccess(input));
    if (!value) throw new ApplicationError('FORBIDDEN', 'group feature policy denied');
    return value;
  }

  async setMemberAssignment(input: AccessInput & { groupMembershipId: string }) {
    const value = await this.repository.setMemberAssignment(normalizedAccess(input));
    if (!value) throw new ApplicationError('FORBIDDEN', 'member feature assignment denied');
    return value;
  }

  async resolveAccess(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    featureKey: string;
    now?: Date;
  }) {
    const value = await this.repository.resolveAccess({
      ...input,
      featureKey: featureKey(input.featureKey),
      now: input.now ?? new Date(),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'group membership unavailable');
    return value;
  }
}
