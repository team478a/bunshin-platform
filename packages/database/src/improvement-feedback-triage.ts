import { randomUUID } from 'node:crypto';
import type {
  Prisma,
  PrismaClient,
  ImprovementTriageCandidate as CandidateRow,
} from '@prisma/client';
import type {
  ImprovementFeedbackTriageRepository,
  ImprovementFeedbackTriageTransaction,
  ImprovementTriageOperation,
  ImprovementReadRequest,
} from '@bunshin/application';
import {
  sameImprovementScope,
  validateImprovementScope,
  validateImprovementTriageCandidate,
  isImprovementTriageUuid,
  isImprovementTriageDigest,
  type ImprovementScope,
  type ImprovementTriageCandidate,
} from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { PrismaImprovementFeedbackObservationAdapter } from './improvement-feedback-observation-adapter';
import { IMPROVEMENT_FEEDBACK_RETENTION_POLICY as policy } from './improvement-feedback-retention';

const day = 86_400_000;
const conflict = () => new ApplicationError('CONFLICT', 'feedback review requires revalidation');
function project(row: CandidateRow): ImprovementTriageCandidate {
  return {
    id: row.id,
    scope: {
      tenantRef: row.tenantRef,
      workspaceId: row.workspaceId,
      serviceId: row.serviceId,
      environment: row.environment as ImprovementScope['environment'],
      packageKey: row.packageKey,
      adapterKey: row.adapterKey,
    },
    period: { fromInclusive: row.fromInclusive, toExclusive: row.toExclusive },
    clusterRef: row.clusterRef,
    windowEvidenceRevision: row.windowEvidenceRevision,
    bucketEvidenceRevision: row.bucketEvidenceRevision,
    candidateRevision: row.candidateRevision,
    state: row.state as ImprovementTriageCandidate['state'],
    expiresAt: row.expiresAt,
    adapterVersion: row.adapterVersion,
    ruleVersion: row.ruleVersion,
    disclosurePolicyVersion: row.disclosurePolicyVersion,
    retentionPolicyVersion: row.retentionPolicyVersion,
  };
}
function validWindow(from: Date, to: Date, now: Date) {
  const local = new Date(from.getTime() + 9 * 3_600_000);
  return (
    [from, to, now].every((d) => Number.isFinite(d.getTime())) &&
    to.getTime() - from.getTime() === 7 * day &&
    local.getUTCDay() === 1 &&
    local.toISOString().slice(11) === '00:00:00.000Z' &&
    to <= now &&
    now.getTime() - to.getTime() < 84 * day
  );
}

/** Server-internal only. No default Prisma client, public route, scheduler or approval path. */
export class PrismaImprovementFeedbackTriageRepository implements ImprovementFeedbackTriageRepository {
  private readonly scope: ImprovementScope;
  constructor(
    private readonly client: PrismaClient,
    scope: ImprovementScope,
    private readonly now = () => new Date(),
  ) {
    validateImprovementScope(scope);
    if (
      !isImprovementTriageUuid(scope.workspaceId) ||
      !isImprovementTriageUuid(scope.serviceId) ||
      scope.tenantRef.length > 240 ||
      scope.packageKey !== 'SOCIAL' ||
      scope.adapterKey !== 'TROUBLE_FEEDBACK'
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback repository scope');
    this.scope = {
      tenantRef: scope.tenantRef,
      workspaceId: scope.workspaceId,
      serviceId: scope.serviceId,
      environment: scope.environment,
      packageKey: scope.packageKey,
      adapterKey: scope.adapterKey,
    };
  }
  private async authorize(tx: Prisma.TransactionClient, actorUserId: string) {
    const s = this.scope;
    // Retained row locks also order membership/user/workspace/config revocation against commit.
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT m.id FROM group_memberships m
      JOIN users u ON u.id = m.user_id JOIN groups g ON g.id = m.group_id
      JOIN workspaces w ON w.id = g.workspace_id
      JOIN service_configurations sc ON sc.group_id = g.id AND sc.workspace_id = g.workspace_id
      WHERE m.workspace_id = ${s.workspaceId}::uuid AND m.group_id = ${s.serviceId}::uuid
        AND m.user_id = ${actorUserId}::uuid AND m.status::text = 'ACTIVE'
        AND m.service_role::text IN ('SERVICE_OWNER','SERVICE_ADMIN')
        AND u.status::text = 'ACTIVE' AND g.status::text = 'ACTIVE' AND w.status::text = 'ACTIVE'
      FOR SHARE OF m, u, w, sc`;
    return rows.length === 1;
  }
  private async locked<T>(actorUserId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    if (!isImprovementTriageUuid(actorUserId))
      throw new ApplicationError('NOT_FOUND', 'triage scope not found');
    return this.client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM groups WHERE workspace_id = ${this.scope.workspaceId}::uuid AND id = ${this.scope.serviceId}::uuid FOR UPDATE`;
        if (!(await this.authorize(tx, actorUserId)))
          throw new ApplicationError('NOT_FOUND', 'triage scope not found');
        return work(tx);
      },
      { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 20_000 },
    );
  }
  private read(tx: Prisma.TransactionClient, actorUserId: string, input: ImprovementReadRequest) {
    if (
      !sameImprovementScope(input.scope, this.scope) ||
      input.actorUserId !== actorUserId ||
      input.subject !== null
    )
      throw new ApplicationError('NOT_FOUND', 'triage scope not found');
    return new PrismaImprovementFeedbackObservationAdapter(tx, this.scope, this.now).reviewEvidence(
      input,
    );
  }
  private scopedWhere() {
    return { ...this.scope };
  }
  async transaction<T>(
    context: { scope: ImprovementScope; actorUserId: string },
    work: (tx: ImprovementFeedbackTriageTransaction) => Promise<T>,
  ): Promise<T> {
    const actorUserId = context.actorUserId;
    if (!sameImprovementScope(context.scope, this.scope))
      throw new ApplicationError('NOT_FOUND', 'triage scope not found');
    return this.locked(actorUserId, async (tx) => {
      const where = this.scopedWhere();
      const port: ImprovementFeedbackTriageTransaction = {
        authorize: () => this.authorize(tx, actorUserId),
        policy: () => Promise.resolve({ ...policy }),
        candidate: async (id) => {
          const row = await tx.improvementTriageCandidate.findFirst({ where: { ...where, id } });
          return row ? project(row) : null;
        },
        evidence: (input) => this.read(tx, actorUserId, input),
        operation: async (key) => {
          const row = await tx.improvementTriageOperation.findFirst({
            where: { ...where, operationKey: key, expiresAt: { gt: this.now() } },
          });
          if (!row || !row.candidateId || !row.actorUserId) return null;
          return {
            actorUserId: row.actorUserId,
            candidateId: row.candidateId,
            expectedCandidateRevision: row.expectedCandidateRevision,
            action: row.action as ImprovementTriageOperation['action'],
            reasonCode: row.reasonCode as ImprovementTriageOperation['reasonCode'],
            receipt: {
              candidateId: row.candidateId,
              candidateRevision: row.resultRevision,
              state: row.resultState as 'REVIEWED' | 'DISMISSED',
            },
          };
        },
        commit: async (input) => {
          if (!(await this.authorize(tx, actorUserId))) return false;
          const row = await tx.improvementTriageCandidate.findFirst({
            where: { ...where, id: input.candidateId },
          });
          if (
            !row ||
            row.state !== 'OPEN' ||
            row.candidateRevision !== input.expectedRevision ||
            row.candidateRevision >= 2147483647 ||
            row.expiresAt <= this.now() ||
            !validWindow(row.fromInclusive, row.toExclusive, this.now())
          )
            return false;
          const operation = input.operation;
          if (
            !isImprovementTriageUuid(input.operationKey) ||
            operation.actorUserId !== actorUserId ||
            operation.candidateId !== row.id ||
            operation.expectedCandidateRevision !== row.candidateRevision ||
            operation.receipt.candidateId !== row.id ||
            operation.receipt.candidateRevision !== row.candidateRevision + 1 ||
            !(
              (operation.action === 'MARK_REVIEWED' &&
                operation.reasonCode === 'REVIEW_COMPLETED' &&
                operation.receipt.state === 'REVIEWED') ||
              (operation.action === 'DISMISS' &&
                ['OUT_OF_SCOPE', 'DUPLICATE_REVIEW'].includes(operation.reasonCode) &&
                operation.receipt.state === 'DISMISSED')
            )
          )
            return false;
          const evidence = await this.read(tx, actorUserId, {
            scope: this.scope,
            actorUserId,
            subject: null,
            limit: 1000,
            fromInclusive: row.fromInclusive,
            toExclusive: row.toExclusive,
          });
          const bucket = evidence.buckets.find((b) => b.clusterRef === row.clusterRef);
          if (
            evidence.coverage.completeness !== 'COMPLETE' ||
            evidence.coverage.truncated ||
            evidence.coverage.missingCount !== 0 ||
            evidence.evidenceRevision !== row.windowEvidenceRevision ||
            !bucket ||
            bucket.evidenceRevision !== row.bucketEvidenceRevision ||
            bucket.reviewDecision !== 'REVIEW_REQUIRED' ||
            evidence.buckets.some((b) => b.distinctReporters < policy.minimumBucketReporters) ||
            row.retentionPolicyVersion !== policy.retentionPolicyVersion ||
            row.disclosurePolicyVersion !== policy.disclosurePolicyVersion
          )
            return false;
          const at = this.now();
          if (row.expiresAt <= at || !validWindow(row.fromInclusive, row.toExclusive, at))
            return false;
          const updated = await tx.improvementTriageCandidate.updateMany({
            where: {
              ...where,
              id: row.id,
              candidateRevision: input.expectedRevision,
              state: 'OPEN',
              expiresAt: { gt: at },
            },
            data: { state: operation.receipt.state, candidateRevision: { increment: 1 } },
          });
          if (updated.count !== 1) return false;
          // DB check/FK/uniqueness/audit failure throws and rolls back the CAS as well.
          await tx.improvementTriageOperation.create({
            data: {
              ...where,
              id: randomUUID(),
              operationKey: input.operationKey,
              candidateId: row.id,
              actorUserId,
              expectedCandidateRevision: row.candidateRevision,
              action: operation.action,
              reasonCode: operation.reasonCode,
              resultRevision: operation.receipt.candidateRevision,
              resultState: operation.receipt.state,
              occurredAt: at,
              expiresAt: new Date(at.getTime() + 180 * day),
            },
          });
          return true;
        },
      };
      return work(port);
    });
  }
  /** Internal bootstrap, no STALE reopening and no automatic human review. */
  async createCandidate(input: { actorUserId: string; weekStart: Date; clusterRef: string }) {
    const actor = input.actorUserId;
    const from = new Date(input.weekStart);
    const to = new Date(from.getTime() + 7 * day);
    const clusterRef = input.clusterRef;
    if (!isImprovementTriageDigest(clusterRef) || !validWindow(from, to, this.now()))
      throw conflict();
    return this.locked(actor, async (tx) => {
      const evidence = await this.read(tx, actor, {
        scope: this.scope,
        actorUserId: actor,
        subject: null,
        limit: 1000,
        fromInclusive: from,
        toExclusive: to,
      });
      const bucket = evidence.buckets.find((b) => b.clusterRef === clusterRef);
      if (
        evidence.coverage.completeness !== 'COMPLETE' ||
        evidence.coverage.truncated ||
        evidence.coverage.missingCount !== 0 ||
        !bucket ||
        bucket.reviewDecision !== 'REVIEW_REQUIRED' ||
        evidence.buckets.some((b) => b.distinctReporters < policy.minimumBucketReporters) ||
        !validWindow(from, to, this.now())
      )
        throw conflict();
      const existing = await tx.improvementTriageCandidate.findFirst({
        where: { ...this.scopedWhere(), clusterRef },
      });
      if (existing) {
        if (
          existing.state === 'STALE' ||
          existing.expiresAt <= this.now() ||
          existing.windowEvidenceRevision !== evidence.evidenceRevision ||
          existing.bucketEvidenceRevision !== bucket.evidenceRevision
        )
          throw conflict();
        return project(existing);
      }
      const row = await tx.improvementTriageCandidate.create({
        data: {
          ...this.scopedWhere(),
          fromInclusive: from,
          toExclusive: to,
          clusterRef,
          windowEvidenceRevision: evidence.evidenceRevision,
          bucketEvidenceRevision: bucket.evidenceRevision,
          adapterVersion: evidence.adapterVersion,
          ruleVersion: evidence.rule.version,
          disclosurePolicyVersion: policy.disclosurePolicyVersion,
          retentionPolicyVersion: policy.retentionPolicyVersion,
          expiresAt: new Date(to.getTime() + 90 * day),
        },
      });
      const candidate = project(row);
      validateImprovementTriageCandidate(candidate);
      return candidate;
    });
  }
}
