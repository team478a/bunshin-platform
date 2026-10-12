import type { Prisma, PrismaClient } from '@prisma/client';

type PolicyReader = Pick<PrismaClient | Prisma.TransactionClient, 'oemBillingPolicy'>;

const currentRevision = {
  where: { supersededBy: { is: null } },
  orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
  take: 2,
};

type PolicyWithCurrentRevision = Prisma.OemBillingPolicyGetPayload<{
  include: { revisions: typeof currentRevision };
}>;

type OemBillingPolicyProjectionBase = {
  workspaceId: string;
  actorUserId: string;
  reason: string;
  revisionId: string | null;
  revisionActorUserId: string | null;
  revisionReason: string | null;
};

export type OemBillingPolicyProjection = OemBillingPolicyProjectionBase &
  (
    | {
        status: 'SCHEDULED';
        effectiveFrom: Date;
        ruleVersion: string;
        historyReadyAt: Date | null;
      }
    | {
        status: 'CANCELLED';
        effectiveFrom: null;
        ruleVersion: null;
        historyReadyAt: null;
      }
  );

function projectPolicy(policy: PolicyWithCurrentRevision): OemBillingPolicyProjection {
  if (policy.revisions.length > 1) throw new Error('REVIEW_REQUIRED: billing policy revisions');
  const revision = policy.revisions[0] ?? null;
  if (!revision) {
    return {
      workspaceId: policy.workspaceId,
      status: 'SCHEDULED',
      effectiveFrom: policy.effectiveFrom,
      ruleVersion: policy.ruleVersion,
      historyReadyAt: policy.historyReadyAt,
      actorUserId: policy.actorUserId,
      reason: policy.reason,
      revisionId: null,
      revisionActorUserId: null,
      revisionReason: null,
    };
  }
  if (revision.action === 'CANCELLED') {
    return {
      workspaceId: policy.workspaceId,
      status: 'CANCELLED',
      effectiveFrom: null,
      ruleVersion: null,
      historyReadyAt: null,
      actorUserId: policy.actorUserId,
      reason: policy.reason,
      revisionId: revision.id,
      revisionActorUserId: revision.actorUserId,
      revisionReason: revision.reason,
    };
  }
  if (!revision.effectiveFrom || !revision.ruleVersion || !revision.historyReadyAt)
    throw new Error('REVIEW_REQUIRED: billing policy revision');
  return {
    workspaceId: policy.workspaceId,
    status: 'SCHEDULED',
    effectiveFrom: revision.effectiveFrom,
    ruleVersion: revision.ruleVersion,
    historyReadyAt: revision.historyReadyAt,
    actorUserId: policy.actorUserId,
    reason: policy.reason,
    revisionId: revision.id,
    revisionActorUserId: revision.actorUserId,
    revisionReason: revision.reason,
  };
}

export async function resolveOemBillingPolicy(
  client: PolicyReader,
  workspaceId: string,
): Promise<OemBillingPolicyProjection | null> {
  const policy = await client.oemBillingPolicy.findUnique({
    where: { workspaceId },
    include: { revisions: currentRevision },
  });
  return policy ? projectPolicy(policy) : null;
}

export async function listOemBillingPolicyProjections(
  client: PolicyReader,
): Promise<OemBillingPolicyProjection[]> {
  const policies = await client.oemBillingPolicy.findMany({
    include: { revisions: currentRevision },
  });
  return policies.map(projectPolicy);
}
