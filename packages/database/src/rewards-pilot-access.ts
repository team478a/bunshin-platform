import type { Prisma } from '@prisma/client';

export const REWARDS_PILOT_FEATURE_KEY = 'REWARDS.POINTS_BADGES';

type RewardsPilotAccessClient = Pick<Prisma.TransactionClient, 'groupMembership'>;

export async function hasActiveRewardsPilotAccess(
  client: RewardsPilotAccessClient,
  scope: { workspaceId: string; userId: string; groupId?: string },
  at = new Date(),
) {
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
    select: { id: true },
  });
  return Boolean(membership);
}
