import { createHash } from 'node:crypto';
import {
  AI_TRAINING_SKILL_LIFECYCLE_V1,
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_SUPPORT_SKILL_ROLLBACK_AXES,
  type TrainingSupportSkillLifecycleEventV1,
  type TrainingSupportSkillLifecycleRepositoryPort,
  type TrainingSupportSkillLifecycleStateV1,
  type TrainingSupportSkillRollbackCompatibilityV1,
  type TrainingSupportSkillScopeV1,
  type TrainingSupportSkillV1,
  type TrainingSupportSkillVersionV1,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';

type Db = PrismaClient | Prisma.TransactionClient;

const reasonCodesByOperation = {
  ADOPT: ['INITIAL_HUMAN_APPROVAL'],
  ACTIVATE: ['HUMAN_APPROVED_ACTIVATION'],
  SUSPEND: ['SAFETY_REVIEW_REQUIRED', 'OUTCOME_REVIEW_REQUIRED', 'MANUAL_OPERATIONAL_STOP'],
  ROLLBACK: [
    'CURRENT_VERSION_REGRESSION',
    'CURRENT_VERSION_INCOMPATIBLE',
    'MANUAL_VERSION_RESTORE',
  ],
  REVOKE: ['SAFETY_POLICY_VIOLATION', 'CONTRACT_INVALIDATED'],
  RETIRE: ['SKILL_NO_LONGER_REQUIRED', 'PROGRAM_VERSION_RETIRED'],
} as const;

const jsonArray = (value: Prisma.JsonValue, field: string): string[] => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string'))
    throw new Error(`invalid persisted ${field}`);
  return [...value] as string[];
};

const rollbackCompatibility = (
  value: Prisma.JsonValue | null,
): TrainingSupportSkillRollbackCompatibilityV1 | null => {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid persisted rollback compatibility');
  const result = {} as TrainingSupportSkillRollbackCompatibilityV1;
  for (const axis of TRAINING_SUPPORT_SKILL_ROLLBACK_AXES) {
    const status = value[axis];
    if (typeof status !== 'string' || !['PASSED', 'BLOCKED', 'UNKNOWN'].includes(status))
      throw new Error('invalid persisted rollback compatibility');
    result[axis] = status as TrainingSupportSkillRollbackCompatibilityV1[typeof axis];
  }
  return result;
};

export function computeTrainingSupportSkillVersionDigestV1(
  version: TrainingSupportSkillVersionV1 | Omit<TrainingSupportSkillVersionV1, 'contentDigest'>,
): `sha256:${string}` {
  const canonical = JSON.stringify({
    contractVersion: version.contractVersion,
    skillVersionId: version.skillVersionId,
    skillId: version.skillId,
    version: version.version,
    artifactContractVersion: version.artifactContractVersion,
    validationPolicyVersion: version.validationPolicyVersion,
    sourceProblemId: version.sourceProblemId,
    sourceProblemRevision: version.sourceProblemRevision,
    sourceSkillDraftId: version.sourceSkillDraftId,
    sourceSkillDraftRevision: version.sourceSkillDraftRevision,
    sourceArtifactId: version.sourceArtifactId,
    sourceArtifactRevision: version.sourceArtifactRevision,
    scopeFingerprint: version.scopeFingerprint,
    steps: [...version.steps],
    expectedOutput: version.expectedOutput,
    successCriteriaKeys: [...version.successCriteriaKeys],
    barrierReasonCode: version.barrierReasonCode,
  });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

const validDigest = (version: TrainingSupportSkillVersionV1) => {
  const text = (value: string, max: number) => value.trim().length > 0 && value.length <= max;
  const contentBytes = new TextEncoder().encode(
    JSON.stringify({
      steps: version.steps,
      expectedOutput: version.expectedOutput,
      successCriteriaKeys: version.successCriteriaKeys,
    }),
  ).length;
  return (
    Number.isInteger(version.version) &&
    version.version > 0 &&
    Number.isInteger(version.sourceProblemRevision) &&
    version.sourceProblemRevision > 0 &&
    Number.isInteger(version.sourceSkillDraftRevision) &&
    version.sourceSkillDraftRevision > 0 &&
    Number.isInteger(version.sourceArtifactRevision) &&
    version.sourceArtifactRevision > 0 &&
    text(version.sourceProblemId, 160) &&
    text(version.sourceSkillDraftId, 160) &&
    text(version.sourceArtifactId, 160) &&
    text(version.scopeFingerprint, 160) &&
    version.steps.length >= 1 &&
    version.steps.length <= 5 &&
    version.steps.every((step) => text(step, 200)) &&
    text(version.expectedOutput, 500) &&
    version.successCriteriaKeys.length <= 10 &&
    new Set(version.successCriteriaKeys).size === version.successCriteriaKeys.length &&
    version.successCriteriaKeys.every((key) => text(key, 80)) &&
    (version.barrierReasonCode === null || text(version.barrierReasonCode, 80)) &&
    contentBytes <= 4096 &&
    version.contentDigest === computeTrainingSupportSkillVersionDigestV1(version)
  );
};

const normalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  return value;
};

const same = (left: unknown, right: unknown) =>
  JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));

const isWriteConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (['P2002', 'P2034'].includes(error.code) ||
    (error.code === 'P2010' && error.meta?.['code'] === '40001'));

async function readState(
  db: Db,
  skill: {
    id: string;
    workspaceId: string;
    groupId: string;
    skillKey: string;
    programTemplateVersionId: string;
    missionDefinitionKey: string;
    learningObjectiveKey: string;
    assignmentVariant: string;
    currentVersionId: string | null;
    operationalStatus: 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
    revision: number;
    createdAt: Date;
    updatedAt: Date;
  },
): Promise<TrainingSupportSkillLifecycleStateV1> {
  const [versions, events] = await Promise.all([
    db.trainingSupportSkillVersion.findMany({
      where: {
        workspaceId: skill.workspaceId,
        groupId: skill.groupId,
        trainingSupportSkillId: skill.id,
      },
      orderBy: [{ version: 'asc' }, { id: 'asc' }],
    }),
    db.trainingSupportSkillActivation.findMany({
      where: {
        workspaceId: skill.workspaceId,
        groupId: skill.groupId,
        trainingSupportSkillId: skill.id,
      },
      orderBy: [{ resultingSkillRevision: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return {
    skill: {
      contractVersion: AI_TRAINING_SKILL_LIFECYCLE_V1,
      skillId: skill.id,
      skillKey: skill.skillKey,
      scope: {
        workspaceId: skill.workspaceId,
        serviceId: skill.groupId,
        programTemplateVersionId: skill.programTemplateVersionId,
        missionDefinitionKey: skill.missionDefinitionKey,
        learningObjectiveKey: skill.learningObjectiveKey,
        assignmentVariant:
          skill.assignmentVariant as TrainingSupportSkillScopeV1['assignmentVariant'],
      },
      operationalStatus: skill.operationalStatus,
      currentVersionId: skill.currentVersionId,
      revision: skill.revision,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
    },
    versions: versions.map((version) => ({
      contractVersion: AI_TRAINING_SKILL_LIFECYCLE_V1,
      skillVersionId: version.id,
      skillId: version.trainingSupportSkillId,
      version: version.version,
      disposition: version.disposition,
      artifactContractVersion: version.artifactContractVersion,
      validationPolicyVersion: version.validationPolicyVersion,
      sourceProblemId: version.sourceProblemId,
      sourceProblemRevision: version.sourceProblemRevision,
      sourceSkillDraftId: version.sourceSkillDraftId,
      sourceSkillDraftRevision: version.sourceSkillDraftRevision,
      sourceArtifactId: version.sourceArtifactId,
      sourceArtifactRevision: version.sourceArtifactRevision,
      scopeFingerprint: version.scopeFingerprint,
      contentDigest: version.contentDigest as `sha256:${string}`,
      steps: jsonArray(version.steps, 'steps'),
      expectedOutput: version.expectedOutput,
      successCriteriaKeys: jsonArray(version.successCriteriaKeys, 'success criteria'),
      barrierReasonCode: version.barrierReasonCode,
      approvedByUserId: version.approvedByUserId,
      approvedAt: version.approvedAt,
      deprecatedAt: version.deprecatedAt,
      revokedAt: version.revokedAt,
    })),
    events: events.map((event) => ({
      contractVersion: AI_TRAINING_SKILL_LIFECYCLE_V1,
      operationId: event.id,
      operation: event.operation,
      skillId: event.trainingSupportSkillId,
      skillVersionId: event.skillVersionId,
      priorSkillVersionId: event.priorSkillVersionId,
      reasonCode: event.reasonCode as TrainingSupportSkillLifecycleEventV1['reasonCode'],
      expectedSkillRevision: event.expectedSkillRevision,
      resultingSkillRevision: event.resultingSkillRevision,
      idempotencyKey: event.idempotencyKey,
      actorUserId: event.actorUserId,
      actorServiceRole: event.actorServiceRole as 'SERVICE_OWNER' | 'SERVICE_ADMIN',
      rollbackCompatibility: rollbackCompatibility(event.rollbackCompatibility),
      occurredAt: event.occurredAt,
    })),
  };
}

async function authorizeAndLock(
  tx: Prisma.TransactionClient,
  scope: TrainingSupportSkillScopeV1,
  actorUserId: string,
  actorServiceRole: 'SERVICE_OWNER' | 'SERVICE_ADMIN',
) {
  const actor = await tx.$queryRaw<{ id: string }[]>`
    SELECT m.id FROM group_memberships m
    JOIN groups g ON g.id = m.group_id AND g.workspace_id = m.workspace_id
    JOIN workspaces w ON w.id = g.workspace_id
    JOIN users u ON u.id = m.user_id
    JOIN service_configurations sc ON sc.group_id = g.id AND sc.workspace_id = g.workspace_id
    WHERE m.workspace_id = ${scope.workspaceId}::uuid
      AND m.group_id = ${scope.serviceId}::uuid
      AND m.user_id = ${actorUserId}::uuid
      AND m.status::text = 'ACTIVE'
      AND m.service_role::text = ${actorServiceRole}
      AND m.service_role::text IN ('SERVICE_OWNER', 'SERVICE_ADMIN')
      AND g.status::text = 'ACTIVE'
      AND w.status::text = 'ACTIVE'
      AND u.status::text = 'ACTIVE'
    FOR UPDATE OF g, m FOR SHARE OF w, u, sc`;
  if (actor.length !== 1) return false;
  const program = await tx.$queryRaw<{ id: string }[]>`
    SELECT ptv.id FROM program_template_versions ptv
    JOIN service_programs sp
      ON sp.workspace_id = ptv.workspace_id
      AND sp.program_template_version_id = ptv.id
    WHERE ptv.workspace_id = ${scope.workspaceId}::uuid
      AND ptv.id = ${scope.programTemplateVersionId}::uuid
      AND sp.group_id = ${scope.serviceId}::uuid
      AND sp.settings->>'moduleKey' = ${AI_TRAINING_V1_MODULE_KEY}
    FOR SHARE OF ptv, sp`;
  return program.length > 0;
}

const eventValid = (
  event: TrainingSupportSkillLifecycleEventV1,
  skill: TrainingSupportSkillV1,
  expectedRevision: number,
) => {
  const allowed = reasonCodesByOperation[event.operation] as readonly string[];
  return (
    event.contractVersion === AI_TRAINING_SKILL_LIFECYCLE_V1 &&
    event.skillId === skill.skillId &&
    event.expectedSkillRevision === expectedRevision &&
    event.resultingSkillRevision === expectedRevision + 1 &&
    skill.revision === event.resultingSkillRevision &&
    skill.updatedAt.getTime() === event.occurredAt.getTime() &&
    ['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(event.actorServiceRole) &&
    allowed.includes(event.reasonCode) &&
    (event.operation === 'ROLLBACK'
      ? event.rollbackCompatibility !== null &&
        TRAINING_SUPPORT_SKILL_ROLLBACK_AXES.every(
          (axis) => event.rollbackCompatibility?.[axis] === 'PASSED',
        )
      : event.rollbackCompatibility === null)
  );
};

const immutableVersion = (version: TrainingSupportSkillVersionV1) => {
  return Object.fromEntries(
    Object.entries(version).filter(
      ([key]) => !['disposition', 'deprecatedAt', 'revokedAt'].includes(key),
    ),
  );
};

function validTransition(
  previous: TrainingSupportSkillLifecycleStateV1,
  next: TrainingSupportSkillLifecycleStateV1,
  previousRevision: number,
) {
  if (
    previous.skill.revision !== previousRevision ||
    next.skill.revision !== previousRevision + 1 ||
    !same(previous.skill.scope, next.skill.scope) ||
    previous.skill.skillId !== next.skill.skillId ||
    previous.skill.skillKey !== next.skill.skillKey ||
    previous.skill.createdAt.getTime() !== next.skill.createdAt.getTime() ||
    next.events.length !== previous.events.length + 1 ||
    !same(next.events.slice(0, -1), previous.events)
  )
    return false;
  const operation = next.events.at(-1);
  if (!operation || !eventValid(operation, next.skill, previousRevision)) return false;
  const previousVersions = new Map(
    previous.versions.map((version) => [version.skillVersionId, version]),
  );
  const nextVersions = new Map(next.versions.map((version) => [version.skillVersionId, version]));
  for (const [id, version] of previousVersions) {
    const candidate = nextVersions.get(id);
    if (!candidate || !same(immutableVersion(version), immutableVersion(candidate))) return false;
  }
  if (next.versions.some((version) => !validDigest(version))) return false;
  const target = operation.skillVersionId ? nextVersions.get(operation.skillVersionId) : undefined;
  const priorCurrent = previous.skill.currentVersionId;
  if (operation.priorSkillVersionId !== priorCurrent) return false;
  if (operation.operation === 'ADOPT') {
    const additions = next.versions.filter(
      (version) => !previousVersions.has(version.skillVersionId),
    );
    const maxVersion = Math.max(...previous.versions.map((version) => version.version));
    return (
      additions.length === 1 &&
      additions[0]?.skillVersionId === operation.skillVersionId &&
      additions[0]?.skillId === next.skill.skillId &&
      additions[0]?.version === maxVersion + 1 &&
      additions[0]?.disposition === 'APPROVED' &&
      additions[0]?.approvedByUserId === operation.actorUserId &&
      additions[0]?.approvedAt.getTime() === operation.occurredAt.getTime() &&
      previous.skill.currentVersionId === next.skill.currentVersionId &&
      previous.skill.operationalStatus === next.skill.operationalStatus &&
      previous.versions.every((version) => same(version, nextVersions.get(version.skillVersionId)))
    );
  }
  if (next.versions.length !== previous.versions.length) return false;
  if (operation.operation === 'ACTIVATE' || operation.operation === 'ROLLBACK') {
    if (!target || target.disposition !== 'ACTIVE' || target.revokedAt !== null) return false;
    return (
      next.skill.operationalStatus === 'ACTIVE' &&
      next.skill.currentVersionId === target.skillVersionId &&
      previous.versions.every((version) => {
        const candidate = nextVersions.get(version.skillVersionId)!;
        if (version.skillVersionId === target.skillVersionId)
          return candidate.disposition === 'ACTIVE' && candidate.deprecatedAt === null;
        if (version.disposition === 'ACTIVE')
          return (
            candidate.disposition === 'DEPRECATED' &&
            candidate.deprecatedAt?.getTime() === operation.occurredAt.getTime()
          );
        return same(version, candidate);
      })
    );
  }
  if (operation.operation === 'SUSPEND')
    return (
      next.skill.operationalStatus === 'SUSPENDED' &&
      next.skill.currentVersionId === priorCurrent &&
      same(previous.versions, next.versions)
    );
  if (operation.operation === 'REVOKE') {
    if (!target || target.disposition !== 'REVOKED') return false;
    const wasCurrent = priorCurrent === target.skillVersionId;
    return (
      target.revokedAt?.getTime() === operation.occurredAt.getTime() &&
      next.skill.currentVersionId === (wasCurrent ? null : priorCurrent) &&
      next.skill.operationalStatus ===
        (wasCurrent ? 'SUSPENDED' : previous.skill.operationalStatus) &&
      previous.versions.every((version) =>
        version.skillVersionId === target.skillVersionId
          ? true
          : same(version, nextVersions.get(version.skillVersionId)),
      )
    );
  }
  return (
    operation.operation === 'RETIRE' &&
    operation.skillVersionId === null &&
    next.skill.operationalStatus === 'RETIRED' &&
    next.skill.currentVersionId === null &&
    previous.versions.every((version) => {
      const candidate = nextVersions.get(version.skillVersionId)!;
      return version.disposition === 'ACTIVE'
        ? candidate.disposition === 'DEPRECATED' &&
            candidate.deprecatedAt?.getTime() === operation.occurredAt.getTime()
        : same(version, candidate);
    })
  );
}

const skillData = (skill: TrainingSupportSkillV1) => ({
  id: skill.skillId,
  workspaceId: skill.scope.workspaceId,
  groupId: skill.scope.serviceId,
  skillKey: skill.skillKey,
  programTemplateVersionId: skill.scope.programTemplateVersionId,
  missionDefinitionKey: skill.scope.missionDefinitionKey,
  learningObjectiveKey: skill.scope.learningObjectiveKey,
  assignmentVariant: skill.scope.assignmentVariant,
  currentVersionId: skill.currentVersionId,
  operationalStatus: skill.operationalStatus,
  revision: skill.revision,
  createdAt: skill.createdAt,
  updatedAt: skill.updatedAt,
});

const versionData = (version: TrainingSupportSkillVersionV1, skill: TrainingSupportSkillV1) => ({
  id: version.skillVersionId,
  workspaceId: skill.scope.workspaceId,
  groupId: skill.scope.serviceId,
  trainingSupportSkillId: version.skillId,
  version: version.version,
  disposition: version.disposition,
  artifactContractVersion: version.artifactContractVersion,
  validationPolicyVersion: version.validationPolicyVersion,
  sourceProblemId: version.sourceProblemId,
  sourceProblemRevision: version.sourceProblemRevision,
  sourceSkillDraftId: version.sourceSkillDraftId,
  sourceSkillDraftRevision: version.sourceSkillDraftRevision,
  sourceArtifactId: version.sourceArtifactId,
  sourceArtifactRevision: version.sourceArtifactRevision,
  scopeFingerprint: version.scopeFingerprint,
  contentDigest: version.contentDigest,
  steps: [...version.steps],
  expectedOutput: version.expectedOutput,
  successCriteriaKeys: [...version.successCriteriaKeys],
  barrierReasonCode: version.barrierReasonCode,
  approvedByUserId: version.approvedByUserId,
  approvedAt: version.approvedAt,
  deprecatedAt: version.deprecatedAt,
  revokedAt: version.revokedAt,
});

const eventData = (event: TrainingSupportSkillLifecycleEventV1, skill: TrainingSupportSkillV1) => ({
  id: event.operationId,
  workspaceId: skill.scope.workspaceId,
  groupId: skill.scope.serviceId,
  trainingSupportSkillId: event.skillId,
  skillVersionId: event.skillVersionId,
  priorSkillVersionId: event.priorSkillVersionId,
  operation: event.operation,
  reasonCode: event.reasonCode,
  expectedSkillRevision: event.expectedSkillRevision,
  resultingSkillRevision: event.resultingSkillRevision,
  idempotencyKey: event.idempotencyKey,
  actorUserId: event.actorUserId,
  actorServiceRole: event.actorServiceRole,
  rollbackCompatibility: event.rollbackCompatibility ?? Prisma.DbNull,
  occurredAt: event.occurredAt,
});

export class PrismaTrainingSupportSkillLifecycleRepository implements TrainingSupportSkillLifecycleRepositoryPort {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listByService(input: { workspaceId: string; serviceId: string }) {
    const skills = await this.client.trainingSupportSkill.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.serviceId,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    return Promise.all(skills.map((skill) => readState(this.client, skill)));
  }

  async findByScopeAndKey(input: { scope: TrainingSupportSkillScopeV1; skillKey: string }) {
    const skill = await this.client.trainingSupportSkill.findFirst({
      where: {
        workspaceId: input.scope.workspaceId,
        groupId: input.scope.serviceId,
        skillKey: input.skillKey,
        programTemplateVersionId: input.scope.programTemplateVersionId,
        missionDefinitionKey: input.scope.missionDefinitionKey,
        learningObjectiveKey: input.scope.learningObjectiveKey,
        assignmentVariant: input.scope.assignmentVariant,
      },
    });
    return skill ? readState(this.client, skill) : null;
  }

  async saveAdoption(input: {
    state: TrainingSupportSkillLifecycleStateV1;
    expectedAbsent: true;
  }): Promise<'CREATED' | 'REPLAYED' | 'CONFLICT'> {
    const { state } = input;
    const adoption = state.events[0];
    const version = state.versions[0];
    if (
      state.events.length !== 1 ||
      state.versions.length !== 1 ||
      !adoption ||
      !version ||
      adoption.operation !== 'ADOPT' ||
      adoption.priorSkillVersionId !== null ||
      state.skill.revision !== 1 ||
      state.skill.currentVersionId !== null ||
      state.skill.operationalStatus !== 'SUSPENDED' ||
      version.version !== 1 ||
      version.disposition !== 'APPROVED' ||
      version.skillId !== state.skill.skillId ||
      version.approvedByUserId !== adoption.actorUserId ||
      version.approvedAt.getTime() !== adoption.occurredAt.getTime() ||
      state.skill.createdAt.getTime() !== adoption.occurredAt.getTime() ||
      !eventValid(adoption, state.skill, 0) ||
      !validDigest(version)
    )
      return 'CONFLICT';
    try {
      return await this.client.$transaction(
        async (tx) => {
          if (
            !(await authorizeAndLock(
              tx,
              state.skill.scope,
              adoption.actorUserId,
              adoption.actorServiceRole,
            ))
          )
            return 'CONFLICT' as const;
          const existingEvent = await tx.trainingSupportSkillActivation.findFirst({
            where: {
              workspaceId: state.skill.scope.workspaceId,
              groupId: state.skill.scope.serviceId,
              idempotencyKey: adoption.idempotencyKey,
            },
          });
          const existingSkill = await tx.trainingSupportSkill.findFirst({
            where: {
              workspaceId: state.skill.scope.workspaceId,
              groupId: state.skill.scope.serviceId,
              skillKey: state.skill.skillKey,
            },
          });
          if (existingEvent || existingSkill) {
            if (!existingSkill) return 'CONFLICT' as const;
            const persisted = await readState(tx, existingSkill);
            return same(persisted, state) ? ('REPLAYED' as const) : ('CONFLICT' as const);
          }
          await tx.trainingSupportSkill.create({ data: skillData(state.skill) });
          await tx.trainingSupportSkillVersion.create({ data: versionData(version, state.skill) });
          await tx.trainingSupportSkillActivation.create({
            data: eventData(adoption, state.skill),
          });
          return 'CREATED' as const;
        },
        { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 20_000 },
      );
    } catch (error) {
      if (!isWriteConflict(error)) throw error;
      const persisted = await this.findByScopeAndKey({
        scope: state.skill.scope,
        skillKey: state.skill.skillKey,
      });
      return persisted && same(persisted, state) ? 'REPLAYED' : 'CONFLICT';
    }
  }

  async saveTransition(input: {
    previousRevision: number;
    state: TrainingSupportSkillLifecycleStateV1;
  }): Promise<'UPDATED' | 'REPLAYED' | 'CONFLICT'> {
    const operation = input.state.events.at(-1);
    if (!operation || operation.expectedSkillRevision !== input.previousRevision) return 'CONFLICT';
    try {
      return await this.client.$transaction(
        async (tx) => {
          if (
            !(await authorizeAndLock(
              tx,
              input.state.skill.scope,
              operation.actorUserId,
              operation.actorServiceRole,
            ))
          )
            return 'CONFLICT' as const;
          await tx.$queryRaw`
            SELECT id FROM training_support_skills
            WHERE workspace_id = ${input.state.skill.scope.workspaceId}::uuid
              AND group_id = ${input.state.skill.scope.serviceId}::uuid
              AND id = ${input.state.skill.skillId}::uuid
            FOR UPDATE`;
          const row = await tx.trainingSupportSkill.findFirst({
            where: {
              id: input.state.skill.skillId,
              workspaceId: input.state.skill.scope.workspaceId,
              groupId: input.state.skill.scope.serviceId,
              skillKey: input.state.skill.skillKey,
            },
          });
          if (!row) return 'CONFLICT' as const;
          const previous = await readState(tx, row);
          const replay = previous.events.find(
            (event) => event.idempotencyKey === operation.idempotencyKey,
          );
          if (replay)
            return same(previous, input.state) ? ('REPLAYED' as const) : ('CONFLICT' as const);
          if (!validTransition(previous, input.state, input.previousRevision))
            return 'CONFLICT' as const;
          const updated = await tx.trainingSupportSkill.updateMany({
            where: {
              id: row.id,
              workspaceId: row.workspaceId,
              groupId: row.groupId,
              revision: input.previousRevision,
            },
            data: {
              currentVersionId: input.state.skill.currentVersionId,
              operationalStatus: input.state.skill.operationalStatus,
              revision: input.state.skill.revision,
              updatedAt: input.state.skill.updatedAt,
            },
          });
          if (updated.count !== 1) return 'CONFLICT' as const;
          const previousIds = new Set(previous.versions.map((version) => version.skillVersionId));
          const orderedVersions = [...input.state.versions].sort(
            (left, right) =>
              Number(left.disposition === 'ACTIVE') - Number(right.disposition === 'ACTIVE'),
          );
          for (const version of orderedVersions) {
            if (!previousIds.has(version.skillVersionId)) {
              await tx.trainingSupportSkillVersion.create({
                data: versionData(version, input.state.skill),
              });
              continue;
            }
            const old = previous.versions.find(
              (candidate) => candidate.skillVersionId === version.skillVersionId,
            )!;
            if (
              old.disposition !== version.disposition ||
              old.deprecatedAt?.getTime() !== version.deprecatedAt?.getTime() ||
              old.revokedAt?.getTime() !== version.revokedAt?.getTime()
            )
              await tx.trainingSupportSkillVersion.update({
                where: { id: version.skillVersionId },
                data: {
                  disposition: version.disposition,
                  deprecatedAt: version.deprecatedAt,
                  revokedAt: version.revokedAt,
                },
              });
          }
          await tx.trainingSupportSkillActivation.create({
            data: eventData(operation, input.state.skill),
          });
          return 'UPDATED' as const;
        },
        { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 20_000 },
      );
    } catch (error) {
      if (!isWriteConflict(error)) throw error;
      const persisted = await this.findByScopeAndKey({
        scope: input.state.skill.scope,
        skillKey: input.state.skill.skillKey,
      });
      return persisted && same(persisted, input.state) ? 'REPLAYED' : 'CONFLICT';
    }
  }
}
