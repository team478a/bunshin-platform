import { Prisma } from './client';

const AUTO_ASSIGNMENT_REASON = 'public service registration feature assignment';

/**
 * Gives a newly active service participant the features already enabled for the service.
 * Existing assignments are deliberately preserved so an explicit member-level stop or limit
 * is never relaxed by registering again.
 */
export async function assignEnabledServiceFeaturesToRegistrant(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    userId: string;
  },
) {
  const policies = await tx.groupFeaturePolicy.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: 'ENABLED',
      feature: { status: 'ACTIVE' },
    },
    select: { featureKey: true },
    orderBy: { featureKey: 'asc' },
  });
  if (policies.length === 0) return;

  const existing = await tx.groupMemberFeatureAssignment.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      groupMembershipId: input.groupMembershipId,
      featureKey: { in: policies.map(({ featureKey }) => featureKey) },
    },
    select: { featureKey: true },
  });
  const existingKeys = new Set(existing.map(({ featureKey }) => featureKey));
  const missing = policies.filter(({ featureKey }) => !existingKeys.has(featureKey));

  for (const { featureKey } of missing) {
    await tx.groupMemberFeatureAssignment.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        featureKey,
        status: 'ENABLED',
        assignedByUserId: input.userId,
      },
    });
    await tx.groupFeatureAuditLog.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        featureKey,
        action: 'MEMBER_ASSIGNMENT_SET',
        beforeData: Prisma.JsonNull,
        afterData: { status: 'ENABLED', dailyLimit: null, monthlyLimit: null },
        reason: AUTO_ASSIGNMENT_REASON,
        performedByUserId: input.userId,
      },
    });
  }
}
