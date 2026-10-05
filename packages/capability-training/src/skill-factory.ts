import type { TrainingActionKey, TrainingInteractionType } from './index';
import {
  isTrainingBarrierReason,
  type TrainingBarrierReason,
  type TrainingMissionVariant,
} from './barrier';
import { getAiTrainingMissionQuality } from './mission-quality';
import { TRAINING_SKILL_KEYS, type TrainingSkillKey } from './skill-evaluation';

export const AI_TRAINING_SKILL_FACTORY_V1 = 'AI_TRAINING_SKILL_FACTORY_V1';
export const AI_TRAINING_SKILL_FACTORY_VALIDATION_V1 = 'AI_TRAINING_SKILL_FACTORY_VALIDATION_V1';
export const TRAINING_SKILL_FACTORY_PROBLEM_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
export const TRAINING_SKILL_FACTORY_MAX_STEPS = 5;
export const TRAINING_SKILL_FACTORY_MAX_STEP_CHARS = 200;
export const TRAINING_SKILL_FACTORY_MAX_ARTIFACT_BYTES = 4_096;
const AI_TRAINING_SKILL_FACTORY_MODULE_KEY = 'AI_TRAINING_V1' as const;

export const TRAINING_SKILL_FACTORY_APPROVER_ROLES = ['SERVICE_OWNER', 'SERVICE_ADMIN'] as const;
export type TrainingSkillFactoryApproverRole =
  (typeof TRAINING_SKILL_FACTORY_APPROVER_ROLES)[number];

export const TRAINING_SKILL_FACTORY_FEASIBILITY_AXES = [
  'AUTHORIZATION',
  'SCOPE',
  'PROGRAM',
  'ENROLLMENT_PERIOD',
  'PROBLEM_APPROVAL',
  'SOURCE_REVISION',
  'DATA_POLICY',
  'BUDGET',
  'DELIVERY',
] as const;
export type TrainingSkillFactoryFeasibilityAxis =
  (typeof TRAINING_SKILL_FACTORY_FEASIBILITY_AXES)[number];
export type TrainingSkillFactoryCheckStatus = 'PASSED' | 'BLOCKED' | 'UNKNOWN';

export type TrainingMissionHelpProblemStatus = 'DRAFT' | 'APPROVED' | 'REVOKED' | 'EXPIRED';
const problemStatuses: readonly TrainingMissionHelpProblemStatus[] = [
  'DRAFT',
  'APPROVED',
  'REVOKED',
  'EXPIRED',
];
const skillDraftStatuses: readonly TrainingMissionSupportSkillDraftV1['status'][] = [
  'DRAFT',
  'VALIDATED',
  'APPROVED',
  'REJECTED',
  'REVOKED',
  'EXPIRED',
];

export interface TrainingMissionHelpScopeV1 {
  workspaceId: string;
  serviceId: string;
  programEnrollmentId: string;
  missionAssignmentId: string;
}

export interface TrainingMissionHelpProblemV1 {
  contractVersion: typeof AI_TRAINING_SKILL_FACTORY_V1;
  problemId: string;
  revision: number;
  status: TrainingMissionHelpProblemStatus;
  scope: TrainingMissionHelpScopeV1;
  source: TrainingMissionHelpScopeV1 & {
    actionEventId: string;
    actionEventSchemaVersion: 1;
    eventType: Extract<TrainingInteractionType, 'HELP_REQUESTED'>;
    moduleKey: typeof AI_TRAINING_SKILL_FACTORY_MODULE_KEY;
    occurredAt: Date;
  };
  mission: {
    programTemplateVersionId: string;
    missionDefinitionKey: TrainingActionKey;
    missionRuleVersion: string;
    assignmentVariant: TrainingMissionVariant;
  };
  contextProjection: {
    learningObjectiveKey: string;
    relevantSuccessCriteriaKeys: readonly string[];
    barrierReasonCode: TrainingBarrierReason | null;
    evaluatedSkillKeys: readonly TrainingSkillKey[];
  };
  expectedOutcome: 'REVIEWABLE_SUPPORT_SKILL_DRAFT';
  expiresAt: Date;
}

export interface DefineTrainingMissionHelpProblemV1Input extends Omit<
  TrainingMissionHelpProblemV1,
  'contractVersion' | 'expectedOutcome' | 'expiresAt'
> {
  enrollmentEndsAt: Date | null;
}

export interface TrainingSkillDraftFeasibilityCheckV1 {
  status: TrainingSkillFactoryCheckStatus;
  reasonCode: string;
  confirmedRevision: string;
  checkedAt: Date;
}

export interface TrainingSkillDraftFeasibilityV1 {
  contractVersion: typeof AI_TRAINING_SKILL_FACTORY_V1;
  checks: Record<TrainingSkillFactoryFeasibilityAxis, TrainingSkillDraftFeasibilityCheckV1>;
  externalAiCostYen: 0;
  automaticDeliveryEnabled: false;
  outcome: 'READY_FOR_DRAFT' | 'REVIEW_REQUIRED' | 'BLOCKED';
}

export interface TrainingMissionSupportSkillDraftV1 {
  contractVersion: typeof AI_TRAINING_SKILL_FACTORY_V1;
  skillDraftId: string;
  revision: number;
  sourceProblemId: string;
  sourceProblemRevision: number;
  scopeFingerprint: string;
  missionDefinitionKey: TrainingActionKey;
  learningObjectiveKey: string;
  purpose: 'REDUCE_NEXT_STEP_WITHOUT_CHANGING_LEARNING_OBJECTIVE';
  requiredInputKeys: readonly string[];
  prohibitedInputClasses: readonly string[];
  steps: readonly string[];
  expectedOutput: string;
  validationPolicyVersion: typeof AI_TRAINING_SKILL_FACTORY_VALIDATION_V1;
  status: 'DRAFT' | 'VALIDATED' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: Date;
}

export interface TrainingSupportDraftArtifactV1 {
  contractVersion: typeof AI_TRAINING_SKILL_FACTORY_V1;
  artifactType: 'TRAINING_SUPPORT_SKILL_DRAFT';
  artifactId: string;
  revision: number;
  sourceProblemId: string;
  sourceProblemRevision: number;
  skillDraftId: string;
  skillDraftRevision: number;
  scopeFingerprint: string;
  programTemplateVersionId: string;
  missionDefinitionKey: TrainingActionKey;
  learningObjectiveKey: string;
  successCriteriaKeys: readonly string[];
  barrierReasonCode: TrainingBarrierReason | null;
  steps: readonly string[];
  expectedOutput: string;
  validationPolicyVersion: typeof AI_TRAINING_SKILL_FACTORY_VALIDATION_V1;
  createdAt: Date;
  expiresAt: Date;
}

export const TRAINING_SUPPORT_DRAFT_VALIDATION_REASONS = [
  'PROBLEM_NOT_APPROVED',
  'PROBLEM_EXPIRED',
  'FEASIBILITY_NOT_READY',
  'PROBLEM_REVISION_MISMATCH',
  'MISSION_MISMATCH',
  'LEARNING_OBJECTIVE_CHANGED',
  'DRAFT_EXPIRED',
  'DRAFT_NOT_USABLE',
  'ARTIFACT_EXPIRED',
  'ARTIFACT_REFERENCE_MISMATCH',
  'ARTIFACT_CONTENT_MISMATCH',
  'ARTIFACT_TOO_LARGE',
] as const;
export type TrainingSupportDraftValidationReason =
  (typeof TRAINING_SUPPORT_DRAFT_VALIDATION_REASONS)[number];

export interface TrainingSupportDraftValidationReceiptV1 {
  contractVersion: typeof AI_TRAINING_SKILL_FACTORY_VALIDATION_V1;
  status: 'VALID' | 'INVALID';
  reasonCodes: readonly TrainingSupportDraftValidationReason[];
  problemId: string;
  problemRevision: number;
  skillDraftId: string;
  skillDraftRevision: number;
  artifactId: string;
  artifactRevision: number;
  checkedAt: Date;
}

const forbiddenKeys = new Set([
  'answer',
  'answerText',
  'freeText',
  'photo',
  'photos',
  'conversation',
  'memory',
  'token',
  'secret',
  'providerRawResponse',
  'userId',
  'bunshinId',
]);

const portableForbiddenKeys = new Set([
  'workspaceId',
  'serviceId',
  'programEnrollmentId',
  'missionAssignmentId',
  'actionEventId',
]);

const requiredText = (value: string, field: string, max = 160) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`invalid ${field}`);
  return normalized;
};

const positiveRevision = (value: number, field: string) => {
  if (!Number.isInteger(value) || value < 1) throw new Error(`invalid ${field}`);
};

const validDate = (value: Date, field: string) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw new Error(`invalid ${field}`);
};

const assertNoForbiddenKeys = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenKeys);
    return;
  }
  if (typeof value !== 'object' || value === null || value instanceof Date) return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) throw new Error(`forbidden field: ${key}`);
    assertNoForbiddenKeys(child);
  }
};

const assertNoPortableScopeIds = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(assertNoPortableScopeIds);
    return;
  }
  if (typeof value !== 'object' || value === null || value instanceof Date) return;
  for (const [key, child] of Object.entries(value)) {
    if (portableForbiddenKeys.has(key)) throw new Error(`forbidden portable field: ${key}`);
    assertNoPortableScopeIds(child);
  }
};

const sameScope = (left: TrainingMissionHelpScopeV1, right: TrainingMissionHelpScopeV1) =>
  left.workspaceId === right.workspaceId &&
  left.serviceId === right.serviceId &&
  left.programEnrollmentId === right.programEnrollmentId &&
  left.missionAssignmentId === right.missionAssignmentId;

const validateScope = (scope: TrainingMissionHelpScopeV1, field: string) => {
  requiredText(scope.workspaceId, `${field}.workspaceId`);
  requiredText(scope.serviceId, `${field}.serviceId`);
  requiredText(scope.programEnrollmentId, `${field}.programEnrollmentId`);
  requiredText(scope.missionAssignmentId, `${field}.missionAssignmentId`);
};

const validateUniqueKeys = (values: readonly string[], field: string, max: number) => {
  if (values.length > max || new Set(values).size !== values.length)
    throw new Error(`invalid ${field}`);
  values.forEach((value) => requiredText(value, field, 80));
};

export function trainingSkillFactoryExpiry(occurredAt: Date, enrollmentEndsAt: Date | null) {
  validDate(occurredAt, 'occurredAt');
  if (enrollmentEndsAt !== null) {
    validDate(enrollmentEndsAt, 'enrollmentEndsAt');
    if (enrollmentEndsAt <= occurredAt) throw new Error('enrollment ended before help request');
  }
  const sevenDaysLater = new Date(
    occurredAt.getTime() + TRAINING_SKILL_FACTORY_PROBLEM_LIFETIME_MS,
  );
  return enrollmentEndsAt !== null && enrollmentEndsAt < sevenDaysLater
    ? new Date(enrollmentEndsAt)
    : sevenDaysLater;
}

export function canApproveTrainingSkillFactory(input: { serviceRole: string; active: boolean }) {
  return (
    input.active &&
    TRAINING_SKILL_FACTORY_APPROVER_ROLES.includes(
      input.serviceRole as TrainingSkillFactoryApproverRole,
    )
  );
}

export function defineTrainingMissionHelpProblemV1(
  input: DefineTrainingMissionHelpProblemV1Input,
): TrainingMissionHelpProblemV1 {
  assertNoForbiddenKeys(input);
  positiveRevision(input.revision, 'revision');
  if (!problemStatuses.includes(input.status)) throw new Error('invalid problem status');
  requiredText(input.problemId, 'problemId');
  validateScope(input.scope, 'scope');
  validateScope(input.source, 'source');
  if (!sameScope(input.scope, input.source)) throw new Error('problem source scope mismatch');
  if (input.source.eventType !== 'HELP_REQUESTED') throw new Error('unsupported problem event');
  if (input.source.moduleKey !== AI_TRAINING_SKILL_FACTORY_MODULE_KEY)
    throw new Error('unsupported problem module');
  if (input.source.actionEventSchemaVersion !== 1)
    throw new Error('unsupported action event schema');
  requiredText(input.source.actionEventId, 'source.actionEventId');
  validDate(input.source.occurredAt, 'source.occurredAt');
  requiredText(input.mission.programTemplateVersionId, 'mission.programTemplateVersionId');
  requiredText(input.mission.missionDefinitionKey, 'mission.missionDefinitionKey', 80);
  if (getAiTrainingMissionQuality(input.mission.missionDefinitionKey) === null)
    throw new Error('unknown missionDefinitionKey');
  requiredText(input.mission.missionRuleVersion, 'mission.missionRuleVersion', 80);
  requiredText(input.contextProjection.learningObjectiveKey, 'learningObjectiveKey', 80);
  validateUniqueKeys(
    input.contextProjection.relevantSuccessCriteriaKeys,
    'relevantSuccessCriteriaKeys',
    10,
  );
  validateUniqueKeys(input.contextProjection.evaluatedSkillKeys, 'evaluatedSkillKeys', 6);
  if (input.contextProjection.evaluatedSkillKeys.some((key) => !TRAINING_SKILL_KEYS.includes(key)))
    throw new Error('invalid evaluatedSkillKeys');
  if (
    input.contextProjection.barrierReasonCode !== null &&
    !isTrainingBarrierReason(input.contextProjection.barrierReasonCode)
  )
    throw new Error('invalid barrierReasonCode');
  const expiresAt = trainingSkillFactoryExpiry(input.source.occurredAt, input.enrollmentEndsAt);
  return {
    contractVersion: AI_TRAINING_SKILL_FACTORY_V1,
    problemId: input.problemId,
    revision: input.revision,
    status: input.status,
    scope: { ...input.scope },
    source: { ...input.source },
    mission: { ...input.mission },
    contextProjection: {
      ...input.contextProjection,
      relevantSuccessCriteriaKeys: [...input.contextProjection.relevantSuccessCriteriaKeys],
      evaluatedSkillKeys: [...input.contextProjection.evaluatedSkillKeys],
    },
    expectedOutcome: 'REVIEWABLE_SUPPORT_SKILL_DRAFT',
    expiresAt,
  };
}

export function evaluateTrainingSkillDraftFeasibilityV1(
  checks: Record<TrainingSkillFactoryFeasibilityAxis, TrainingSkillDraftFeasibilityCheckV1>,
): TrainingSkillDraftFeasibilityV1 {
  assertNoForbiddenKeys(checks);
  const keys = Object.keys(checks);
  if (
    keys.length !== TRAINING_SKILL_FACTORY_FEASIBILITY_AXES.length ||
    keys.some(
      (key) =>
        !TRAINING_SKILL_FACTORY_FEASIBILITY_AXES.includes(
          key as TrainingSkillFactoryFeasibilityAxis,
        ),
    )
  )
    throw new Error('invalid feasibility axes');
  for (const axis of TRAINING_SKILL_FACTORY_FEASIBILITY_AXES) {
    const check = checks[axis];
    if (!['PASSED', 'BLOCKED', 'UNKNOWN'].includes(check.status))
      throw new Error(`invalid feasibility status: ${axis}`);
    requiredText(check.reasonCode, `${axis}.reasonCode`, 80);
    requiredText(check.confirmedRevision, `${axis}.confirmedRevision`, 160);
    validDate(check.checkedAt, `${axis}.checkedAt`);
  }
  const statuses = TRAINING_SKILL_FACTORY_FEASIBILITY_AXES.map((axis) => checks[axis].status);
  return {
    contractVersion: AI_TRAINING_SKILL_FACTORY_V1,
    checks: Object.fromEntries(
      TRAINING_SKILL_FACTORY_FEASIBILITY_AXES.map((axis) => [axis, { ...checks[axis] }]),
    ) as Record<TrainingSkillFactoryFeasibilityAxis, TrainingSkillDraftFeasibilityCheckV1>,
    externalAiCostYen: 0,
    automaticDeliveryEnabled: false,
    outcome: statuses.includes('BLOCKED')
      ? 'BLOCKED'
      : statuses.includes('UNKNOWN')
        ? 'REVIEW_REQUIRED'
        : 'READY_FOR_DRAFT',
  };
}

const validateSteps = (steps: readonly string[]) => {
  if (steps.length < 1 || steps.length > TRAINING_SKILL_FACTORY_MAX_STEPS)
    throw new Error('invalid steps');
  steps.forEach((step) => requiredText(step, 'step', TRAINING_SKILL_FACTORY_MAX_STEP_CHARS));
};

export function defineTrainingMissionSupportSkillDraftV1(
  input: Omit<
    TrainingMissionSupportSkillDraftV1,
    'contractVersion' | 'purpose' | 'validationPolicyVersion'
  >,
): TrainingMissionSupportSkillDraftV1 {
  assertNoForbiddenKeys(input);
  assertNoPortableScopeIds(input);
  positiveRevision(input.revision, 'skillDraft.revision');
  positiveRevision(input.sourceProblemRevision, 'skillDraft.sourceProblemRevision');
  if (!skillDraftStatuses.includes(input.status)) throw new Error('invalid skillDraft status');
  requiredText(input.skillDraftId, 'skillDraftId');
  requiredText(input.sourceProblemId, 'sourceProblemId');
  requiredText(input.scopeFingerprint, 'scopeFingerprint', 160);
  requiredText(input.missionDefinitionKey, 'missionDefinitionKey', 80);
  requiredText(input.learningObjectiveKey, 'learningObjectiveKey', 80);
  validateUniqueKeys(input.requiredInputKeys, 'requiredInputKeys', 20);
  validateUniqueKeys(input.prohibitedInputClasses, 'prohibitedInputClasses', 20);
  validateSteps(input.steps);
  requiredText(input.expectedOutput, 'expectedOutput', 500);
  validDate(input.expiresAt, 'skillDraft.expiresAt');
  return {
    contractVersion: AI_TRAINING_SKILL_FACTORY_V1,
    skillDraftId: input.skillDraftId,
    revision: input.revision,
    sourceProblemId: input.sourceProblemId,
    sourceProblemRevision: input.sourceProblemRevision,
    scopeFingerprint: input.scopeFingerprint,
    missionDefinitionKey: input.missionDefinitionKey,
    learningObjectiveKey: input.learningObjectiveKey,
    purpose: 'REDUCE_NEXT_STEP_WITHOUT_CHANGING_LEARNING_OBJECTIVE',
    requiredInputKeys: [...input.requiredInputKeys],
    prohibitedInputClasses: [...input.prohibitedInputClasses],
    steps: [...input.steps],
    expectedOutput: input.expectedOutput,
    validationPolicyVersion: AI_TRAINING_SKILL_FACTORY_VALIDATION_V1,
    status: input.status,
    expiresAt: new Date(input.expiresAt),
  };
}

export function defineTrainingSupportDraftArtifactV1(
  input: Omit<
    TrainingSupportDraftArtifactV1,
    'contractVersion' | 'artifactType' | 'validationPolicyVersion'
  >,
): TrainingSupportDraftArtifactV1 {
  assertNoForbiddenKeys(input);
  assertNoPortableScopeIds(input);
  positiveRevision(input.revision, 'artifact.revision');
  positiveRevision(input.sourceProblemRevision, 'artifact.sourceProblemRevision');
  positiveRevision(input.skillDraftRevision, 'artifact.skillDraftRevision');
  requiredText(input.artifactId, 'artifactId');
  requiredText(input.sourceProblemId, 'sourceProblemId');
  requiredText(input.skillDraftId, 'skillDraftId');
  requiredText(input.scopeFingerprint, 'scopeFingerprint', 160);
  requiredText(input.programTemplateVersionId, 'programTemplateVersionId');
  requiredText(input.missionDefinitionKey, 'missionDefinitionKey', 80);
  requiredText(input.learningObjectiveKey, 'learningObjectiveKey', 80);
  validateUniqueKeys(input.successCriteriaKeys, 'successCriteriaKeys', 10);
  if (input.barrierReasonCode !== null && !isTrainingBarrierReason(input.barrierReasonCode))
    throw new Error('invalid barrierReasonCode');
  validateSteps(input.steps);
  requiredText(input.expectedOutput, 'expectedOutput', 500);
  validDate(input.createdAt, 'artifact.createdAt');
  validDate(input.expiresAt, 'artifact.expiresAt');
  if (input.expiresAt <= input.createdAt) throw new Error('artifact already expired');
  const artifact: TrainingSupportDraftArtifactV1 = {
    contractVersion: AI_TRAINING_SKILL_FACTORY_V1,
    artifactType: 'TRAINING_SUPPORT_SKILL_DRAFT',
    artifactId: input.artifactId,
    revision: input.revision,
    sourceProblemId: input.sourceProblemId,
    sourceProblemRevision: input.sourceProblemRevision,
    skillDraftId: input.skillDraftId,
    skillDraftRevision: input.skillDraftRevision,
    scopeFingerprint: input.scopeFingerprint,
    programTemplateVersionId: input.programTemplateVersionId,
    missionDefinitionKey: input.missionDefinitionKey,
    learningObjectiveKey: input.learningObjectiveKey,
    successCriteriaKeys: [...input.successCriteriaKeys],
    barrierReasonCode: input.barrierReasonCode,
    steps: [...input.steps],
    expectedOutput: input.expectedOutput,
    validationPolicyVersion: AI_TRAINING_SKILL_FACTORY_VALIDATION_V1,
    createdAt: new Date(input.createdAt),
    expiresAt: new Date(input.expiresAt),
  };
  if (
    new TextEncoder().encode(JSON.stringify(artifact)).length >
    TRAINING_SKILL_FACTORY_MAX_ARTIFACT_BYTES
  )
    throw new Error('artifact exceeds byte limit');
  return artifact;
}

export function validateTrainingSupportDraftV1(input: {
  problem: TrainingMissionHelpProblemV1;
  feasibility: TrainingSkillDraftFeasibilityV1;
  skillDraft: TrainingMissionSupportSkillDraftV1;
  artifact: TrainingSupportDraftArtifactV1;
  now: Date;
}): TrainingSupportDraftValidationReceiptV1 {
  validDate(input.now, 'now');
  const reasons = new Set<TrainingSupportDraftValidationReason>();
  if (input.problem.status !== 'APPROVED') reasons.add('PROBLEM_NOT_APPROVED');
  if (input.problem.expiresAt <= input.now) reasons.add('PROBLEM_EXPIRED');
  if (input.feasibility.outcome !== 'READY_FOR_DRAFT') reasons.add('FEASIBILITY_NOT_READY');
  if (
    input.skillDraft.sourceProblemId !== input.problem.problemId ||
    input.skillDraft.sourceProblemRevision !== input.problem.revision
  )
    reasons.add('PROBLEM_REVISION_MISMATCH');
  if (
    input.skillDraft.missionDefinitionKey !== input.problem.mission.missionDefinitionKey ||
    input.artifact.missionDefinitionKey !== input.problem.mission.missionDefinitionKey
  )
    reasons.add('MISSION_MISMATCH');
  if (
    input.skillDraft.learningObjectiveKey !==
      input.problem.contextProjection.learningObjectiveKey ||
    input.artifact.learningObjectiveKey !== input.problem.contextProjection.learningObjectiveKey
  )
    reasons.add('LEARNING_OBJECTIVE_CHANGED');
  if (input.skillDraft.expiresAt <= input.now) reasons.add('DRAFT_EXPIRED');
  if (['REJECTED', 'REVOKED', 'EXPIRED'].includes(input.skillDraft.status))
    reasons.add('DRAFT_NOT_USABLE');
  if (input.artifact.expiresAt <= input.now) reasons.add('ARTIFACT_EXPIRED');
  if (
    input.artifact.sourceProblemId !== input.problem.problemId ||
    input.artifact.sourceProblemRevision !== input.problem.revision ||
    input.artifact.skillDraftId !== input.skillDraft.skillDraftId ||
    input.artifact.skillDraftRevision !== input.skillDraft.revision ||
    input.artifact.scopeFingerprint !== input.skillDraft.scopeFingerprint ||
    input.artifact.programTemplateVersionId !== input.problem.mission.programTemplateVersionId ||
    input.skillDraft.expiresAt > input.problem.expiresAt ||
    input.artifact.expiresAt > input.problem.expiresAt ||
    input.artifact.expiresAt > input.skillDraft.expiresAt
  )
    reasons.add('ARTIFACT_REFERENCE_MISMATCH');
  if (
    input.artifact.expectedOutput !== input.skillDraft.expectedOutput ||
    input.artifact.steps.length !== input.skillDraft.steps.length ||
    input.artifact.steps.some((step, index) => step !== input.skillDraft.steps[index]) ||
    input.artifact.successCriteriaKeys.length !==
      input.problem.contextProjection.relevantSuccessCriteriaKeys.length ||
    input.artifact.successCriteriaKeys.some(
      (key, index) => key !== input.problem.contextProjection.relevantSuccessCriteriaKeys[index],
    ) ||
    input.artifact.barrierReasonCode !== input.problem.contextProjection.barrierReasonCode
  )
    reasons.add('ARTIFACT_CONTENT_MISMATCH');
  if (
    new TextEncoder().encode(JSON.stringify(input.artifact)).length >
    TRAINING_SKILL_FACTORY_MAX_ARTIFACT_BYTES
  )
    reasons.add('ARTIFACT_TOO_LARGE');
  return {
    contractVersion: AI_TRAINING_SKILL_FACTORY_VALIDATION_V1,
    status: reasons.size === 0 ? 'VALID' : 'INVALID',
    reasonCodes: [...reasons],
    problemId: input.problem.problemId,
    problemRevision: input.problem.revision,
    skillDraftId: input.skillDraft.skillDraftId,
    skillDraftRevision: input.skillDraft.revision,
    artifactId: input.artifact.artifactId,
    artifactRevision: input.artifact.revision,
    checkedAt: new Date(input.now),
  };
}
