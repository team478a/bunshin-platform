import { ApplicationError } from '@bunshin/shared';
import {
  defineLearnerScope,
  projectProgramMemberGoalReference,
  type LearnerScope,
  type ConfirmedLearningGoalReference,
} from './learning-profile-goal';

export const PERSONAL_LEARNING_PLAN_CONTRACT_VERSION = 'PERSONAL_LEARNING_PLAN_V1';
export const LEARNING_PLAN_REVISION_REASONS = [
  'INITIAL',
  'GOAL_CHANGED',
  'SKILL_ALREADY_MASTERED',
  'PREREQUISITE_REQUIRED',
  'REVIEW_REQUIRED',
  'LEARNER_REQUEST',
] as const;
export type LearningPlanRevisionReason = (typeof LEARNING_PLAN_REVISION_REASONS)[number];
export interface LearningDefinitionReference {
  readonly packageKey: string;
  readonly definitionKey: string;
  readonly version: string;
}
export interface LearningPlanRevisionReference {
  readonly planId: string;
  readonly revision: number;
}
export interface LearningPlanStep {
  readonly definition: LearningDefinitionReference;
  readonly prerequisites: readonly LearningDefinitionReference[];
  readonly selectionReason: string;
}
export interface LearningPlanConfirmation extends LearningPlanRevisionReference {
  readonly confirmedByUserId: string;
}
interface LearningPlanBase {
  readonly contractVersion: typeof PERSONAL_LEARNING_PLAN_CONTRACT_VERSION;
  readonly ruleVersion: string;
  readonly planId: string;
  readonly revision: number;
  readonly previousRevision: LearningPlanRevisionReference | null;
  readonly revisionReason: LearningPlanRevisionReason;
  readonly scope: LearnerScope;
  readonly goal: ConfirmedLearningGoalReference;
  /** List order is path order; no generated teaching content. */
  readonly steps: readonly LearningPlanStep[];
}
export type PersonalLearningPlan = LearningPlanBase &
  (
    | { readonly status: 'DRAFT'; readonly confirmation: null }
    | {
        readonly status: 'CONFIRMED' | 'SUPERSEDED' | 'COMPLETED';
        readonly confirmation: LearningPlanConfirmation;
      }
  );

function invalid(): never {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid personal learning plan contract');
}
function onlyKeys(value: object, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid();
}
const code = (value: string) => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value);
const identity = (value: string) =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 200;
const revisionNumber = (value: number) => Number.isSafeInteger(value) && value > 0;
function sameScope(left: LearnerScope, right: LearnerScope) {
  return (
    left.workspaceId === right.workspaceId &&
    left.groupId === right.groupId &&
    left.programEnrollmentId === right.programEnrollmentId &&
    left.groupMembershipId === right.groupMembershipId &&
    left.userId === right.userId
  );
}
export function defineLearningDefinitionReference(
  input: LearningDefinitionReference,
): LearningDefinitionReference {
  onlyKeys(input, ['packageKey', 'definitionKey', 'version']);
  if (![input.packageKey, input.definitionKey, input.version].every(code)) invalid();
  return Object.freeze({
    packageKey: input.packageKey,
    definitionKey: input.definitionKey,
    version: input.version,
  });
}
const refKey = (ref: LearningDefinitionReference) =>
  `${ref.packageKey}:${ref.definitionKey}:${ref.version}`;

/** Validates caller-provided receipts. Not authorization, persistence, or an execution gate. */
export function definePersonalLearningPlan(input: PersonalLearningPlan): PersonalLearningPlan {
  onlyKeys(input, [
    'contractVersion',
    'ruleVersion',
    'planId',
    'revision',
    'previousRevision',
    'revisionReason',
    'scope',
    'goal',
    'steps',
    'status',
    'confirmation',
  ]);
  if (
    input.contractVersion !== PERSONAL_LEARNING_PLAN_CONTRACT_VERSION ||
    !code(input.ruleVersion) ||
    !identity(input.planId) ||
    !revisionNumber(input.revision) ||
    !LEARNING_PLAN_REVISION_REASONS.includes(input.revisionReason)
  )
    invalid();
  const scope = defineLearnerScope(input.scope);
  const goalInput = input.goal;
  if (
    goalInput.kind !== 'CONFIRMED_GOAL_REFERENCE' ||
    goalInput.reference.kind !== 'EXISTING_GOAL_REFERENCE' ||
    goalInput.confirmedByUserId !== scope.userId ||
    !sameScope(scope, goalInput.reference.scope)
  )
    invalid();
  const reference = projectProgramMemberGoalReference(scope, {
    ...scope,
    id: goalInput.reference.programMemberGoalId,
    goalDefinitionId: goalInput.reference.goalDefinitionId,
    status: goalInput.reference.status,
  });
  if (
    ![
      goalInput.semanticRef.packageKey,
      goalInput.semanticRef.goalKey,
      goalInput.semanticRef.version,
    ].every(code)
  )
    invalid();
  const goal: ConfirmedLearningGoalReference = Object.freeze({
    kind: 'CONFIRMED_GOAL_REFERENCE',
    reference,
    confirmedByUserId: goalInput.confirmedByUserId,
    semanticRef: Object.freeze({
      packageKey: goalInput.semanticRef.packageKey,
      goalKey: goalInput.semanticRef.goalKey,
      version: goalInput.semanticRef.version,
    }),
  });
  if (
    (input.status === 'DRAFT' || input.status === 'CONFIRMED') &&
    goal.reference.status !== 'ACTIVE'
  )
    invalid();
  let previousRevision: LearningPlanRevisionReference | null = null;
  if (input.revision === 1) {
    if (input.previousRevision !== null || input.revisionReason !== 'INITIAL') invalid();
  } else {
    const previous = input.previousRevision;
    if (previous === null) invalid();
    onlyKeys(previous, ['planId', 'revision']);
    if (
      previous.planId !== input.planId ||
      previous.revision !== input.revision - 1 ||
      input.revisionReason === 'INITIAL'
    )
      invalid();
    previousRevision = Object.freeze({ planId: previous.planId, revision: previous.revision });
  }
  const inputSteps = input.steps;
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 100) invalid();
  const plannedKeys = new Set(
    inputSteps.map((step) => refKey(defineLearningDefinitionReference(step.definition))),
  );
  const seen = new Set<string>();
  const steps = inputSteps.map((step) => {
    onlyKeys(step, ['definition', 'prerequisites', 'selectionReason']);
    const definition = defineLearningDefinitionReference(step.definition);
    const inputPrerequisites = step.prerequisites;
    if (
      definition.packageKey !== goal.semanticRef.packageKey ||
      !code(step.selectionReason) ||
      seen.has(refKey(definition)) ||
      !Array.isArray(step.prerequisites) ||
      step.prerequisites.length > 100
    )
      invalid();
    const prerequisites: readonly LearningDefinitionReference[] = inputPrerequisites.map(
      defineLearningDefinitionReference,
    );
    // External prerequisites remain references, never evidence of mastery or execution permission.
    if (
      new Set(prerequisites.map(refKey)).size !== prerequisites.length ||
      prerequisites.some(
        (ref) =>
          ref.packageKey !== definition.packageKey ||
          (plannedKeys.has(refKey(ref)) && !seen.has(refKey(ref))),
      )
    )
      invalid();
    seen.add(refKey(definition));
    return Object.freeze({
      definition,
      prerequisites: Object.freeze(prerequisites),
      selectionReason: step.selectionReason,
    });
  });
  const base = {
    contractVersion: PERSONAL_LEARNING_PLAN_CONTRACT_VERSION,
    ruleVersion: input.ruleVersion,
    planId: input.planId,
    revision: input.revision,
    previousRevision,
    revisionReason: input.revisionReason,
    scope,
    goal,
    steps: Object.freeze(steps),
  } as const;
  if (input.status === 'DRAFT') {
    if (input.confirmation !== null) invalid();
    return Object.freeze({ ...base, status: 'DRAFT', confirmation: null });
  }
  if (
    !['CONFIRMED', 'SUPERSEDED', 'COMPLETED'].includes(input.status) ||
    input.confirmation === null
  )
    invalid();
  onlyKeys(input.confirmation, ['planId', 'revision', 'confirmedByUserId']);
  if (
    input.confirmation.planId !== input.planId ||
    input.confirmation.revision !== input.revision ||
    input.confirmation.confirmedByUserId !== scope.userId
  )
    invalid();
  return Object.freeze({
    ...base,
    status: input.status,
    confirmation: Object.freeze({
      planId: input.planId,
      revision: input.revision,
      confirmedByUserId: input.confirmation.confirmedByUserId,
    }),
  });
}

/** Validates an immutable successor relationship; does not supersede or persist the prior Plan. */
export function definePersonalLearningPlanRevision(
  previousInput: PersonalLearningPlan,
  nextInput: PersonalLearningPlan,
): PersonalLearningPlan {
  const previous = definePersonalLearningPlan(previousInput);
  const next = definePersonalLearningPlan(nextInput);
  if (
    previous.status === 'SUPERSEDED' ||
    next.status !== 'DRAFT' ||
    !sameScope(previous.scope, next.scope) ||
    next.planId !== previous.planId ||
    next.revision !== previous.revision + 1
  )
    invalid();
  const goalChanged =
    previous.goal.reference.programMemberGoalId !== next.goal.reference.programMemberGoalId ||
    previous.goal.semanticRef.packageKey !== next.goal.semanticRef.packageKey ||
    previous.goal.semanticRef.goalKey !== next.goal.semanticRef.goalKey ||
    previous.goal.semanticRef.version !== next.goal.semanticRef.version;
  if (goalChanged !== (next.revisionReason === 'GOAL_CHANGED')) invalid();
  return next;
}
