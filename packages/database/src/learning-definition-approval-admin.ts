import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import {
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  getAiTrainingMissionQuality,
  AI_TRAINING_LEARNING_ROUTER_VERSION,
} from '@bunshin/capability-training';

export interface LearningDefinitionApprovalAdminScope {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
}
export interface LearningDefinitionApprovalAdminCommand {
  operationId: string;
  definitionKey: string;
  version: string;
  expectedRevision: string;
  reviewDigest: string;
  reviewEvidenceKey: string;
  reviewedCommitSha: string;
  action: 'APPROVE' | 'DEPRECATE';
  confirmation: 'CONFIRM_DEFINITION_APPROVAL' | 'CONFIRM_DEFINITION_WITHDRAWAL';
  reviewChecklist?: {
    objective: true;
    prerequisites: true;
    concepts: true;
    safety: true;
    mistakes: true;
    practice: true;
    rubricAndMission: true;
  };
}
const action = 'LEARNING_DEFINITION_APPROVAL_CHANGED';
const resourceType = 'LEARNING_DEFINITION_APPROVAL';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function invalid(): never {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid definition review operation');
}
function conflict(): never {
  throw new ApplicationError('CONFLICT', 'definition review changed; reload before confirming');
}
const uuid = (s: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(s);
const checklist = [
  'objective',
  'prerequisites',
  'concepts',
  'safety',
  'mistakes',
  'practice',
  'rubricAndMission',
] as const;
export function validateLearningDefinitionApprovalCommand(
  c: LearningDefinitionApprovalAdminCommand,
) {
  const keys = [
    'operationId',
    'definitionKey',
    'version',
    'expectedRevision',
    'reviewDigest',
    'reviewEvidenceKey',
    'reviewedCommitSha',
    'action',
    'confirmation',
    'reviewChecklist',
  ];
  if (
    !c ||
    Object.keys(c).some((k) => !keys.includes(k)) ||
    !uuid(c.operationId) ||
    !/^[a-f0-9]{64}$/.test(c.expectedRevision) ||
    !/^[a-f0-9]{64}$/.test(c.reviewDigest) ||
    !/^[a-f0-9]{40}$/.test(c.reviewedCommitSha) ||
    typeof c.reviewEvidenceKey !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(c.reviewEvidenceKey) ||
    !['APPROVE', 'DEPRECATE'].includes(c.action) ||
    c.confirmation !==
      (c.action === 'APPROVE' ? 'CONFIRM_DEFINITION_APPROVAL' : 'CONFIRM_DEFINITION_WITHDRAWAL')
  )
    invalid();
  if (c.action === 'APPROVE') {
    if (
      !c.reviewChecklist ||
      Object.keys(c.reviewChecklist).length !== checklist.length ||
      checklist.some((k) => c.reviewChecklist?.[k] !== true)
    )
      invalid();
  } else if (c.reviewChecklist !== undefined) invalid();
  // Stable explicit projection also makes retries independent of incoming object key ordering.
  return {
    operationId: c.operationId,
    definitionKey: c.definitionKey,
    version: c.version,
    expectedRevision: c.expectedRevision,
    reviewDigest: c.reviewDigest,
    reviewEvidenceKey: c.reviewEvidenceKey,
    reviewedCommitSha: c.reviewedCommitSha,
    action: c.action,
    confirmation: c.confirmation,
    ...(c.reviewChecklist
      ? { reviewChecklist: Object.fromEntries(checklist.map((k) => [k, true])) }
      : {}),
  };
}
export class PrismaLearningDefinitionApprovalAdminRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly now = () => new Date(),
  ) {}
  private async authorized<T>(
    s: LearningDefinitionApprovalAdminScope,
    write: boolean,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (![s.workspaceId, s.groupId, s.actorUserId].every(uuid)) invalid();
    try {
      return await this.client.$transaction(
        async (tx) => {
          // Serialize missing-row creation as well as existing-row writes. Readers keep a shared lock.
          const groups = write
            ? await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM groups WHERE id=${s.groupId}::uuid AND workspace_id=${s.workspaceId}::uuid AND status::text='ACTIVE' FOR UPDATE`
            : await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM groups WHERE id=${s.groupId}::uuid AND workspace_id=${s.workspaceId}::uuid AND status::text='ACTIVE' FOR SHARE`;
          const admins = await tx.$queryRaw<{ id: string }[]>`
          SELECT m.id FROM group_memberships m JOIN users u ON u.id=m.user_id
          JOIN workspaces w ON w.id=m.workspace_id
          WHERE m.workspace_id=${s.workspaceId}::uuid AND m.group_id=${s.groupId}::uuid
            AND m.user_id=${s.actorUserId}::uuid AND m.status::text='ACTIVE'
            AND m.service_role::text IN ('SERVICE_OWNER','SERVICE_ADMIN')
            AND u.status::text='ACTIVE' AND w.status::text='ACTIVE' FOR SHARE OF m,u,w`;
          if (groups.length !== 1 || admins.length !== 1)
            throw new ApplicationError('FORBIDDEN', 'definition review permission required');
          return work(tx);
        },
        { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        conflict();
      throw error;
    }
  }
  private async read(
    tx: Prisma.TransactionClient,
    s: LearningDefinitionApprovalAdminScope,
    definitionKey: string,
    version: string,
  ) {
    const definition = AI_TRAINING_LEARNING_DEFINITION_FIXTURES.find(
      (d) => d.reference.definitionKey === definitionKey && d.reference.version === version,
    );
    if (!definition) throw new ApplicationError('NOT_FOUND', 'fixed definition unavailable');
    const ref = definition.reference;
    const key = { workspaceId: s.workspaceId, groupId: s.groupId, ...ref };
    const id = hash(key).slice(0, 32);
    const resourceId = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
    const row = await tx.learningDefinitionApproval.findUnique({
      where: { workspaceId_groupId_packageKey_definitionKey_version: key },
    });
    const current = row
      ? {
          approvalStatus: row.approvalStatus,
          approvedAt: row.approvedAt?.toISOString() ?? null,
          approvedByUserId: row.approvedByUserId,
        }
      : null;
    const latest = await tx.programAuditLog.findFirst({
      where: { workspaceId: s.workspaceId, groupId: s.groupId, resourceType, resourceId, action },
      orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    const mission = getAiTrainingMissionQuality(definition.legacyMissionRef.actionKey);
    const operationCount = await tx.programAuditLog.count({
      where: { workspaceId: s.workspaceId, groupId: s.groupId, resourceType, resourceId, action },
    });
    return {
      key,
      resourceId,
      current,
      revision: hash({ current, operationCount, latestOperationId: latest?.id ?? null }),
      reviewDigest: hash({
        definition,
        mission,
        routerRuleVersion: AI_TRAINING_LEARNING_ROUTER_VERSION,
      }),
      definition,
      mission,
      routerRuleVersion: AI_TRAINING_LEARNING_ROUTER_VERSION,
    };
  }
  list(s: LearningDefinitionApprovalAdminScope) {
    return this.authorized(s, false, async (tx) => {
      const items = [];
      for (const d of AI_TRAINING_LEARNING_DEFINITION_FIXTURES) {
        const {
          key: _key,
          resourceId: _resourceId,
          ...item
        } = await this.read(tx, s, d.reference.definitionKey, d.reference.version);
        items.push(item);
      }
      return items;
    });
  }
  change(s: LearningDefinitionApprovalAdminScope, command: LearningDefinitionApprovalAdminCommand) {
    const c = validateLearningDefinitionApprovalCommand(command);
    return this.authorized(s, true, async (tx) => {
      const fingerprint = hash({
        scope: { workspaceId: s.workspaceId, groupId: s.groupId, actorUserId: s.actorUserId },
        command: c,
      });
      const prior = await tx.programAuditLog.findUnique({ where: { id: c.operationId } });
      if (prior) {
        const data = prior.afterData as { fingerprint?: string; state?: unknown };
        if (
          prior.workspaceId !== s.workspaceId ||
          prior.groupId !== s.groupId ||
          prior.performedByUserId !== s.actorUserId ||
          prior.action !== action ||
          data.fingerprint !== fingerprint
        )
          conflict();
        return { replayed: true, operationId: c.operationId, stateAtOperation: data.state };
      }
      const before = await this.read(tx, s, c.definitionKey, c.version);
      if (before.revision !== c.expectedRevision || before.reviewDigest !== c.reviewDigest)
        conflict();
      if (
        c.action === 'DEPRECATE' &&
        (!before.current || before.current.approvalStatus !== 'APPROVED')
      )
        conflict();
      const now = this.now();
      if (!Number.isFinite(now.getTime())) invalid();
      const state =
        c.action === 'APPROVE'
          ? {
              approvalStatus: 'APPROVED',
              approvedAt: now.toISOString(),
              approvedByUserId: s.actorUserId,
            }
          : { ...before.current!, approvalStatus: 'DEPRECATED' };
      const data = {
        ...before.key,
        ...state,
        approvedAt: state.approvedAt ? new Date(state.approvedAt) : null,
      };
      if (before.current)
        await tx.learningDefinitionApproval.update({
          where: { workspaceId_groupId_packageKey_definitionKey_version: before.key },
          data,
        });
      else await tx.learningDefinitionApproval.create({ data });
      await tx.programAuditLog.create({
        data: {
          id: c.operationId,
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          resourceType,
          resourceId: before.resourceId,
          action,
          beforeData: { state: before.current, revision: before.revision },
          afterData: {
            contractVersion: 'LEARNING_DEFINITION_APPROVAL_ADMIN_V1',
            ...c,
            fingerprint,
            state,
            reference: { ...before.definition.reference },
          },
          performedByUserId: s.actorUserId,
          performedAt: now,
        },
      });
      return { replayed: false, operationId: c.operationId, stateAtOperation: state };
    });
  }
}
