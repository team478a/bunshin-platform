import type { Prisma, PrismaClient } from '@prisma/client';
import type { ImprovementTriagePolicy } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

const day = 86_400_000;
/** Approved by the service owner on 2026-10-03. Not a legal retention requirement. */
export const IMPROVEMENT_FEEDBACK_RETENTION_POLICY: Readonly<ImprovementTriagePolicy> =
  Object.freeze({
    approved: true,
    retentionPolicyVersion: 'feedback-retention-v1',
    disclosurePolicyVersion: 'feedback-admin-preview-v1',
    minimumBucketReporters: 5,
    candidateRetentionDays: 90,
  });

/** Caller must already hold the account deletion lease and organization safety checks. */
export async function eraseAccountImprovementFeedback(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  // DB source trigger atomically erases hashes + invalidates all affected windows.
  // Real ownership and original actor are both checked; never delete unrelated actors.
  const sources = await tx.improvementFeedback.deleteMany({
    where: { OR: [{ actorUserId: userId }, { bunshin: { ownerUserId: userId } }] },
  });
  const audits = await tx.improvementTriageOperation.updateMany({
    where: { actorUserId: userId },
    data: { actorUserId: null },
  });
  return { sourcesDeleted: sources.count, auditActorsErased: audits.count };
}

/** Internal bounded batch only. No scheduler/HTTP/prod invocation is added here. */
export async function purgeExpiredImprovementFeedback(
  client: PrismaClient,
  input: { workspaceId: string; serviceId: string; now?: Date; limit?: number },
) {
  const scope = { workspaceId: input.workspaceId, serviceId: input.serviceId };
  const now = new Date(input.now ?? new Date());
  const limit = input.limit ?? 100;
  const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
  if (
    !uuid.test(scope.workspaceId) ||
    !uuid.test(scope.serviceId) ||
    !Number.isFinite(now.getTime()) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1000
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback purge scope');
  return client.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM groups WHERE workspace_id = ${scope.workspaceId}::uuid AND id = ${scope.serviceId}::uuid FOR UPDATE`;
      const sources = await tx.improvementFeedback.findMany({
        where: { ...scope, createdAt: { lte: new Date(now.getTime() - 90 * day) } },
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
      });
      const candidates = await tx.improvementTriageCandidate.findMany({
        where: { ...scope, expiresAt: { lte: now } },
        select: { id: true },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        take: limit,
      });
      const audits = await tx.improvementTriageOperation.findMany({
        where: { ...scope, expiresAt: { lte: now } },
        select: { id: true },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        take: limit,
      });
      const removedSources = await tx.improvementFeedback.deleteMany({
        where: { ...scope, id: { in: sources.map((r) => r.id) } },
      });
      const removedCandidates = await tx.improvementTriageCandidate.deleteMany({
        where: { ...scope, id: { in: candidates.map((r) => r.id) } },
      });
      const removedAudits = await tx.improvementTriageOperation.deleteMany({
        where: { ...scope, id: { in: audits.map((r) => r.id) } },
      });
      return {
        sourcesDeleted: removedSources.count,
        candidatesDeleted: removedCandidates.count,
        auditsDeleted: removedAudits.count,
        possiblyMore: [sources, candidates, audits].some((rows) => rows.length === limit),
      };
    },
    { timeout: 20_000 },
  );
}
