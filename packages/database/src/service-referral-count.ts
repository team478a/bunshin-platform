import type { Prisma } from '@prisma/client';

/** Package-internal aggregate; caller must authorize this member scope first. */
export async function readConfirmedReferralCount(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; serviceId: string; groupMembershipId: string; userId: string },
  asOf: Date,
) {
  const policy = await tx.serviceReferralQualificationPolicyVersion.findFirst({
    where: { workspaceId: scope.workspaceId, groupId: scope.serviceId, createdAt: { lte: asOf } },
    select: { id: true },
  });
  if (!policy) return null;
  return tx.serviceReferral.count({
    where: {
      workspaceId: scope.workspaceId,
      groupId: scope.serviceId,
      qualificationState: { in: ['CONFIRMED', 'REVOKED'] },
      confirmedAt: { lte: asOf },
      OR: [{ revokedAt: null }, { revokedAt: { gt: asOf } }],
      referralCode: {
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        groupMembershipId: scope.groupMembershipId,
        userId: scope.userId,
      },
    },
  });
}
