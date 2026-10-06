import { ApplicationError } from '@bunshin/shared';
import { defineLearningScopeResult, type LearningScopeResult } from './learning-scope';

export const PERSONAL_LEARNING_PROFILE_GOAL_CONTRACT_VERSION = 'PERSONAL_LEARNING_PROFILE_GOAL_V1';

/** Caller must resolve membership/ownership before using these read-only contracts. */
export interface LearnerScope {
  readonly workspaceId: string;
  readonly groupId: string;
  readonly programEnrollmentId: string;
  readonly groupMembershipId: string;
  readonly userId: string;
}
export interface LearningGoalSemanticReference {
  readonly packageKey: string;
  readonly goalKey: string;
  readonly version: string;
}
/** Mirrors existing ProgramMemberGoalStatus; not an additional lifecycle. */
export type ExistingProgramMemberGoalStatus = 'ACTIVE' | 'ACHIEVED' | 'PAUSED' | 'CANCELLED';
export interface ExistingProgramMemberGoalSource {
  readonly id: string;
  readonly workspaceId: string;
  readonly groupId: string;
  readonly programEnrollmentId: string;
  readonly groupMembershipId: string;
  readonly goalDefinitionId: string | null;
  readonly status: ExistingProgramMemberGoalStatus;
}
export interface ExistingLearningGoalReference {
  readonly kind: 'EXISTING_GOAL_REFERENCE';
  readonly scope: LearnerScope;
  readonly programMemberGoalId: string;
  readonly goalDefinitionId: string | null;
  readonly status: ExistingProgramMemberGoalStatus;
}
export interface LearningGoalCandidate {
  readonly kind: 'CANDIDATE';
  readonly scope: LearnerScope;
  readonly semanticRef: LearningGoalSemanticReference;
  readonly scopeDecision: LearningScopeResult;
}
export interface ConfirmedLearningGoalReference {
  readonly kind: 'CONFIRMED_GOAL_REFERENCE';
  readonly reference: ExistingLearningGoalReference;
  readonly semanticRef: LearningGoalSemanticReference;
  readonly confirmedByUserId: string;
}
export interface LearnerProfileProjection {
  readonly contractVersion: typeof PERSONAL_LEARNING_PROFILE_GOAL_CONTRACT_VERSION;
  readonly scope: LearnerScope;
  readonly preferredDailyMinutes: number | null;
  /** Reference only. Existing ACTIVE does not prove learner confirmation. */
  readonly currentPrimaryGoalRef: ExistingLearningGoalReference | null;
}

function invalid(): never {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid learning profile or goal contract');
}
const validId = (value: string) =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 200;
export function defineLearnerScope(input: LearnerScope): LearnerScope {
  const scope = {
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    programEnrollmentId: input.programEnrollmentId,
    groupMembershipId: input.groupMembershipId,
    userId: input.userId,
  };
  if (!Object.values(scope).every(validId)) invalid();
  return Object.freeze(scope);
}
function sameScope(left: LearnerScope, right: LearnerScope) {
  return (
    left.workspaceId === right.workspaceId &&
    left.groupId === right.groupId &&
    left.programEnrollmentId === right.programEnrollmentId &&
    left.groupMembershipId === right.groupMembershipId &&
    left.userId === right.userId
  );
}
function semanticReference(input: LearningGoalSemanticReference): LearningGoalSemanticReference {
  if (
    ![input.packageKey, input.goalKey, input.version].every((value) =>
      /^[A-Z][A-Z0-9_]{0,79}$/.test(value),
    )
  )
    invalid();
  return Object.freeze({
    packageKey: input.packageKey,
    goalKey: input.goalKey,
    version: input.version,
  });
}

export function projectProgramMemberGoalReference(
  scopeInput: LearnerScope,
  source: ExistingProgramMemberGoalSource,
): ExistingLearningGoalReference {
  const scope = defineLearnerScope(scopeInput);
  if (
    !validId(source.id) ||
    (source.goalDefinitionId !== null && !validId(source.goalDefinitionId)) ||
    !['ACTIVE', 'ACHIEVED', 'PAUSED', 'CANCELLED'].includes(source.status) ||
    source.workspaceId !== scope.workspaceId ||
    source.groupId !== scope.groupId ||
    source.programEnrollmentId !== scope.programEnrollmentId ||
    source.groupMembershipId !== scope.groupMembershipId
  )
    invalid();
  return Object.freeze({
    kind: 'EXISTING_GOAL_REFERENCE',
    scope,
    programMemberGoalId: source.id,
    goalDefinitionId: source.goalDefinitionId,
    status: source.status,
  });
}

/** Validates a supplied candidate only; no candidate generation or Goal creation. */
export function defineLearningGoalCandidate(input: LearningGoalCandidate): LearningGoalCandidate {
  const scopeDecision = defineLearningScopeResult(input.scopeDecision);
  if (
    input.kind !== 'CANDIDATE' ||
    scopeDecision.classification !== 'LEARNING' ||
    scopeDecision.requiresConfirmation ||
    scopeDecision.detectedClassifications.length !== 1 ||
    scopeDecision.suggestedLearningIntent !== null
  )
    invalid();
  return Object.freeze({
    kind: 'CANDIDATE',
    scope: defineLearnerScope(input.scope),
    semanticRef: semanticReference(input.semanticRef),
    scopeDecision,
  });
}

/** Validates trusted evidence supplied by a future caller; never approves or saves a Goal. */
export function defineConfirmedLearningGoalReference(input: {
  readonly candidate: LearningGoalCandidate;
  readonly reference: ExistingLearningGoalReference;
  readonly confirmation: {
    readonly state: 'LEARNER_CONFIRMED';
    readonly programMemberGoalId: string;
    readonly confirmedByUserId: string;
    readonly semanticRef: LearningGoalSemanticReference;
  };
}): ConfirmedLearningGoalReference {
  const candidate = defineLearningGoalCandidate(input.candidate);
  const ref = input.reference;
  if (ref.kind !== 'EXISTING_GOAL_REFERENCE') invalid();
  const reference = projectProgramMemberGoalReference(ref.scope, {
    ...ref.scope,
    id: ref.programMemberGoalId,
    goalDefinitionId: ref.goalDefinitionId,
    status: ref.status,
  });
  const confirmedSemantic = semanticReference(input.confirmation.semanticRef);
  if (
    input.confirmation.state !== 'LEARNER_CONFIRMED' ||
    !sameScope(candidate.scope, reference.scope) ||
    input.confirmation.confirmedByUserId !== candidate.scope.userId ||
    input.confirmation.programMemberGoalId !== reference.programMemberGoalId ||
    candidate.semanticRef.packageKey !== confirmedSemantic.packageKey ||
    candidate.semanticRef.goalKey !== confirmedSemantic.goalKey ||
    candidate.semanticRef.version !== confirmedSemantic.version
  )
    invalid();
  return Object.freeze({
    kind: 'CONFIRMED_GOAL_REFERENCE',
    reference,
    semanticRef: confirmedSemantic,
    confirmedByUserId: input.confirmation.confirmedByUserId,
  });
}

/** Refuses multiple current Goals rather than silently choosing or cancelling one. */
export function selectPrimaryLearningGoalReference(
  scope: LearnerScope,
  refs: readonly ExistingLearningGoalReference[],
): ExistingLearningGoalReference | null {
  defineLearnerScope(scope);
  const normalized = refs.map((ref) => {
    if (ref.kind !== 'EXISTING_GOAL_REFERENCE' || !sameScope(scope, ref.scope)) invalid();
    return projectProgramMemberGoalReference(scope, {
      ...ref.scope,
      id: ref.programMemberGoalId,
      goalDefinitionId: ref.goalDefinitionId,
      status: ref.status,
    });
  });
  if (new Set(normalized.map((ref) => ref.programMemberGoalId)).size !== normalized.length)
    invalid();
  const active = normalized.filter((ref) => ref.status === 'ACTIVE');
  if (active.length > 1) invalid();
  return active[0] ?? null;
}

export function defineLearnerProfileProjection(
  input: Omit<LearnerProfileProjection, 'contractVersion'>,
): LearnerProfileProjection {
  const scope = defineLearnerScope(input.scope);
  if (
    input.preferredDailyMinutes !== null &&
    (!Number.isInteger(input.preferredDailyMinutes) ||
      input.preferredDailyMinutes < 1 ||
      input.preferredDailyMinutes > 120)
  )
    invalid();
  return Object.freeze({
    contractVersion: PERSONAL_LEARNING_PROFILE_GOAL_CONTRACT_VERSION,
    scope,
    preferredDailyMinutes: input.preferredDailyMinutes,
    currentPrimaryGoalRef: selectPrimaryLearningGoalReference(
      scope,
      input.currentPrimaryGoalRef ? [input.currentPrimaryGoalRef] : [],
    ),
  });
}
