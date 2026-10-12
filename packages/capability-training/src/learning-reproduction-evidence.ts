import {
  defineLearnerScope,
  defineLearningDefinitionReference,
  type LearnerScope,
} from '@bunshin/application';
import {
  definePracticeCompletion,
  GUIDED_PRACTICE_RULE_VERSION,
  PRACTICE_SUPPORT_LEVELS,
  effectivePracticeSupport,
  type GuidedPracticeReference,
  type PracticeSupportLevel,
} from './guided-practice';
import { AI_TRAINING_LEARNING_DEFINITION_FIXTURES } from './learning-definition-fixtures';
import { learningDefinitionIdentity } from './learning-router';
import { AI_TRAINING_SKILL_RULE_VERSION } from './skill-evaluation';

export const LEARNING_REPRODUCTION_RULE_VERSION = 'AI_TRAINING_REPRODUCTION_EVIDENCE_V1';
/** Categories only, not new Definitions, Missions or user/business text. */
export const REPRODUCTION_SUBJECT_KEYS = [
  'EMAIL_PRACTICE',
  'REPORT_PRACTICE',
  'INFORMATION_SUMMARY_PRACTICE',
] as const;
type PracticeCompletion = ReturnType<typeof definePracticeCompletion>;

/** Trusted projection: verified means persisted Answer + matching evaluation audit and Skill evidence.
 * This type is NOT an HTTP payload or an authorization proof. */
export interface ReproductionAssessmentEvidence {
  readonly scope: LearnerScope;
  readonly assignmentId: string;
  readonly answerId: string;
  readonly evaluatedAt: string;
  readonly ruleVersion: string;
  readonly verified: boolean;
  readonly result: 'PASS' | 'REVIEW' | 'WAIT' | 'RECOVERY';
}
export interface LearningReproductionAttempt {
  readonly scope: LearnerScope;
  readonly reference: GuidedPracticeReference;
  readonly subjectKey: (typeof REPRODUCTION_SUBJECT_KEYS)[number];
  readonly completedAt: string | null;
  readonly completion: PracticeCompletion | null;
  readonly assessment: ReproductionAssessmentEvidence | null;
}

function invalid(): never {
  throw new Error('invalid learning reproduction evidence');
}
const isArray = (value: unknown): boolean => Array.isArray(value);
function exact(value: object, keys: readonly string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    invalid();
}
function id(value: string) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) invalid();
  return value;
}
function time(value: string) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid();
  return value;
}
function scope(input: LearnerScope) {
  exact(input, ['workspaceId', 'groupId', 'programEnrollmentId', 'groupMembershipId', 'userId']);
  return defineLearnerScope(input);
}
function sameScope(a: LearnerScope, b: LearnerScope) {
  return (
    a.workspaceId === b.workspaceId &&
    a.groupId === b.groupId &&
    a.programEnrollmentId === b.programEnrollmentId &&
    a.groupMembershipId === b.groupMembershipId &&
    a.userId === b.userId
  );
}
function compareSupport(baseline: PracticeSupportLevel, followUp: PracticeSupportLevel) {
  const difference =
    PRACTICE_SUPPORT_LEVELS.indexOf(followUp) - PRACTICE_SUPPORT_LEVELS.indexOf(baseline);
  return difference > 0
    ? ('LESS_SUPPORT_RECORDED' as const)
    : difference < 0
      ? ('MORE_SUPPORT_RECORDED' as const)
      : ('SAME_SUPPORT_RECORDED' as const);
}
function attempt(input: LearningReproductionAttempt): LearningReproductionAttempt {
  exact(input, ['scope', 'reference', 'subjectKey', 'completedAt', 'completion', 'assessment']);
  const learnerScope = scope(input.scope);
  const ref = input.reference;
  exact(ref, ['goalId', 'planId', 'planRevision', 'definition', 'assignmentId']);
  exact(ref.definition, ['packageKey', 'definitionKey', 'version']);
  const definition = defineLearningDefinitionReference(ref.definition);
  if (
    !Number.isSafeInteger(ref.planRevision) ||
    ref.planRevision < 1 ||
    !REPRODUCTION_SUBJECT_KEYS.includes(input.subjectKey)
  )
    invalid();
  let completion: PracticeCompletion | null = null;
  if (input.completion !== null) {
    const value = input.completion;
    exact(value, [
      'ruleVersion',
      'operator',
      'learnerConfirmation',
      'evidenceBasis',
      'supportLevel',
      'capabilityEvidence',
      'outcomeQuality',
      'capabilityLevel',
    ]);
    if (
      value.ruleVersion !== GUIDED_PRACTICE_RULE_VERSION ||
      value.operator !== 'LEARNER' ||
      value.learnerConfirmation !== 'CONFIRMED_USEFUL_COMPLETION' ||
      value.evidenceBasis !== 'LEARNER_REPORT_AND_PROMPT_ASSESSMENT' ||
      value.outcomeQuality !== 'UNKNOWN' ||
      value.capabilityLevel !== 'UNKNOWN' ||
      !isArray(value.capabilityEvidence) ||
      value.capabilityEvidence.length < 3 ||
      value.capabilityEvidence.length > 4 ||
      value.capabilityEvidence[0] !== 'GUIDED_COMPLETION' ||
      new Set(value.capabilityEvidence).size !== value.capabilityEvidence.length
    )
      invalid();
    completion = definePracticeCompletion({
      command: { action: 'COMPLETE', learnerConfirmedCompletion: true, usefulResult: true },
      started: true,
      assessmentVerified: true,
      interactions: value.capabilityEvidence.slice(1).filter((key) => key !== 'GUIDED_COMPLETION'),
      supportLevel: effectivePracticeSupport(value.supportLevel, false, false),
    });
  }
  let assessment: ReproductionAssessmentEvidence | null = null;
  if (input.assessment !== null) {
    const value = input.assessment;
    exact(value, [
      'scope',
      'assignmentId',
      'answerId',
      'evaluatedAt',
      'ruleVersion',
      'verified',
      'result',
    ]);
    const assessmentScope = scope(value.scope);
    if (
      !sameScope(learnerScope, assessmentScope) ||
      value.assignmentId !== ref.assignmentId ||
      typeof value.verified !== 'boolean' ||
      !['PASS', 'REVIEW', 'WAIT', 'RECOVERY'].includes(value.result) ||
      typeof value.ruleVersion !== 'string' ||
      !/^[A-Z][A-Z0-9_]{0,79}$/.test(value.ruleVersion)
    )
      invalid();
    assessment = Object.freeze({
      scope: assessmentScope,
      assignmentId: id(value.assignmentId),
      answerId: id(value.answerId),
      evaluatedAt: time(value.evaluatedAt),
      ruleVersion: value.ruleVersion,
      verified: value.verified,
      result: value.result,
    });
  }
  return Object.freeze({
    scope: learnerScope,
    reference: Object.freeze({
      goalId: id(ref.goalId),
      planId: id(ref.planId),
      planRevision: ref.planRevision,
      definition,
      assignmentId: id(ref.assignmentId),
    }),
    subjectKey: input.subjectKey,
    completedAt: input.completedAt === null ? null : time(input.completedAt),
    completion,
    assessment,
  });
}

/** Compares supplied evidence only. No save, approval, authorization, Level or Router transition. */
export function compareLearningReproduction(input: {
  readonly baseline: LearningReproductionAttempt;
  readonly followUp: LearningReproductionAttempt;
}) {
  exact(input, ['baseline', 'followUp']);
  const baseline = attempt(input.baseline);
  const followUp = attempt(input.followUp);
  if (!sameScope(baseline.scope, followUp.scope)) invalid();
  const result = (status: 'EVIDENCE_AVAILABLE' | 'UNKNOWN', reason: string) =>
    Object.freeze({
      ruleVersion: LEARNING_REPRODUCTION_RULE_VERSION,
      status,
      reason,
      baseline,
      followUp,
      evidenceBasis: 'LEARNER_REPORT_AND_PROMPT_ASSESSMENT' as const,
      supportComparison:
        status === 'EVIDENCE_AVAILABLE' && baseline.completion && followUp.completion
          ? compareSupport(baseline.completion.supportLevel, followUp.completion.supportLevel)
          : ('UNKNOWN' as const),
      externalInteractionVerified: 'UNKNOWN' as const,
      outcomeQuality: 'UNKNOWN' as const,
      capabilityLevel: 'UNKNOWN' as const,
      transferVerified: 'UNKNOWN' as const,
    });
  const a = baseline.reference;
  const b = followUp.reference;
  if (
    a.goalId !== b.goalId ||
    a.planId !== b.planId ||
    a.planRevision !== b.planRevision ||
    learningDefinitionIdentity(a.definition) !== learningDefinitionIdentity(b.definition)
  )
    return result('UNKNOWN', 'LEARNING_REFERENCE_CHANGED');
  if (
    !AI_TRAINING_LEARNING_DEFINITION_FIXTURES.some(
      (fixture) =>
        learningDefinitionIdentity(fixture.reference) === learningDefinitionIdentity(a.definition),
    )
  )
    return result('UNKNOWN', 'DEFINITION_VERSION_UNKNOWN');
  if (a.assignmentId === b.assignmentId || baseline.subjectKey === followUp.subjectKey)
    return result('UNKNOWN', 'DISTINCT_PRACTICE_REQUIRED');
  if (
    !baseline.completion ||
    !followUp.completion ||
    !baseline.completedAt ||
    !followUp.completedAt
  )
    return result('UNKNOWN', 'PRACTICE_COMPLETION_MISSING');
  if (Date.parse(followUp.completedAt) <= Date.parse(baseline.completedAt))
    return result('UNKNOWN', 'LATER_PRACTICE_REQUIRED');
  if (
    !baseline.assessment ||
    !followUp.assessment ||
    !baseline.assessment.verified ||
    !followUp.assessment.verified
  )
    return result('UNKNOWN', 'VERIFIED_ASSESSMENT_MISSING');
  if (baseline.assessment.answerId === followUp.assessment.answerId)
    return result('UNKNOWN', 'DISTINCT_ANSWER_REQUIRED');
  for (const practice of [baseline, followUp]) {
    const assessment = practice.assessment;
    if (!assessment || assessment.ruleVersion !== AI_TRAINING_SKILL_RULE_VERSION)
      return result('UNKNOWN', 'ASSESSMENT_RULE_VERSION_UNKNOWN');
    if (
      assessment.result !== 'PASS' ||
      Date.parse(assessment.evaluatedAt) > Date.parse(practice.completedAt ?? '')
    )
      return result('UNKNOWN', 'ASSESSMENT_NOT_COMPLETION_EVIDENCE');
  }
  if (Date.parse(followUp.assessment.evaluatedAt) <= Date.parse(baseline.completedAt))
    return result('UNKNOWN', 'LATER_ASSESSMENT_REQUIRED');
  return result('EVIDENCE_AVAILABLE', 'DISTINCT_PRACTICE_WITH_MATCHING_ASSESSMENTS');
}
