import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  parsePersonalLearningPreparationAuthority,
  type PersonalLearningPreparationAuthority,
} from '@bunshin/application';
import {
  defineReproductionChallengeReference,
  defineReproductionChallengeReviewRecord,
  serializeReproductionChallengeReviewMaterial,
  REPRODUCTION_CHALLENGE_REVIEW_VERSION,
  type ReproductionChallengeReference,
  type ReproductionChallengeReviewRecord,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import { requirePersonalLearningPreparationAuthority } from './personal-learning-preparation-authority';

export const CHALLENGE_REVIEW_ADMIN_VERSION = 'AI_TRAINING_CHALLENGE_REVIEW_ADMIN_V1';
export const CHALLENGE_REVIEW_HISTORY_LIMIT = 100;
const action = 'REPRODUCTION_CHALLENGE_REVIEW_RECORDED';
const resourceType = 'REPRODUCTION_CHALLENGE_REVIEW';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
};
const hash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const placeholderId = '00000000-0000-4000-8000-000000000001';
const invalid = () =>
  new ApplicationError('VALIDATION_ERROR', 'invalid challenge review operation');
const conflict = () => new ApplicationError('CONFLICT', 'challenge review changed; reload');
const unavailable = () => new ApplicationError('NOT_FOUND', 'challenge review unavailable');

type ReviewAction = ReproductionChallengeReviewRecord['decision'] | 'REVOKE';
export interface ReproductionChallengeReviewAdminCommand {
  readonly operationId: string;
  readonly reference: ReproductionChallengeReference;
  readonly expectedRevision: string;
  readonly materialDigest: `sha256:${string}`;
  readonly reviewedCommitSha: string;
  readonly evidenceKey: string;
  readonly action: ReviewAction;
  readonly confirmation: 'CONFIRM_CHALLENGE_REVIEW' | 'CONFIRM_CHALLENGE_REVOKE';
  readonly checklist: ReproductionChallengeReviewRecord['checklist'] | null;
}

export function validateReproductionChallengeReviewAdminCommand(
  input: unknown,
): ReproductionChallengeReviewAdminCommand {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  const c = input as Record<string, unknown>;
  const keys = [
    'operationId',
    'reference',
    'expectedRevision',
    'materialDigest',
    'reviewedCommitSha',
    'evidenceKey',
    'action',
    'confirmation',
    'checklist',
  ];
  if (
    Object.keys(c).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(c, key)) ||
    typeof c.operationId !== 'string' ||
    !uuid.test(c.operationId) ||
    typeof c.expectedRevision !== 'string' ||
    !/^[a-f0-9]{64}$/.test(c.expectedRevision) ||
    !['APPROVE', 'REJECT', 'REVISION_REQUIRED', 'REVOKE'].includes(c.action as string) ||
    c.confirmation !==
      (c.action === 'REVOKE' ? 'CONFIRM_CHALLENGE_REVOKE' : 'CONFIRM_CHALLENGE_REVIEW') ||
    (c.action === 'REVOKE' && c.checklist !== null)
  )
    throw invalid();
  try {
    const record = defineReproductionChallengeReviewRecord({
      contractVersion: REPRODUCTION_CHALLENGE_REVIEW_VERSION,
      reviewId: c.operationId,
      workspaceId: placeholderId,
      serviceId: placeholderId,
      reviewerUserId: placeholderId,
      reviewedAt: '2026-01-01T00:00:00.000Z',
      reviewedCommitSha: c.reviewedCommitSha,
      materialDigest: c.materialDigest,
      evidenceKey: c.evidenceKey,
      reference: c.reference,
      decision: c.action === 'REVOKE' ? 'REJECT' : c.action,
      checklist:
        c.action === 'REVOKE'
          ? {
              objective: false,
              prerequisites: false,
              syntheticFacts: false,
              learnerTask: false,
              rubricAndMission: false,
              safety: false,
            }
          : c.checklist,
    });
    return Object.freeze({
      operationId: c.operationId,
      reference: record.reference,
      expectedRevision: c.expectedRevision,
      materialDigest: record.materialDigest,
      reviewedCommitSha: record.reviewedCommitSha,
      evidenceKey: record.evidenceKey,
      action: c.action as ReviewAction,
      confirmation: c.confirmation as ReproductionChallengeReviewAdminCommand['confirmation'],
      checklist: c.action === 'REVOKE' ? null : record.checklist,
    });
  } catch {
    throw invalid();
  }
}

/** Server-only repository; no HTTP/session composition or Runtime approval reader in this PR.
 * authority, deployedCommitSha, guard, and actor must be supplied by trusted server composition.
 * Service identity in the V1 review record is the existing Service Group ID.
 */
export class PrismaReproductionChallengeReviewAdminRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly authority: PersonalLearningPreparationAuthority,
    private readonly deployedCommitSha: string,
    private readonly guard: (operation: 'READ' | 'REVIEW' | 'REVOKE') => void,
    private readonly now = () => new Date(),
  ) {}

  private async authorized<T>(
    actorUserId: string,
    operation: 'READ' | 'REVIEW' | 'REVOKE',
    work: (tx: Prisma.TransactionClient, a: PersonalLearningPreparationAuthority) => Promise<T>,
  ): Promise<T> {
    const a = parsePersonalLearningPreparationAuthority(this.authority);
    if (!a || !uuid.test(actorUserId) || !/^[a-f0-9]{40}$/.test(this.deployedCommitSha))
      throw unavailable();
    this.guard(operation);
    try {
      return await this.client.$transaction(
        async (tx) => {
          // Serialize all review/STOP/preparation writers using the existing Group lock order.
          const groups = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM groups WHERE id=${a.groupId}::uuid AND workspace_id=${a.workspaceId}::uuid AND status::text='ACTIVE' FOR UPDATE`;
          const admins = await tx.$queryRaw<
            { id: string }[]
          >`SELECT m.id FROM group_memberships m JOIN users u ON u.id=m.user_id JOIN workspaces w ON w.id=m.workspace_id
          WHERE m.workspace_id=${a.workspaceId}::uuid AND m.group_id=${a.groupId}::uuid AND m.user_id=${actorUserId}::uuid
          AND m.status::text='ACTIVE' AND m.service_role::text IN ('SERVICE_OWNER','SERVICE_ADMIN')
          AND u.status::text='ACTIVE' AND w.status::text='ACTIVE' FOR SHARE OF m,u,w`;
          if (groups.length !== 1 || admins.length !== 1) throw unavailable();
          await requirePersonalLearningPreparationAuthority(tx, a, a);
          this.guard(operation);
          return work(tx, a);
        },
        { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw conflict();
      throw error;
    }
  }

  private record(
    a: PersonalLearningPreparationAuthority,
    actor: string,
    c: ReproductionChallengeReviewAdminCommand,
    reviewedAt: Date,
  ) {
    if (c.action === 'REVOKE') return null;
    return defineReproductionChallengeReviewRecord({
      contractVersion: REPRODUCTION_CHALLENGE_REVIEW_VERSION,
      reviewId: c.operationId,
      workspaceId: a.workspaceId,
      serviceId: a.groupId,
      reviewerUserId: actor,
      reviewedAt: reviewedAt.toISOString(),
      reviewedCommitSha: c.reviewedCommitSha,
      materialDigest: c.materialDigest,
      evidenceKey: c.evidenceKey,
      reference: c.reference,
      decision: c.action,
      checklist: c.checklist,
    });
  }

  private async snapshot(
    tx: Prisma.TransactionClient,
    a: PersonalLearningPreparationAuthority,
    input: unknown,
  ) {
    let reference: ReproductionChallengeReference;
    try {
      reference = defineReproductionChallengeReference(input);
    } catch {
      throw invalid();
    }
    const material = serializeReproductionChallengeReviewMaterial(reference);
    if (material === null) throw unavailable();
    const materialDigest =
      `sha256:${createHash('sha256').update(material, 'utf8').digest('hex')}` as const;
    const key = { authority: a, reference };
    const id = hash(key).slice(0, 32);
    const resourceId = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
    const rows = await tx.programAuditLog.findMany({
      where: { workspaceId: a.workspaceId, groupId: a.groupId, resourceType, resourceId, action },
      orderBy: [{ performedAt: 'asc' }, { id: 'asc' }],
      // One reserved final withdrawal slot; one extra row detects truncation.
      take: CHALLENGE_REVIEW_HISTORY_LIMIT + 2,
    });
    if (rows.length > CHALLENGE_REVIEW_HISTORY_LIMIT + 1) throw conflict();
    let revision = hash({ ...key, contractVersion: CHALLENGE_REVIEW_ADMIN_VERSION });
    let lastTime = -Infinity;
    const history: {
      command: ReproductionChallengeReviewAdminCommand;
      record: ReproductionChallengeReviewRecord | null;
      performedAt: string;
    }[] = [];
    for (const row of rows) {
      try {
        const data = row.afterData as unknown as Record<string, unknown>;
        const fields = [
          'contractVersion',
          'serviceProgramId',
          'revision',
          'previousRevision',
          'fingerprint',
          'command',
          'reviewRecord',
        ];
        if (
          !data ||
          Object.keys(data).length !== fields.length ||
          fields.some((k) => !Object.hasOwn(data, k))
        )
          throw conflict();
        const c = validateReproductionChallengeReviewAdminCommand(data.command);
        const record = this.record(a, row.performedByUserId, c, row.performedAt);
        if (
          row.workspaceId !== a.workspaceId ||
          row.groupId !== a.groupId ||
          row.resourceType !== resourceType ||
          row.resourceId !== resourceId ||
          row.action !== action ||
          !uuid.test(row.performedByUserId) ||
          row.id !== c.operationId ||
          data.contractVersion !== CHALLENGE_REVIEW_ADMIN_VERSION ||
          data.serviceProgramId !== a.serviceProgramId ||
          data.revision !== history.length + 1 ||
          data.previousRevision !== revision ||
          c.expectedRevision !== revision ||
          data.fingerprint !== hash({ authority: a, actor: row.performedByUserId, command: c }) ||
          JSON.stringify(c.reference) !== JSON.stringify(reference) ||
          hash(
            c.action === 'REVOKE'
              ? data.reviewRecord
              : defineReproductionChallengeReviewRecord(data.reviewRecord),
          ) !== hash(record) ||
          !Number.isFinite(row.performedAt.getTime()) ||
          row.performedAt.getTime() <= lastTime ||
          (c.action === 'REVOKE' && history.at(-1)?.command.action !== 'APPROVE')
        )
          throw conflict();
        lastTime = row.performedAt.getTime();
        revision = hash({
          id: row.id,
          data,
          actor: row.performedByUserId,
          performedAt: row.performedAt.toISOString(),
        });
        history.push({ command: c, record, performedAt: row.performedAt.toISOString() });
      } catch {
        throw conflict();
      }
    }
    if (
      history.length > CHALLENGE_REVIEW_HISTORY_LIMIT &&
      history.at(-1)?.command.action !== 'REVOKE'
    )
      throw conflict();
    const latest = history.at(-1);
    return {
      resourceId,
      reference,
      material,
      materialDigest,
      reviewedCommitSha: this.deployedCommitSha,
      revision,
      history,
      recordedDecision: latest?.command.action ?? ('NOT_REVIEWED' as const),
      reviewBinding: !latest
        ? ('NOT_REVIEWED' as const)
        : latest.command.materialDigest === materialDigest &&
            latest.command.reviewedCommitSha === this.deployedCommitSha
          ? ('MATCHED' as const)
          : ('UNKNOWN' as const),
      executionPermission: 'NOT_GRANTED' as const,
    };
  }

  read(actorUserId: string, reference: unknown) {
    return this.authorized(actorUserId, 'READ', (tx, a) => this.snapshot(tx, a, reference));
  }

  change(actorUserId: string, input: unknown) {
    const c = validateReproductionChallengeReviewAdminCommand(input);
    return this.authorized(
      actorUserId,
      c.action === 'REVOKE' ? 'REVOKE' : 'REVIEW',
      async (tx, a) => {
        const before = await this.snapshot(tx, a, c.reference);
        // Check the live artifact even on retry. Never return a stale approval as current state.
        if (
          c.materialDigest !== before.materialDigest ||
          c.reviewedCommitSha !== this.deployedCommitSha
        )
          throw conflict();
        const fingerprint = hash({ authority: a, actor: actorUserId, command: c });
        const prior = await tx.programAuditLog.findUnique({ where: { id: c.operationId } });
        if (prior) {
          if (
            !before.history.some((entry) => entry.command.operationId === c.operationId) ||
            prior.performedByUserId !== actorUserId ||
            (prior.afterData as Prisma.JsonObject).fingerprint !== fingerprint
          )
            throw conflict();
          return { replayed: true, operationId: c.operationId, current: before };
        }
        if (
          before.revision !== c.expectedRevision ||
          before.history.length > CHALLENGE_REVIEW_HISTORY_LIMIT ||
          (before.history.length === CHALLENGE_REVIEW_HISTORY_LIMIT && c.action !== 'REVOKE') ||
          (c.action === 'REVOKE' && before.recordedDecision !== 'APPROVE')
        )
          throw conflict();
        const now = this.now();
        if (!Number.isFinite(now.getTime())) throw invalid();
        const last = before.history.at(-1);
        if (last && now.getTime() <= Date.parse(last.performedAt)) throw conflict();
        const reviewRecord = this.record(a, actorUserId, c, now);
        const afterData = {
          contractVersion: CHALLENGE_REVIEW_ADMIN_VERSION,
          serviceProgramId: a.serviceProgramId,
          revision: before.history.length + 1,
          previousRevision: before.revision,
          fingerprint,
          command: c,
          reviewRecord,
        };
        this.guard(c.action === 'REVOKE' ? 'REVOKE' : 'REVIEW');
        await tx.programAuditLog.create({
          data: {
            id: c.operationId,
            workspaceId: a.workspaceId,
            groupId: a.groupId,
            resourceType,
            resourceId: before.resourceId,
            action,
            beforeData: { revision: before.revision, recordedDecision: before.recordedDecision },
            afterData: JSON.parse(JSON.stringify(afterData)) as Prisma.InputJsonObject,
            performedByUserId: actorUserId,
            performedAt: now,
          },
        });
        const current = await this.snapshot(tx, a, c.reference);
        this.guard(c.action === 'REVOKE' ? 'REVOKE' : 'REVIEW');
        return {
          replayed: false,
          operationId: c.operationId,
          current,
        };
      },
    );
  }
}
