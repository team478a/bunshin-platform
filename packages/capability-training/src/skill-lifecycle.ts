import type { TrainingMissionVariant } from './barrier';
import {
  canApproveTrainingSkillFactory,
  validateTrainingSupportDraftV1,
  type TrainingMissionHelpProblemV1,
  type TrainingMissionSupportSkillDraftV1,
  type TrainingSkillDraftFeasibilityV1,
  type TrainingSupportDraftArtifactV1,
  type TrainingSupportDraftValidationReceiptV1,
} from './skill-factory';

export const AI_TRAINING_SKILL_LIFECYCLE_V1 = 'AI_TRAINING_SKILL_LIFECYCLE_V1';

export const TRAINING_SUPPORT_SKILL_OPERATIONS = [
  'ADOPT',
  'ACTIVATE',
  'SUSPEND',
  'ROLLBACK',
  'REVOKE',
  'RETIRE',
] as const;
export type TrainingSupportSkillOperation = (typeof TRAINING_SUPPORT_SKILL_OPERATIONS)[number];

export const TRAINING_SUPPORT_SKILL_REASON_CODES = [
  'INITIAL_HUMAN_APPROVAL',
  'HUMAN_APPROVED_ACTIVATION',
  'SAFETY_REVIEW_REQUIRED',
  'OUTCOME_REVIEW_REQUIRED',
  'MANUAL_OPERATIONAL_STOP',
  'CURRENT_VERSION_REGRESSION',
  'CURRENT_VERSION_INCOMPATIBLE',
  'MANUAL_VERSION_RESTORE',
  'SAFETY_POLICY_VIOLATION',
  'CONTRACT_INVALIDATED',
  'SKILL_NO_LONGER_REQUIRED',
  'PROGRAM_VERSION_RETIRED',
] as const;
export type TrainingSupportSkillReasonCode = (typeof TRAINING_SUPPORT_SKILL_REASON_CODES)[number];

export type TrainingSupportSkillOperationalStatus = 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
export type TrainingSupportSkillVersionDisposition =
  'APPROVED' | 'ACTIVE' | 'DEPRECATED' | 'REVOKED';

export interface TrainingSupportSkillScopeV1 {
  workspaceId: string;
  serviceId: string;
  programTemplateVersionId: string;
  missionDefinitionKey: string;
  learningObjectiveKey: string;
  assignmentVariant: TrainingMissionVariant;
}

export interface TrainingSupportSkillV1 {
  contractVersion: typeof AI_TRAINING_SKILL_LIFECYCLE_V1;
  skillId: string;
  skillKey: string;
  scope: TrainingSupportSkillScopeV1;
  operationalStatus: TrainingSupportSkillOperationalStatus;
  currentVersionId: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrainingSupportSkillVersionV1 {
  contractVersion: typeof AI_TRAINING_SKILL_LIFECYCLE_V1;
  skillVersionId: string;
  skillId: string;
  version: number;
  disposition: TrainingSupportSkillVersionDisposition;
  artifactContractVersion: string;
  validationPolicyVersion: string;
  sourceProblemId: string;
  sourceProblemRevision: number;
  sourceSkillDraftId: string;
  sourceSkillDraftRevision: number;
  sourceArtifactId: string;
  sourceArtifactRevision: number;
  scopeFingerprint: string;
  contentDigest: `sha256:${string}`;
  steps: readonly string[];
  expectedOutput: string;
  successCriteriaKeys: readonly string[];
  barrierReasonCode: string | null;
  approvedByUserId: string;
  approvedAt: Date;
  deprecatedAt: Date | null;
  revokedAt: Date | null;
}

export interface TrainingSupportSkillLifecycleEventV1 {
  contractVersion: typeof AI_TRAINING_SKILL_LIFECYCLE_V1;
  operationId: string;
  operation: TrainingSupportSkillOperation;
  skillId: string;
  skillVersionId: string | null;
  priorSkillVersionId: string | null;
  reasonCode: TrainingSupportSkillReasonCode;
  expectedSkillRevision: number;
  resultingSkillRevision: number;
  idempotencyKey: string;
  actorUserId: string;
  actorServiceRole: 'SERVICE_OWNER' | 'SERVICE_ADMIN';
  occurredAt: Date;
}

export interface TrainingSupportSkillLifecycleStateV1 {
  skill: TrainingSupportSkillV1;
  versions: readonly TrainingSupportSkillVersionV1[];
  events: readonly TrainingSupportSkillLifecycleEventV1[];
}

export interface TrainingSupportSkillLifecycleActorV1 {
  userId: string;
  serviceRole: string;
  active: boolean;
}

export const TRAINING_SUPPORT_SKILL_ROLLBACK_AXES = [
  'PROGRAM_VERSION',
  'MISSION',
  'LEARNING_OBJECTIVE',
  'ASSIGNMENT_VARIANT',
  'VALIDATION_POLICY',
] as const;
export type TrainingSupportSkillRollbackAxis =
  (typeof TRAINING_SUPPORT_SKILL_ROLLBACK_AXES)[number];
export type TrainingSupportSkillRollbackStatus = 'PASSED' | 'BLOCKED' | 'UNKNOWN';
export type TrainingSupportSkillRollbackCompatibilityV1 = Record<
  TrainingSupportSkillRollbackAxis,
  TrainingSupportSkillRollbackStatus
>;

export interface TrainingSupportSkillLifecycleRepositoryPort {
  findByScopeAndKey(input: {
    scope: TrainingSupportSkillScopeV1;
    skillKey: string;
  }): Promise<TrainingSupportSkillLifecycleStateV1 | null>;
  saveAdoption(input: {
    state: TrainingSupportSkillLifecycleStateV1;
    expectedAbsent: true;
  }): Promise<'CREATED' | 'REPLAYED' | 'CONFLICT'>;
  saveTransition(input: {
    previousRevision: number;
    state: TrainingSupportSkillLifecycleStateV1;
  }): Promise<'UPDATED' | 'REPLAYED' | 'CONFLICT'>;
}

const reasonsByOperation: Record<
  TrainingSupportSkillOperation,
  readonly TrainingSupportSkillReasonCode[]
> = {
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
};

const requiredText = (value: string, field: string, max = 200) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`invalid ${field}`);
  return normalized;
};

const positiveRevision = (value: number, field: string, allowZero = false) => {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) throw new Error(`invalid ${field}`);
};

const validDate = (value: Date, field: string) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw new Error(`invalid ${field}`);
};

const assertActor = (actor: TrainingSupportSkillLifecycleActorV1) => {
  requiredText(actor.userId, 'actor.userId');
  if (!canApproveTrainingSkillFactory(actor))
    throw new Error('skill lifecycle actor not authorized');
  return actor.serviceRole as 'SERVICE_OWNER' | 'SERVICE_ADMIN';
};

const assertReason = (
  operation: TrainingSupportSkillOperation,
  reasonCode: TrainingSupportSkillReasonCode,
) => {
  if (!reasonsByOperation[operation].includes(reasonCode))
    throw new Error(`invalid reason for ${operation}`);
};

const assertDigest = (value: string) => {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error('invalid contentDigest');
};

const assertExpectedRevision = (
  state: TrainingSupportSkillLifecycleStateV1,
  expectedRevision: number,
) => {
  positiveRevision(expectedRevision, 'expectedSkillRevision');
  if (state.skill.revision !== expectedRevision) throw new Error('skill revision conflict');
};

const cloneState = (
  state: TrainingSupportSkillLifecycleStateV1,
): TrainingSupportSkillLifecycleStateV1 => ({
  skill: {
    ...state.skill,
    scope: { ...state.skill.scope },
    createdAt: new Date(state.skill.createdAt),
    updatedAt: new Date(state.skill.updatedAt),
  },
  versions: state.versions.map((version) => ({
    ...version,
    steps: [...version.steps],
    successCriteriaKeys: [...version.successCriteriaKeys],
    approvedAt: new Date(version.approvedAt),
    deprecatedAt: version.deprecatedAt ? new Date(version.deprecatedAt) : null,
    revokedAt: version.revokedAt ? new Date(version.revokedAt) : null,
  })),
  events: state.events.map((event) => ({ ...event, occurredAt: new Date(event.occurredAt) })),
});

const replay = (
  state: TrainingSupportSkillLifecycleStateV1,
  input: {
    idempotencyKey: string;
    operation: TrainingSupportSkillOperation;
    skillVersionId: string | null;
    reasonCode: TrainingSupportSkillReasonCode;
    actorUserId: string;
  },
) => {
  const prior = state.events.find((event) => event.idempotencyKey === input.idempotencyKey);
  if (!prior) return null;
  if (
    prior.operation !== input.operation ||
    prior.skillVersionId !== input.skillVersionId ||
    prior.reasonCode !== input.reasonCode ||
    prior.actorUserId !== input.actorUserId
  )
    throw new Error('idempotency key conflict');
  return cloneState(state);
};

const event = (input: {
  operationId: string;
  operation: TrainingSupportSkillOperation;
  skillId: string;
  skillVersionId: string | null;
  priorSkillVersionId: string | null;
  reasonCode: TrainingSupportSkillReasonCode;
  expectedSkillRevision: number;
  resultingSkillRevision: number;
  idempotencyKey: string;
  actorUserId: string;
  actorServiceRole: 'SERVICE_OWNER' | 'SERVICE_ADMIN';
  occurredAt: Date;
}): TrainingSupportSkillLifecycleEventV1 => ({
  contractVersion: AI_TRAINING_SKILL_LIFECYCLE_V1,
  ...input,
  occurredAt: new Date(input.occurredAt),
});

const validateOperationInput = (input: {
  operationId: string;
  idempotencyKey: string;
  now: Date;
  operation: TrainingSupportSkillOperation;
  reasonCode: TrainingSupportSkillReasonCode;
  actor: TrainingSupportSkillLifecycleActorV1;
}) => {
  requiredText(input.operationId, 'operationId');
  requiredText(input.idempotencyKey, 'idempotencyKey');
  validDate(input.now, 'now');
  assertReason(input.operation, input.reasonCode);
  return assertActor(input.actor);
};

export function adoptTrainingSupportSkillVersionV1(input: {
  skillId: string;
  skillVersionId: string;
  skillKey: string;
  contentDigest: `sha256:${string}`;
  expectedSkillRevision: 0;
  operationId: string;
  idempotencyKey: string;
  reasonCode: Extract<TrainingSupportSkillReasonCode, 'INITIAL_HUMAN_APPROVAL'>;
  actor: TrainingSupportSkillLifecycleActorV1;
  problem: TrainingMissionHelpProblemV1;
  feasibility: TrainingSkillDraftFeasibilityV1;
  skillDraft: TrainingMissionSupportSkillDraftV1;
  artifact: TrainingSupportDraftArtifactV1;
  validationReceipt: TrainingSupportDraftValidationReceiptV1;
  now: Date;
}): TrainingSupportSkillLifecycleStateV1 {
  const actorServiceRole = validateOperationInput({ ...input, operation: 'ADOPT' });
  if (input.expectedSkillRevision !== 0) throw new Error('new skill revision must be zero');
  requiredText(input.skillId, 'skillId');
  requiredText(input.skillVersionId, 'skillVersionId');
  requiredText(input.skillKey, 'skillKey', 120);
  assertDigest(input.contentDigest);

  const freshReceipt = validateTrainingSupportDraftV1({
    problem: input.problem,
    feasibility: input.feasibility,
    skillDraft: input.skillDraft,
    artifact: input.artifact,
    now: input.now,
  });
  if (freshReceipt.status !== 'VALID' || input.validationReceipt.status !== 'VALID')
    throw new Error('skill adoption requires valid receipt');
  if (
    input.validationReceipt.problemId !== freshReceipt.problemId ||
    input.validationReceipt.problemRevision !== freshReceipt.problemRevision ||
    input.validationReceipt.skillDraftId !== freshReceipt.skillDraftId ||
    input.validationReceipt.skillDraftRevision !== freshReceipt.skillDraftRevision ||
    input.validationReceipt.artifactId !== freshReceipt.artifactId ||
    input.validationReceipt.artifactRevision !== freshReceipt.artifactRevision
  )
    throw new Error('validation receipt mismatch');

  const scope: TrainingSupportSkillScopeV1 = {
    workspaceId: input.problem.scope.workspaceId,
    serviceId: input.problem.scope.serviceId,
    programTemplateVersionId: input.problem.mission.programTemplateVersionId,
    missionDefinitionKey: input.problem.mission.missionDefinitionKey,
    learningObjectiveKey: input.problem.contextProjection.learningObjectiveKey,
    assignmentVariant: input.problem.mission.assignmentVariant,
  };
  const skill: TrainingSupportSkillV1 = {
    contractVersion: AI_TRAINING_SKILL_LIFECYCLE_V1,
    skillId: input.skillId,
    skillKey: input.skillKey,
    scope,
    operationalStatus: 'SUSPENDED',
    currentVersionId: null,
    revision: 1,
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now),
  };
  const version: TrainingSupportSkillVersionV1 = {
    contractVersion: AI_TRAINING_SKILL_LIFECYCLE_V1,
    skillVersionId: input.skillVersionId,
    skillId: input.skillId,
    version: 1,
    disposition: 'APPROVED',
    artifactContractVersion: input.artifact.contractVersion,
    validationPolicyVersion: input.artifact.validationPolicyVersion,
    sourceProblemId: input.problem.problemId,
    sourceProblemRevision: input.problem.revision,
    sourceSkillDraftId: input.skillDraft.skillDraftId,
    sourceSkillDraftRevision: input.skillDraft.revision,
    sourceArtifactId: input.artifact.artifactId,
    sourceArtifactRevision: input.artifact.revision,
    scopeFingerprint: input.artifact.scopeFingerprint,
    contentDigest: input.contentDigest,
    steps: [...input.artifact.steps],
    expectedOutput: input.artifact.expectedOutput,
    successCriteriaKeys: [...input.artifact.successCriteriaKeys],
    barrierReasonCode: input.artifact.barrierReasonCode,
    approvedByUserId: input.actor.userId,
    approvedAt: new Date(input.now),
    deprecatedAt: null,
    revokedAt: null,
  };
  const adoptionEvent = event({
    operationId: input.operationId,
    operation: 'ADOPT',
    skillId: input.skillId,
    skillVersionId: input.skillVersionId,
    priorSkillVersionId: null,
    reasonCode: input.reasonCode,
    expectedSkillRevision: 0,
    resultingSkillRevision: 1,
    idempotencyKey: input.idempotencyKey,
    actorUserId: input.actor.userId,
    actorServiceRole,
    occurredAt: input.now,
  });
  return { skill, versions: [version], events: [adoptionEvent] };
}

export function approveNextTrainingSupportSkillVersionV1(input: {
  state: TrainingSupportSkillLifecycleStateV1;
  skillVersionId: string;
  contentDigest: `sha256:${string}`;
  expectedSkillRevision: number;
  operationId: string;
  idempotencyKey: string;
  reasonCode: Extract<TrainingSupportSkillReasonCode, 'INITIAL_HUMAN_APPROVAL'>;
  actor: TrainingSupportSkillLifecycleActorV1;
  problem: TrainingMissionHelpProblemV1;
  feasibility: TrainingSkillDraftFeasibilityV1;
  skillDraft: TrainingMissionSupportSkillDraftV1;
  artifact: TrainingSupportDraftArtifactV1;
  validationReceipt: TrainingSupportDraftValidationReceiptV1;
  now: Date;
}) {
  const actorServiceRole = validateOperationInput({ ...input, operation: 'ADOPT' });
  const replayed = replay(input.state, {
    idempotencyKey: input.idempotencyKey,
    operation: 'ADOPT',
    skillVersionId: input.skillVersionId,
    reasonCode: input.reasonCode,
    actorUserId: input.actor.userId,
  });
  if (replayed) return replayed;
  assertExpectedRevision(input.state, input.expectedSkillRevision);
  if (input.state.skill.operationalStatus === 'RETIRED')
    throw new Error('retired skill cannot add version');
  requiredText(input.skillVersionId, 'skillVersionId');
  assertDigest(input.contentDigest);
  if (input.state.versions.some((version) => version.skillVersionId === input.skillVersionId))
    throw new Error('skill version already exists');

  const freshReceipt = validateTrainingSupportDraftV1({
    problem: input.problem,
    feasibility: input.feasibility,
    skillDraft: input.skillDraft,
    artifact: input.artifact,
    now: input.now,
  });
  if (freshReceipt.status !== 'VALID' || input.validationReceipt.status !== 'VALID')
    throw new Error('skill adoption requires valid receipt');
  if (
    input.validationReceipt.problemId !== freshReceipt.problemId ||
    input.validationReceipt.problemRevision !== freshReceipt.problemRevision ||
    input.validationReceipt.skillDraftId !== freshReceipt.skillDraftId ||
    input.validationReceipt.skillDraftRevision !== freshReceipt.skillDraftRevision ||
    input.validationReceipt.artifactId !== freshReceipt.artifactId ||
    input.validationReceipt.artifactRevision !== freshReceipt.artifactRevision
  )
    throw new Error('validation receipt mismatch');

  const scope = input.state.skill.scope;
  if (
    scope.workspaceId !== input.problem.scope.workspaceId ||
    scope.serviceId !== input.problem.scope.serviceId ||
    scope.programTemplateVersionId !== input.problem.mission.programTemplateVersionId ||
    scope.missionDefinitionKey !== input.problem.mission.missionDefinitionKey ||
    scope.learningObjectiveKey !== input.problem.contextProjection.learningObjectiveKey ||
    scope.assignmentVariant !== input.problem.mission.assignmentVariant
  )
    throw new Error('skill version scope mismatch');

  const next = cloneState(input.state);
  const nextRevision = next.skill.revision + 1;
  const versionNumber = Math.max(...next.versions.map((version) => version.version)) + 1;
  next.versions = [
    ...next.versions,
    {
      contractVersion: AI_TRAINING_SKILL_LIFECYCLE_V1,
      skillVersionId: input.skillVersionId,
      skillId: next.skill.skillId,
      version: versionNumber,
      disposition: 'APPROVED',
      artifactContractVersion: input.artifact.contractVersion,
      validationPolicyVersion: input.artifact.validationPolicyVersion,
      sourceProblemId: input.problem.problemId,
      sourceProblemRevision: input.problem.revision,
      sourceSkillDraftId: input.skillDraft.skillDraftId,
      sourceSkillDraftRevision: input.skillDraft.revision,
      sourceArtifactId: input.artifact.artifactId,
      sourceArtifactRevision: input.artifact.revision,
      scopeFingerprint: input.artifact.scopeFingerprint,
      contentDigest: input.contentDigest,
      steps: [...input.artifact.steps],
      expectedOutput: input.artifact.expectedOutput,
      successCriteriaKeys: [...input.artifact.successCriteriaKeys],
      barrierReasonCode: input.artifact.barrierReasonCode,
      approvedByUserId: input.actor.userId,
      approvedAt: new Date(input.now),
      deprecatedAt: null,
      revokedAt: null,
    },
  ];
  next.skill = { ...next.skill, revision: nextRevision, updatedAt: new Date(input.now) };
  next.events = [
    ...next.events,
    event({
      operationId: input.operationId,
      operation: 'ADOPT',
      skillId: next.skill.skillId,
      skillVersionId: input.skillVersionId,
      priorSkillVersionId: next.skill.currentVersionId,
      reasonCode: input.reasonCode,
      expectedSkillRevision: input.expectedSkillRevision,
      resultingSkillRevision: nextRevision,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.actor.userId,
      actorServiceRole,
      occurredAt: input.now,
    }),
  ];
  return next;
}

type TransitionInput = {
  state: TrainingSupportSkillLifecycleStateV1;
  expectedSkillRevision: number;
  operationId: string;
  idempotencyKey: string;
  reasonCode: TrainingSupportSkillReasonCode;
  actor: TrainingSupportSkillLifecycleActorV1;
  now: Date;
};

const activate = (
  input: TransitionInput & {
    skillVersionId: string;
    operation: 'ACTIVATE' | 'ROLLBACK';
    compatibility?: TrainingSupportSkillRollbackCompatibilityV1;
  },
) => {
  const actorServiceRole = validateOperationInput(input);
  const replayed = replay(input.state, {
    idempotencyKey: input.idempotencyKey,
    operation: input.operation,
    skillVersionId: input.skillVersionId,
    reasonCode: input.reasonCode,
    actorUserId: input.actor.userId,
  });
  if (replayed) return replayed;
  assertExpectedRevision(input.state, input.expectedSkillRevision);
  if (input.state.skill.operationalStatus === 'RETIRED')
    throw new Error('retired skill cannot activate');
  const target = input.state.versions.find(
    (version) => version.skillVersionId === input.skillVersionId,
  );
  if (!target || target.skillId !== input.state.skill.skillId)
    throw new Error('skill version not found');
  if (target.disposition === 'REVOKED') throw new Error('revoked skill version cannot activate');
  if (input.operation === 'ACTIVATE' && target.disposition === 'DEPRECATED')
    throw new Error('deprecated version requires rollback');
  if (input.operation === 'ROLLBACK') {
    if (!input.compatibility) throw new Error('rollback compatibility required');
    const statuses = TRAINING_SUPPORT_SKILL_ROLLBACK_AXES.map(
      (axis) => input.compatibility?.[axis],
    );
    if (statuses.includes('UNKNOWN')) throw new Error('rollback review required');
    if (statuses.some((status) => status !== 'PASSED')) throw new Error('rollback blocked');
  }

  const previousVersionId = input.state.skill.currentVersionId;
  const nextRevision = input.state.skill.revision + 1;
  const next = cloneState(input.state);
  next.versions = next.versions.map((version) =>
    version.skillVersionId === target.skillVersionId
      ? { ...version, disposition: 'ACTIVE', deprecatedAt: null }
      : version.disposition === 'ACTIVE'
        ? { ...version, disposition: 'DEPRECATED', deprecatedAt: new Date(input.now) }
        : version,
  );
  next.skill = {
    ...next.skill,
    operationalStatus: 'ACTIVE',
    currentVersionId: target.skillVersionId,
    revision: nextRevision,
    updatedAt: new Date(input.now),
  };
  next.events = [
    ...next.events,
    event({
      operationId: input.operationId,
      operation: input.operation,
      skillId: next.skill.skillId,
      skillVersionId: target.skillVersionId,
      priorSkillVersionId: previousVersionId,
      reasonCode: input.reasonCode,
      expectedSkillRevision: input.expectedSkillRevision,
      resultingSkillRevision: nextRevision,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.actor.userId,
      actorServiceRole,
      occurredAt: input.now,
    }),
  ];
  return next;
};

export function activateTrainingSupportSkillVersionV1(
  input: TransitionInput & {
    skillVersionId: string;
    reasonCode: Extract<TrainingSupportSkillReasonCode, 'HUMAN_APPROVED_ACTIVATION'>;
  },
) {
  return activate({ ...input, operation: 'ACTIVATE' });
}

export function rollbackTrainingSupportSkillVersionV1(
  input: TransitionInput & {
    skillVersionId: string;
    reasonCode: Extract<
      TrainingSupportSkillReasonCode,
      'CURRENT_VERSION_REGRESSION' | 'CURRENT_VERSION_INCOMPATIBLE' | 'MANUAL_VERSION_RESTORE'
    >;
    compatibility: TrainingSupportSkillRollbackCompatibilityV1;
  },
) {
  return activate({ ...input, operation: 'ROLLBACK' });
}

export function suspendTrainingSupportSkillV1(
  input: TransitionInput & {
    reasonCode: Extract<
      TrainingSupportSkillReasonCode,
      'SAFETY_REVIEW_REQUIRED' | 'OUTCOME_REVIEW_REQUIRED' | 'MANUAL_OPERATIONAL_STOP'
    >;
  },
) {
  const actorServiceRole = validateOperationInput({ ...input, operation: 'SUSPEND' });
  const replayed = replay(input.state, {
    idempotencyKey: input.idempotencyKey,
    operation: 'SUSPEND',
    skillVersionId: input.state.skill.currentVersionId,
    reasonCode: input.reasonCode,
    actorUserId: input.actor.userId,
  });
  if (replayed) return replayed;
  assertExpectedRevision(input.state, input.expectedSkillRevision);
  if (input.state.skill.operationalStatus === 'RETIRED')
    throw new Error('retired skill cannot suspend');
  const next = cloneState(input.state);
  const nextRevision = next.skill.revision + 1;
  next.skill = {
    ...next.skill,
    operationalStatus: 'SUSPENDED',
    revision: nextRevision,
    updatedAt: new Date(input.now),
  };
  next.events = [
    ...next.events,
    event({
      operationId: input.operationId,
      operation: 'SUSPEND',
      skillId: next.skill.skillId,
      skillVersionId: next.skill.currentVersionId,
      priorSkillVersionId: next.skill.currentVersionId,
      reasonCode: input.reasonCode,
      expectedSkillRevision: input.expectedSkillRevision,
      resultingSkillRevision: nextRevision,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.actor.userId,
      actorServiceRole,
      occurredAt: input.now,
    }),
  ];
  return next;
}

export function revokeTrainingSupportSkillVersionV1(
  input: TransitionInput & {
    skillVersionId: string;
    reasonCode: Extract<
      TrainingSupportSkillReasonCode,
      'SAFETY_POLICY_VIOLATION' | 'CONTRACT_INVALIDATED'
    >;
  },
) {
  const actorServiceRole = validateOperationInput({ ...input, operation: 'REVOKE' });
  const replayed = replay(input.state, {
    idempotencyKey: input.idempotencyKey,
    operation: 'REVOKE',
    skillVersionId: input.skillVersionId,
    reasonCode: input.reasonCode,
    actorUserId: input.actor.userId,
  });
  if (replayed) return replayed;
  assertExpectedRevision(input.state, input.expectedSkillRevision);
  const target = input.state.versions.find(
    (version) => version.skillVersionId === input.skillVersionId,
  );
  if (!target) throw new Error('skill version not found');
  if (target.disposition === 'REVOKED') throw new Error('skill version already revoked');
  const next = cloneState(input.state);
  const nextRevision = next.skill.revision + 1;
  next.versions = next.versions.map((version) =>
    version.skillVersionId === target.skillVersionId
      ? { ...version, disposition: 'REVOKED', revokedAt: new Date(input.now) }
      : version,
  );
  const wasCurrent = next.skill.currentVersionId === target.skillVersionId;
  next.skill = {
    ...next.skill,
    operationalStatus: wasCurrent ? 'SUSPENDED' : next.skill.operationalStatus,
    currentVersionId: wasCurrent ? null : next.skill.currentVersionId,
    revision: nextRevision,
    updatedAt: new Date(input.now),
  };
  next.events = [
    ...next.events,
    event({
      operationId: input.operationId,
      operation: 'REVOKE',
      skillId: next.skill.skillId,
      skillVersionId: target.skillVersionId,
      priorSkillVersionId: input.state.skill.currentVersionId,
      reasonCode: input.reasonCode,
      expectedSkillRevision: input.expectedSkillRevision,
      resultingSkillRevision: nextRevision,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.actor.userId,
      actorServiceRole,
      occurredAt: input.now,
    }),
  ];
  return next;
}

export function retireTrainingSupportSkillV1(
  input: TransitionInput & {
    reasonCode: Extract<
      TrainingSupportSkillReasonCode,
      'SKILL_NO_LONGER_REQUIRED' | 'PROGRAM_VERSION_RETIRED'
    >;
  },
) {
  const actorServiceRole = validateOperationInput({ ...input, operation: 'RETIRE' });
  const replayed = replay(input.state, {
    idempotencyKey: input.idempotencyKey,
    operation: 'RETIRE',
    skillVersionId: input.state.skill.currentVersionId,
    reasonCode: input.reasonCode,
    actorUserId: input.actor.userId,
  });
  if (replayed) return replayed;
  assertExpectedRevision(input.state, input.expectedSkillRevision);
  if (input.state.skill.operationalStatus === 'RETIRED') throw new Error('skill already retired');
  const next = cloneState(input.state);
  const nextRevision = next.skill.revision + 1;
  next.versions = next.versions.map((version) =>
    version.disposition === 'ACTIVE'
      ? { ...version, disposition: 'DEPRECATED', deprecatedAt: new Date(input.now) }
      : version,
  );
  next.skill = {
    ...next.skill,
    operationalStatus: 'RETIRED',
    currentVersionId: null,
    revision: nextRevision,
    updatedAt: new Date(input.now),
  };
  next.events = [
    ...next.events,
    event({
      operationId: input.operationId,
      operation: 'RETIRE',
      skillId: next.skill.skillId,
      skillVersionId: null,
      priorSkillVersionId: input.state.skill.currentVersionId,
      reasonCode: input.reasonCode,
      expectedSkillRevision: input.expectedSkillRevision,
      resultingSkillRevision: nextRevision,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.actor.userId,
      actorServiceRole,
      occurredAt: input.now,
    }),
  ];
  return next;
}
