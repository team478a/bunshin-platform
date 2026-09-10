import type { Prisma } from '@prisma/client';

type VideoProjectEntitlementClient = Pick<
  Prisma.TransactionClient,
  'groupFeaturePolicy' | 'groupMemberFeatureAssignment'
>;

export async function hasActiveVideoProjectEntitlement(
  client: VideoProjectEntitlementClient,
  scope: {
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    socialImageGenerationRequestId: string | null;
  },
  now = new Date(),
) {
  const featureKey = scope.socialImageGenerationRequestId
    ? 'SOCIAL.IMAGE_GENERATION'
    : 'VIDEO_GENERATION';
  const activeWindow = {
    status: 'ENABLED' as const,
    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
    AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
  };
  const [groupPolicy, memberAssignment] = await Promise.all([
    client.groupFeaturePolicy.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        featureKey,
        ...activeWindow,
      },
      select: { id: true },
    }),
    client.groupMemberFeatureAssignment.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        groupMembershipId: scope.groupMembershipId,
        featureKey,
        ...activeWindow,
      },
      select: { id: true },
    }),
  ]);
  return Boolean(groupPolicy && memberAssignment);
}
