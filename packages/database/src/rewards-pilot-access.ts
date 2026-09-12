import { Prisma } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';

export const REWARDS_PILOT_FEATURE_KEY = 'REWARDS.POINTS_BADGES';

type RewardsPilotAssignmentClient = Pick<
  Prisma.TransactionClient,
  'groupMembership' | 'groupFeaturePolicy' | 'groupMemberFeatureAssignment' | 'groupFeatureAuditLog'
>;

type RewardsPilotPeriodClient = Pick<
  Prisma.TransactionClient,
  'groupMembership' | 'groupFeaturePolicy' | 'featureDefinition' | 'groupFeatureAuditLog'
>;

export async function startFourWeekRewardsPilot(
  client: RewardsPilotPeriodClient,
  input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    reason: string;
    now: Date;
  },
) {
  const reason = input.reason.trim();
  if (reason.length < 1 || reason.length > 1000)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
  const [manager, feature, previous] = await Promise.all([
    client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        OR: [
          { role: 'MANAGER' },
          {
            serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
            group: { serviceConfiguration: { isNot: null } },
          },
        ],
        group: {
          status: 'ACTIVE',
          serviceConfiguration: { isNot: null },
          workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
        },
      },
      select: { id: true },
    }),
    client.featureDefinition.findFirst({
      where: { key: REWARDS_PILOT_FEATURE_KEY, status: 'ACTIVE' },
      select: { key: true },
    }),
    client.groupFeaturePolicy.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        featureKey: REWARDS_PILOT_FEATURE_KEY,
      },
    }),
  ]);
  if (!manager || !feature)
    throw new ApplicationError('FORBIDDEN', 'rewards pilot period denied');
  if (
    previous?.status === 'ENABLED' &&
    previous.startsAt &&
    previous.startsAt <= input.now &&
    previous.endsAt &&
    previous.endsAt > input.now &&
    previous.endsAt.getTime() - previous.startsAt.getTime() >= 28 * 24 * 60 * 60 * 1000
  )
    throw new ApplicationError('CONFLICT', 'rewards pilot already active');

  const endsAt = new Date(input.now.getTime() + 28 * 24 * 60 * 60 * 1000);
  const policy = await client.groupFeaturePolicy.upsert({
    where: {
      groupId_featureKey: {
        groupId: input.groupId,
        featureKey: REWARDS_PILOT_FEATURE_KEY,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      featureKey: REWARDS_PILOT_FEATURE_KEY,
      status: 'ENABLED',
      startsAt: input.now,
      endsAt,
      setByUserId: input.actorUserId,
    },
    update: {
      status: 'ENABLED',
      startsAt: input.now,
      endsAt,
      setByUserId: input.actorUserId,
    },
  });
  await client.groupFeatureAuditLog.create({
    data: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      featureKey: REWARDS_PILOT_FEATURE_KEY,
      action: 'GROUP_POLICY_SET',
      beforeData: previous
        ? {
            status: previous.status,
            startsAt: previous.startsAt?.toISOString() ?? null,
            endsAt: previous.endsAt?.toISOString() ?? null,
          }
        : Prisma.JsonNull,
      afterData: {
        status: policy.status,
        startsAt: policy.startsAt?.toISOString() ?? null,
        endsAt: policy.endsAt?.toISOString() ?? null,
      },
      reason,
      performedByUserId: input.actorUserId,
      occurredAt: input.now,
    },
  });
  return policy;
}

export async function replaceRewardsPilotMemberAssignments(
  client: RewardsPilotAssignmentClient,
  input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    membershipIds: string[];
    reason: string;
    now: Date;
  },
) {
  const reason = input.reason.trim();
  if (reason.length < 1 || reason.length > 1000)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
  const membershipIds = [...new Set(input.membershipIds)];
  if (membershipIds.length < 1 || membershipIds.length > 30)
    throw new ApplicationError('VALIDATION_ERROR', 'rewards pilot requires 1 to 30 members');
  const [manager, policy, targets, currentAssignments] = await Promise.all([
    client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        OR: [
          { role: 'MANAGER' },
          {
            serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
            group: { serviceConfiguration: { isNot: null } },
          },
        ],
      },
      select: { id: true },
    }),
    client.groupFeaturePolicy.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        featureKey: REWARDS_PILOT_FEATURE_KEY,
        status: 'ENABLED',
      },
      select: { startsAt: true, endsAt: true },
    }),
    client.groupMembership.findMany({
      where: {
        id: { in: membershipIds },
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        consentedAt: { not: null },
      },
      select: { id: true },
    }),
    client.groupMemberFeatureAssignment.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        featureKey: REWARDS_PILOT_FEATURE_KEY,
      },
    }),
  ]);
  if (!manager || !policy)
    throw new ApplicationError('FORBIDDEN', 'rewards pilot assignment denied');
  if (targets.length !== membershipIds.length)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid rewards pilot member');
  if (
    !policy.startsAt ||
    policy.startsAt > input.now ||
    !policy.endsAt ||
    policy.endsAt <= input.now ||
    policy.endsAt.getTime() - policy.startsAt.getTime() < 28 * 24 * 60 * 60 * 1000
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid rewards pilot period');

  const selected = new Set(membershipIds);
  let disabledCount = 0;
  let enabledCount = 0;
  for (const assignment of currentAssignments) {
    if (assignment.status !== 'ENABLED' || selected.has(assignment.groupMembershipId)) continue;
    await client.groupMemberFeatureAssignment.update({
      where: { id: assignment.id },
      data: { status: 'DISABLED', assignedByUserId: input.actorUserId },
    });
    await client.groupFeatureAuditLog.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: assignment.groupMembershipId,
        featureKey: REWARDS_PILOT_FEATURE_KEY,
        action: 'MEMBER_ASSIGNMENT_SET',
        beforeData: { status: assignment.status },
        afterData: { status: 'DISABLED' },
        reason,
        performedByUserId: input.actorUserId,
        occurredAt: input.now,
      },
    });
    disabledCount += 1;
  }
  for (const membershipId of membershipIds) {
    const before = currentAssignments.find(
      (assignment) => assignment.groupMembershipId === membershipId,
    );
    await client.groupMemberFeatureAssignment.upsert({
      where: {
        groupMembershipId_featureKey: {
          groupMembershipId: membershipId,
          featureKey: REWARDS_PILOT_FEATURE_KEY,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: membershipId,
        featureKey: REWARDS_PILOT_FEATURE_KEY,
        status: 'ENABLED',
        startsAt: policy.startsAt,
        endsAt: policy.endsAt,
        assignedByUserId: input.actorUserId,
      },
      update: {
        status: 'ENABLED',
        startsAt: policy.startsAt,
        endsAt: policy.endsAt,
        assignedByUserId: input.actorUserId,
      },
    });
    await client.groupFeatureAuditLog.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: membershipId,
        featureKey: REWARDS_PILOT_FEATURE_KEY,
        action: 'MEMBER_ASSIGNMENT_SET',
        beforeData: before
          ? {
              status: before.status,
              startsAt: before.startsAt?.toISOString() ?? null,
              endsAt: before.endsAt?.toISOString() ?? null,
            }
          : Prisma.JsonNull,
        afterData: {
          status: 'ENABLED',
          startsAt: policy.startsAt?.toISOString() ?? null,
          endsAt: policy.endsAt?.toISOString() ?? null,
        },
        reason,
        performedByUserId: input.actorUserId,
        occurredAt: input.now,
      },
    });
    enabledCount += 1;
  }
  return { enabledCount, disabledCount };
}

type RewardsPilotAccessClient = Pick<Prisma.TransactionClient, 'groupMembership'>;

export type RewardsPilotAccess = {
  membershipId: string;
  groupId: string;
  endsAt: Date | null;
};

export type RewardsPilotServiceAccess = RewardsPilotAccess & {
  workspaceId: string;
  serviceSlug: string;
  serviceName: string;
};

const earliestDate = (values: Array<Date | null>) => {
  const dates = values.filter((value): value is Date => value !== null);
  return dates.length ? new Date(Math.min(...dates.map((value) => value.getTime()))) : null;
};

export async function getActiveRewardsPilotAccess(
  client: RewardsPilotAccessClient,
  scope: { workspaceId: string; userId: string; groupId?: string },
  at = new Date(),
): Promise<RewardsPilotAccess | null> {
  const activeWindow = {
    status: 'ENABLED' as const,
    OR: [{ startsAt: null }, { startsAt: { lte: at } }],
    AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: at } }] }],
  };
  const membership = await client.groupMembership.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      ...(scope.groupId ? { groupId: scope.groupId } : {}),
      status: 'ACTIVE',
      consentedAt: { not: null },
      group: {
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        featurePolicies: {
          some: { featureKey: REWARDS_PILOT_FEATURE_KEY, ...activeWindow },
        },
      },
      featureAssignments: {
        some: { featureKey: REWARDS_PILOT_FEATURE_KEY, ...activeWindow },
      },
    },
    select: {
      id: true,
      groupId: true,
      group: {
        select: {
          featurePolicies: {
            where: { featureKey: REWARDS_PILOT_FEATURE_KEY, ...activeWindow },
            select: { endsAt: true },
          },
        },
      },
      featureAssignments: {
        where: { featureKey: REWARDS_PILOT_FEATURE_KEY, ...activeWindow },
        select: { endsAt: true },
      },
    },
  });
  if (!membership) return null;
  return {
    membershipId: membership.id,
    groupId: membership.groupId,
    endsAt: earliestDate([
      ...membership.group.featurePolicies.map(({ endsAt }) => endsAt),
      ...membership.featureAssignments.map(({ endsAt }) => endsAt),
    ]),
  };
}

export async function hasActiveRewardsPilotAccess(
  client: RewardsPilotAccessClient,
  scope: { workspaceId: string; userId: string; groupId?: string },
  at = new Date(),
) {
  return Boolean(await getActiveRewardsPilotAccess(client, scope, at));
}

export async function listActiveRewardsPilotServiceAccesses(
  client: RewardsPilotAccessClient,
  scope: { workspaceId: string; userId: string },
  at = new Date(),
): Promise<RewardsPilotServiceAccess[]> {
  const activeWindow = {
    status: 'ENABLED' as const,
    OR: [{ startsAt: null }, { startsAt: { lte: at } }],
    AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: at } }] }],
  };
  const memberships = await client.groupMembership.findMany({
    where: {
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      status: 'ACTIVE',
      consentedAt: { not: null },
      group: {
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        serviceConfiguration: { isNot: null },
        featurePolicies: {
          some: { featureKey: REWARDS_PILOT_FEATURE_KEY, ...activeWindow },
        },
      },
      featureAssignments: {
        some: { featureKey: REWARDS_PILOT_FEATURE_KEY, ...activeWindow },
      },
    },
    select: {
      id: true,
      workspaceId: true,
      groupId: true,
      group: {
        select: {
          serviceConfiguration: { select: { slug: true, displayName: true } },
          featurePolicies: {
            where: { featureKey: REWARDS_PILOT_FEATURE_KEY, ...activeWindow },
            select: { endsAt: true },
          },
        },
      },
      featureAssignments: {
        where: { featureKey: REWARDS_PILOT_FEATURE_KEY, ...activeWindow },
        select: { endsAt: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return memberships.flatMap((membership) => {
    const service = membership.group.serviceConfiguration;
    if (!service) return [];
    return [
      {
        membershipId: membership.id,
        workspaceId: membership.workspaceId,
        groupId: membership.groupId,
        serviceSlug: service.slug,
        serviceName: service.displayName,
        endsAt: earliestDate([
          ...membership.group.featurePolicies.map(({ endsAt }) => endsAt),
          ...membership.featureAssignments.map(({ endsAt }) => endsAt),
        ]),
      },
    ];
  });
}
