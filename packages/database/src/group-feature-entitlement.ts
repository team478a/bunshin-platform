import type {
  EffectiveGroupFeatureAccess,
  GroupFeatureEntitlementRepository,
  GroupFeaturePolicyRecord,
  GroupMemberFeatureAssignmentRecord,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';

const featurePolicyRecord = (
  row: Prisma.GroupFeaturePolicyGetPayload<object>,
): GroupFeaturePolicyRecord => ({ ...row, config: row.config });

const memberFeatureAssignmentRecord = (
  row: Prisma.GroupMemberFeatureAssignmentGetPayload<object>,
): GroupMemberFeatureAssignmentRecord => ({ ...row, config: row.config });

const activeAt = (startsAt: Date | null, endsAt: Date | null, now: Date) =>
  (startsAt === null || startsAt <= now) && (endsAt === null || endsAt > now);

const lowestLimit = (values: Array<number | null>) => {
  const limits = values.filter((value): value is number => value !== null);
  return limits.length === 0 ? null : Math.min(...limits);
};

export class PrismaGroupFeatureEntitlementRepository implements GroupFeatureEntitlementRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listDefinitions() {
    return this.client.featureDefinition.findMany({
      select: { key: true, parentKey: true, name: true, description: true, status: true },
      orderBy: [{ parentKey: 'asc' }, { key: 'asc' }],
    });
  }

  async setGroupPolicy(input: Parameters<GroupFeatureEntitlementRepository['setGroupPolicy']>[0]) {
    const [admin, group, feature] = await Promise.all([
      this.client.platformAdmin.findFirst({
        where: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
        },
        select: { id: true },
      }),
      this.client.group.findFirst({
        where: {
          id: input.groupId,
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
        },
        select: { id: true },
      }),
      this.client.featureDefinition.findFirst({
        where: { key: input.featureKey, status: 'ACTIVE' },
        select: { key: true },
      }),
    ]);
    if (!admin || !group || !feature) return null;
    return this.client.$transaction(async (tx) => {
      const before = await tx.groupFeaturePolicy.findUnique({
        where: { groupId_featureKey: { groupId: input.groupId, featureKey: input.featureKey } },
      });
      const policy = await tx.groupFeaturePolicy.upsert({
        where: { groupId_featureKey: { groupId: input.groupId, featureKey: input.featureKey } },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          featureKey: input.featureKey,
          status: input.status,
          dailyLimit: input.dailyLimit ?? null,
          monthlyLimit: input.monthlyLimit ?? null,
          config: input.config as Prisma.InputJsonValue,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          setByUserId: input.actorUserId,
        },
        update: {
          status: input.status,
          dailyLimit: input.dailyLimit ?? null,
          monthlyLimit: input.monthlyLimit ?? null,
          config: input.config as Prisma.InputJsonValue,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          setByUserId: input.actorUserId,
        },
      });
      await tx.groupFeatureAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          featureKey: input.featureKey,
          action: 'GROUP_POLICY_SET',
          beforeData: before
            ? {
                status: before.status,
                dailyLimit: before.dailyLimit,
                monthlyLimit: before.monthlyLimit,
              }
            : Prisma.JsonNull,
          afterData: {
            status: policy.status,
            dailyLimit: policy.dailyLimit,
            monthlyLimit: policy.monthlyLimit,
          },
          reason: input.reason,
          performedByUserId: input.actorUserId,
        },
      });
      return featurePolicyRecord(policy);
    });
  }

  async setMemberAssignment(
    input: Parameters<GroupFeatureEntitlementRepository['setMemberAssignment']>[0],
  ) {
    const [manager, target, policy] = await Promise.all([
      this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          OR: [
            { role: 'MANAGER' },
            {
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
              group: { serviceConfiguration: { isNot: null } },
            },
          ],
          status: 'ACTIVE',
          group: { status: 'ACTIVE' },
          workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
        },
        select: { id: true },
      }),
      this.client.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
      this.client.groupFeaturePolicy.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          featureKey: input.featureKey,
          feature: { status: 'ACTIVE' },
        },
      }),
    ]);
    if (!manager || !target || !policy) return null;
    if (input.status === 'ENABLED' && policy.status !== 'ENABLED') return null;
    if (
      (policy.dailyLimit !== null &&
        input.dailyLimit !== null &&
        input.dailyLimit !== undefined &&
        input.dailyLimit > policy.dailyLimit) ||
      (policy.monthlyLimit !== null &&
        input.monthlyLimit !== null &&
        input.monthlyLimit !== undefined &&
        input.monthlyLimit > policy.monthlyLimit)
    )
      return null;
    return this.client.$transaction(
      async (tx) => {
        const before = await tx.groupMemberFeatureAssignment.findUnique({
          where: {
            groupMembershipId_featureKey: {
              groupMembershipId: input.groupMembershipId,
              featureKey: input.featureKey,
            },
          },
        });
        const assignment = await tx.groupMemberFeatureAssignment.upsert({
          where: {
            groupMembershipId_featureKey: {
              groupMembershipId: input.groupMembershipId,
              featureKey: input.featureKey,
            },
          },
          create: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: input.groupMembershipId,
            featureKey: input.featureKey,
            status: input.status,
            dailyLimit: input.dailyLimit ?? null,
            monthlyLimit: input.monthlyLimit ?? null,
            config: input.config as Prisma.InputJsonValue,
            startsAt: input.startsAt ?? null,
            endsAt: input.endsAt ?? null,
            assignedByUserId: input.actorUserId,
          },
          update: {
            status: input.status,
            dailyLimit: input.dailyLimit ?? null,
            monthlyLimit: input.monthlyLimit ?? null,
            config: input.config as Prisma.InputJsonValue,
            startsAt: input.startsAt ?? null,
            endsAt: input.endsAt ?? null,
            assignedByUserId: input.actorUserId,
          },
        });
        await tx.groupFeatureAuditLog.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: input.groupMembershipId,
            featureKey: input.featureKey,
            action: 'MEMBER_ASSIGNMENT_SET',
            beforeData: before
              ? {
                  status: before.status,
                  dailyLimit: before.dailyLimit,
                  monthlyLimit: before.monthlyLimit,
                }
              : Prisma.JsonNull,
            afterData: {
              status: assignment.status,
              dailyLimit: assignment.dailyLimit,
              monthlyLimit: assignment.monthlyLimit,
            },
            reason: input.reason,
            performedByUserId: input.actorUserId,
          },
        });
        return memberFeatureAssignmentRecord(assignment);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async resolveAccess(
    input: Parameters<GroupFeatureEntitlementRepository['resolveAccess']>[0],
  ): Promise<EffectiveGroupFeatureAccess | null> {
    return this.resolveAccessWith(this.client, input);
  }

  private async resolveAccessWith(
    client: PrismaClient | Prisma.TransactionClient,
    input: Parameters<GroupFeatureEntitlementRepository['resolveAccess']>[0],
  ): Promise<EffectiveGroupFeatureAccess | null> {
    const membership = await client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        group: { status: 'ACTIVE' },
        workspace: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!membership) return null;
    const requiredKeys: string[] = [];
    const visitedKeys = new Set<string>();
    let currentKey: string | null = input.featureKey;
    while (currentKey) {
      if (visitedKeys.has(currentKey) || requiredKeys.length >= 16)
        return this.denied('FEATURE_UNAVAILABLE');
      visitedKeys.add(currentKey);
      const definition: {
        key: string;
        parentKey: string | null;
        status: 'ACTIVE' | 'RETIRED';
      } | null = await client.featureDefinition.findUnique({
        where: { key: currentKey },
        select: { key: true, parentKey: true, status: true },
      });
      if (!definition || definition.status !== 'ACTIVE') return this.denied('FEATURE_UNAVAILABLE');
      requiredKeys.push(definition.key);
      currentKey = definition.parentKey;
    }
    const [policies, assignments] = await Promise.all([
      client.groupFeaturePolicy.findMany({
        where: { groupId: input.groupId, featureKey: { in: requiredKeys } },
      }),
      client.groupMemberFeatureAssignment.findMany({
        where: { groupMembershipId: membership.id, featureKey: { in: requiredKeys } },
      }),
    ]);
    if (
      requiredKeys.some(
        (key) => !policies.some((value) => value.featureKey === key && value.status === 'ENABLED'),
      )
    )
      return this.denied('GROUP_NOT_ALLOWED');
    if (
      requiredKeys.some(
        (key) =>
          !assignments.some((value) => value.featureKey === key && value.status === 'ENABLED'),
      )
    )
      return this.denied('MEMBER_NOT_ALLOWED');
    if (
      [...policies, ...assignments].some(
        ({ startsAt, endsAt }) => !activeAt(startsAt, endsAt, input.now),
      )
    )
      return this.denied('OUTSIDE_VALIDITY_PERIOD');
    return {
      allowed: true,
      reason: 'ALLOWED',
      dailyLimit: lowestLimit([
        ...policies.map(({ dailyLimit }) => dailyLimit),
        ...assignments.map(({ dailyLimit }) => dailyLimit),
      ]),
      monthlyLimit: lowestLimit([
        ...policies.map(({ monthlyLimit }) => monthlyLimit),
        ...assignments.map(({ monthlyLimit }) => monthlyLimit),
      ]),
    };
  }

  async consumeAccess(
    input: Parameters<GroupFeatureEntitlementRepository['consumeAccess']>[0],
  ): Promise<EffectiveGroupFeatureAccess | null> {
    return this.client.$transaction(
      async (tx) => {
        const membership = await tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.actorUserId,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (!membership) return null;
        const existing = await tx.groupFeatureUsageEvent.findUnique({
          where: {
            groupMembershipId_featureKey_operationKey: {
              groupMembershipId: membership.id,
              featureKey: input.featureKey,
              operationKey: input.operationKey,
            },
          },
        });
        const access = await this.resolveAccessWith(tx, input);
        if (!access || !access.allowed) return access;
        const localMonth = input.localDate.slice(0, 7);
        const [dailyUsed, monthlyUsed] = await Promise.all([
          tx.groupFeatureUsageEvent.count({
            where: {
              groupMembershipId: membership.id,
              featureKey: input.featureKey,
              localDate: input.localDate,
            },
          }),
          tx.groupFeatureUsageEvent.count({
            where: {
              groupMembershipId: membership.id,
              featureKey: input.featureKey,
              localMonth,
            },
          }),
        ]);
        if (existing)
          return {
            ...access,
            dailyUsed,
            monthlyUsed,
            alreadyConsumed: true,
          };
        if (access.dailyLimit !== null && dailyUsed >= access.dailyLimit)
          return {
            ...this.denied('DAILY_LIMIT_REACHED'),
            dailyUsed,
            monthlyUsed,
          };
        if (access.monthlyLimit !== null && monthlyUsed >= access.monthlyLimit)
          return {
            ...this.denied('MONTHLY_LIMIT_REACHED'),
            dailyUsed,
            monthlyUsed,
          };
        await tx.groupFeatureUsageEvent.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: membership.id,
            featureKey: input.featureKey,
            actorUserId: input.actorUserId,
            operationKey: input.operationKey,
            localDate: input.localDate,
            localMonth,
            occurredAt: input.now,
          },
        });
        return {
          ...access,
          dailyUsed: dailyUsed + 1,
          monthlyUsed: monthlyUsed + 1,
          alreadyConsumed: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private denied(reason: EffectiveGroupFeatureAccess['reason']): EffectiveGroupFeatureAccess {
    return { allowed: false, reason, dailyLimit: null, monthlyLimit: null };
  }
}
