import type { Prisma } from '@prisma/client';

export const REWARDS_PILOT_FEATURE_KEY = 'REWARDS.POINTS_BADGES';

type RewardsPilotAccessClient = Pick<Prisma.TransactionClient, 'groupMembership'>;

export type RewardsPilotAccess = {
  membershipId: string;
  groupId: string;
  endsAt: Date | null;
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
