import { PERSONAL_LEARNING_PLAN_CONTRACT_VERSION, type LearnerScope } from '@bunshin/application';
import { AI_TRAINING_CONSULTATION_RULE_VERSION } from './learning-consultation';
import type { TrainingPersonalDataScope } from './personal-data-export';
import {
  compareLearningReproduction,
  type LearningReproductionAttempt,
} from './learning-reproduction-evidence';
import {
  CAPABILITY_INTERACTIONS,
  GUIDED_PRACTICE_RULE_VERSION,
  definePracticeCompletion,
  effectivePracticeSupport,
  validateGuidedPracticeCommand,
} from './guided-practice';
import { AI_TRAINING_LEARNING_DEFINITION_FIXTURES } from './learning-definition-fixtures';
import { AI_TRAINING_SKILL_RULE_VERSION } from './skill-evaluation';
import { learningDefinitionIdentity } from './learning-router';
import {
  findReproductionChallengeReviewFixture,
  resolveReproductionChallengeReference,
} from './reproduction-challenge-fixtures';

export const REPRODUCTION_HISTORY_RULE_VERSION = 'AI_TRAINING_REPRODUCTION_HISTORY_V1';
export const REPRODUCTION_HISTORY_MAX_EVENTS = 200;
type Scoped = { workspaceId: string; groupId: string; programEnrollmentId: string };
export interface ReproductionHistoryAssignment extends Scoped {
  id: string;
  status: string;
  targetResourceType: string | null;
  targetResourceId: string | null;
  missionDefinitionKey: string;
  presentedAt: string;
  completedAt: string | null;
  displaySnapshot: unknown;
}
export interface ReproductionHistoryAnswer extends Scoped {
  id: string;
  userId: string;
  missionAssignmentId: string;
  evaluationStatus: string;
  evaluatedAt: string | null;
  evaluation: unknown;
}
export interface ReproductionHistoryEvent extends Scoped {
  id: string;
  actorUserId: string | null;
  missionAssignmentId: string | null;
  eventType: string;
  schemaVersion: number;
  sourceResourceType: string | null;
  sourceResourceId: string | null;
  occurredAt: string;
  metadata: unknown;
}
export interface ReproductionHistoryPlan {
  scope: LearnerScope;
  planId: string;
  revision: number;
  goalId: string;
  contractVersion: string;
  ruleVersion: string;
  status: string;
  confirmedAt: string | null;
  steps: unknown;
}
/** Internal Repository input, not an HTTP DTO or an authorization proof. No answer/body fields. */
export interface ReproductionHistorySnapshot {
  scope: LearnerScope;
  baselineAssignmentId: string;
  followUpAssignmentId: string;
  assignments: readonly ReproductionHistoryAssignment[];
  answers: readonly ReproductionHistoryAnswer[];
  events: readonly ReproductionHistoryEvent[];
  plans: readonly ReproductionHistoryPlan[];
  truncated: boolean;
}
export type ReproductionHistoryResult = ReturnType<typeof projectLearningReproductionHistory>;
export interface ReproductionHistoryRepository {
  read(
    input: TrainingPersonalDataScope & {
      baselineAssignmentId: string;
      followUpAssignmentId: string;
    },
  ): Promise<{ outcome: 'FOUND'; data: ReproductionHistoryResult } | { outcome: 'NOT_FOUND' }>;
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
class Unavailable extends Error {}
function requireEvidence(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Unavailable(reason);
}
function timestamp(value: string | null): number {
  requireEvidence(
    typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    'HISTORY_TIME_INVALID',
  );
  return Date.parse(value);
}
function scoped(row: Scoped, scope: LearnerScope) {
  requireEvidence(
    row.workspaceId === scope.workspaceId &&
      row.groupId === scope.groupId &&
      row.programEnrollmentId === scope.programEnrollmentId,
    'HISTORY_SCOPE_MISMATCH',
  );
}
function identity(value: unknown) {
  const ref = object(value);
  if (
    typeof ref.packageKey !== 'string' ||
    typeof ref.definitionKey !== 'string' ||
    typeof ref.version !== 'string'
  )
    return 'INVALID_REFERENCE';
  return `${ref.packageKey}:${ref.definitionKey}:${ref.version}`;
}
function attempt(
  snapshot: ReproductionHistorySnapshot,
  assignmentId: string,
): LearningReproductionAttempt {
  const assignment = snapshot.assignments.find((row) => row.id === assignmentId);
  requireEvidence(assignment, 'ASSIGNMENT_MISSING');
  scoped(assignment, snapshot.scope);
  const personal = object(object(assignment.displaySnapshot).personalLearning);
  requireEvidence(
    personal.challenge !== undefined && personal.challenge !== null,
    'CHALLENGE_REFERENCE_MISSING',
  );
  let fixture;
  try {
    fixture = findReproductionChallengeReviewFixture(personal.challenge);
  } catch {
    throw new Unavailable('CHALLENGE_REFERENCE_INVALID');
  }
  requireEvidence(fixture, 'CHALLENGE_REFERENCE_UNKNOWN');
  const challenge = fixture.reference;
  requireEvidence(
    learningDefinitionIdentity(challenge.definition) === identity(personal.definition) &&
      assignment.missionDefinitionKey === challenge.legacyMissionRef.actionKey &&
      object(assignment.displaySnapshot).qualityVersion ===
        challenge.legacyMissionRef.qualityVersion,
    'CHALLENGE_ASSIGNMENT_MISMATCH',
  );
  const plan = snapshot.plans.find(
    (row) => row.planId === personal.planId && row.revision === personal.planRevision,
  );
  requireEvidence(plan, 'PLAN_REVISION_MISSING');
  requireEvidence(
    plan.contractVersion === PERSONAL_LEARNING_PLAN_CONTRACT_VERSION &&
      [PERSONAL_LEARNING_PLAN_CONTRACT_VERSION, AI_TRAINING_CONSULTATION_RULE_VERSION].includes(
        plan.ruleVersion,
      ),
    'PLAN_VERSION_UNKNOWN',
  );
  requireEvidence(
    Number.isSafeInteger(plan.revision) &&
      plan.revision > 0 &&
      /^[A-Za-z0-9_-]{1,200}$/.test(plan.goalId),
    'PLAN_REFERENCE_INVALID',
  );
  scoped(plan.scope, snapshot.scope);
  requireEvidence(
    plan.scope.userId === snapshot.scope.userId &&
      plan.scope.groupMembershipId === snapshot.scope.groupMembershipId,
    'HISTORY_SCOPE_MISMATCH',
  );
  requireEvidence(
    plan.status === 'CONFIRMED' || plan.status === 'SUPERSEDED' || plan.status === 'COMPLETED',
    'CONFIRMED_PLAN_REQUIRED',
  );
  requireEvidence(
    timestamp(plan.confirmedAt) <= timestamp(assignment.presentedAt) &&
      assignment.targetResourceType === 'PERSONAL_LEARNING_PLAN' &&
      assignment.targetResourceId === plan.planId &&
      Array.isArray(plan.steps) &&
      plan.steps.some(
        (step) =>
          identity(object(step).definition) === learningDefinitionIdentity(challenge.definition),
      ),
    'PLAN_ASSIGNMENT_MISMATCH',
  );
  requireEvidence(
    assignment.status === 'COMPLETED' && assignment.completedAt !== null,
    'ASSIGNMENT_NOT_COMPLETED',
  );
  const events = snapshot.events.filter((row) => row.missionAssignmentId === assignmentId);
  for (const event of events) {
    scoped(event, snapshot.scope);
    requireEvidence(
      event.actorUserId === snapshot.scope.userId && event.schemaVersion === 1,
      'HISTORY_SCOPE_MISMATCH',
    );
  }
  const starts = events.filter((row) => row.eventType === 'PERSONAL_LEARNING_PRACTICE_STARTED');
  const completes = events.filter(
    (row) => row.eventType === 'PERSONAL_LEARNING_PRACTICE_COMPLETED',
  );
  requireEvidence(
    starts.length === 1 && completes.length === 1,
    'PRACTICE_EVENT_MISSING_OR_AMBIGUOUS',
  );
  const start = starts[0]!,
    complete = completes[0]!;
  const started = timestamp(start.occurredAt),
    completed = timestamp(complete.occurredAt);
  requireEvidence(
    timestamp(assignment.presentedAt) <= started &&
      started <= completed &&
      timestamp(assignment.completedAt) <= completed,
    'PRACTICE_TIME_MISMATCH',
  );
  const reference = {
    goalId: plan.goalId,
    planId: plan.planId,
    planRevision: plan.revision,
    definition: challenge.definition,
    assignmentId,
  };
  const practiceEvents = events.filter((row) =>
    [
      'PERSONAL_LEARNING_PRACTICE_STARTED',
      'PERSONAL_LEARNING_CAPABILITY_INTERACTION',
      'PERSONAL_LEARNING_PRACTICE_COMPLETED',
    ].includes(row.eventType),
  );
  for (const event of practiceEvents) {
    const metadata = object(event.metadata);
    requireEvidence(
      metadata.ruleVersion === GUIDED_PRACTICE_RULE_VERSION &&
        metadata.operator === 'LEARNER' &&
        metadata.provenance === 'LEARNER_REPORTED' &&
        metadata.goalId === reference.goalId &&
        metadata.planId === reference.planId &&
        metadata.planRevision === reference.planRevision &&
        metadata.assignmentId === assignmentId &&
        identity(metadata.definition) === learningDefinitionIdentity(challenge.definition),
      'PRACTICE_REFERENCE_MISMATCH',
    );
    requireEvidence(
      timestamp(event.occurredAt) >= started && timestamp(event.occurredAt) <= completed,
      'PRACTICE_TIME_MISMATCH',
    );
    requireEvidence(
      event.sourceResourceType ===
        (event === complete ? 'TRAINING_MISSION_ANSWER' : 'PERSONAL_LEARNING_PLAN') &&
        (event === complete || event.sourceResourceId === plan.planId),
      'PRACTICE_SOURCE_MISMATCH',
    );
  }
  let startCommand, completeCommand;
  try {
    startCommand = validateGuidedPracticeCommand(object(start.metadata).command);
    completeCommand = validateGuidedPracticeCommand(object(complete.metadata).command);
  } catch {
    throw new Unavailable('LEARNER_CONFIRMATION_MISSING');
  }
  requireEvidence(
    startCommand.action === 'START' &&
      object(start.metadata).supportLevel === startCommand.supportLevel &&
      completeCommand.action === 'COMPLETE',
    'LEARNER_CONFIRMATION_MISSING',
  );
  const interactions = events.filter(
    (row) => row.eventType === 'PERSONAL_LEARNING_CAPABILITY_INTERACTION',
  );
  const keys = interactions.map((row) => object(row.metadata).interaction);
  requireEvidence(
    keys.length >= 2 &&
      keys.length <= 3 &&
      new Set(keys).size === keys.length &&
      keys.every((key) =>
        CAPABILITY_INTERACTIONS.includes(key as (typeof CAPABILITY_INTERACTIONS)[number]),
      ),
    'LEARNER_INTERACTION_MISSING',
  );
  for (const event of interactions) {
    let command;
    try {
      command = validateGuidedPracticeCommand(object(event.metadata).command);
    } catch {
      throw new Unavailable('LEARNER_INTERACTION_MISSING');
    }
    requireEvidence(
      command.action === 'INTERACT' && command.interaction === object(event.metadata).interaction,
      'LEARNER_INTERACTION_MISSING',
    );
  }
  const prompted = interactions.find((row) => object(row.metadata).interaction === 'SELF_PROMPTED');
  const evaluated = interactions.find(
    (row) => object(row.metadata).interaction === 'SELF_EVALUATED',
  );
  const revised = interactions.find((row) => object(row.metadata).interaction === 'SELF_REVISED');
  requireEvidence(
    prompted &&
      evaluated &&
      timestamp(prompted.occurredAt) <= timestamp(evaluated.occurredAt) &&
      (!revised || timestamp(evaluated.occurredAt) <= timestamp(revised.occurredAt)),
    'LEARNER_INTERACTION_MISSING',
  );
  const supportEvents = events.filter(
    (row) => row.eventType === 'HINT_VIEWED' || row.eventType === 'HELP_REQUESTED',
  );
  for (const event of supportEvents)
    requireEvidence(
      timestamp(event.occurredAt) >= timestamp(assignment.presentedAt) &&
        timestamp(event.occurredAt) <= completed,
      'SUPPORT_TIME_MISMATCH',
    );
  const support = effectivePracticeSupport(
    startCommand.supportLevel,
    supportEvents.some((row) => row.eventType === 'HINT_VIEWED'),
    supportEvents.some((row) => row.eventType === 'HELP_REQUESTED'),
  );
  requireEvidence(object(complete.metadata).supportLevel === support, 'SUPPORT_EVIDENCE_MISMATCH');
  const answer = snapshot.answers.find((row) => row.missionAssignmentId === assignmentId);
  requireEvidence(answer, 'ANSWER_MISSING');
  scoped(answer, snapshot.scope);
  requireEvidence(answer.userId === snapshot.scope.userId, 'HISTORY_SCOPE_MISMATCH');
  const assessmentRef = object(object(complete.metadata).assessment);
  requireEvidence(
    complete.sourceResourceId === answer.id &&
      assessmentRef.answerId === answer.id &&
      assessmentRef.ruleVersion === AI_TRAINING_SKILL_RULE_VERSION &&
      answer.evaluationStatus === 'READY',
    'ASSESSMENT_REFERENCE_MISMATCH',
  );
  const at = timestamp(answer.evaluatedAt);
  requireEvidence(
    at >= timestamp(assignment.presentedAt) &&
      at <= timestamp(assignment.completedAt) &&
      at <= completed,
    'ASSESSMENT_TIME_MISMATCH',
  );
  const audits = events.filter(
    (row) =>
      row.eventType === 'ANSWER_EVALUATED' &&
      row.sourceResourceType === 'TRAINING_MISSION_ANSWER' &&
      row.sourceResourceId === answer.id,
  );
  requireEvidence(
    audits.length === 1 && timestamp(audits[0]!.occurredAt) === at,
    'ASSESSMENT_AUDIT_MISSING_OR_AMBIGUOUS',
  );
  const evaluation = object(answer.evaluation),
    audited = object(audits[0]!.metadata);
  requireEvidence(
    ['result', 'understanding', 'skills', 'evaluatedSkillKeys', 'evaluationRuleVersion'].every(
      (key) => JSON.stringify(evaluation[key]) === JSON.stringify(audited[key]),
    ),
    'ASSESSMENT_AUDIT_MISMATCH',
  );
  const score = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 60 && value <= 100;
  const definition = AI_TRAINING_LEARNING_DEFINITION_FIXTURES.find(
    (row) =>
      learningDefinitionIdentity(row.reference) ===
      learningDefinitionIdentity(challenge.definition),
  )!;
  requireEvidence(
    evaluation.result === 'PASS' &&
      evaluation.evaluationRuleVersion === AI_TRAINING_SKILL_RULE_VERSION &&
      score(evaluation.understanding) &&
      definition.targetSkillRefs.every(
        (skill) =>
          Array.isArray(evaluation.evaluatedSkillKeys) &&
          evaluation.evaluatedSkillKeys.includes(skill.skillKey) &&
          score(object(evaluation.skills)[skill.skillKey]),
      ),
    'ASSESSMENT_SKILL_EVIDENCE_MISSING',
  );
  const completion = definePracticeCompletion({
    command: completeCommand,
    started: true,
    interactions: CAPABILITY_INTERACTIONS.filter((key) => keys.includes(key)),
    assessmentVerified: true,
    supportLevel: support,
  });
  requireEvidence(
    ['learnerConfirmation', 'evidenceBasis', 'outcomeQuality', 'capabilityLevel'].every(
      (key) => object(complete.metadata)[key] === completion[key as keyof typeof completion],
    ) &&
      JSON.stringify(object(complete.metadata).capabilityEvidence) ===
        JSON.stringify(completion.capabilityEvidence),
    'COMPLETION_EVIDENCE_MISMATCH',
  );
  return {
    scope: snapshot.scope,
    reference,
    subjectKey: challenge.subjectKey,
    completedAt: complete.occurredAt,
    completion,
    assessment: {
      scope: snapshot.scope,
      assignmentId,
      answerId: answer.id,
      evaluatedAt: answer.evaluatedAt!,
      ruleVersion: AI_TRAINING_SKILL_RULE_VERSION,
      result: 'PASS',
      verified: true,
    },
  };
}

/** Recomputed from one authorized snapshot. Never stores success or exposes raw history/body. */
export function projectLearningReproductionHistory(snapshot: ReproductionHistorySnapshot) {
  const result = (reason: string) =>
    Object.freeze({
      ruleVersion: REPRODUCTION_HISTORY_RULE_VERSION,
      status: 'UNKNOWN' as const,
      reason,
      supportComparison: 'UNKNOWN' as const,
      externalInteractionVerified: 'UNKNOWN' as const,
      outcomeQuality: 'UNKNOWN' as const,
      capabilityLevel: 'UNKNOWN' as const,
      transferVerified: 'UNKNOWN' as const,
    });
  try {
    requireEvidence(
      !snapshot.truncated && snapshot.events.length <= REPRODUCTION_HISTORY_MAX_EVENTS,
      'HISTORY_TRUNCATED',
    );
    requireEvidence(
      snapshot.baselineAssignmentId !== snapshot.followUpAssignmentId,
      'DISTINCT_PRACTICE_REQUIRED',
    );
    requireEvidence(
      new Set(snapshot.assignments.map((row) => row.id)).size === snapshot.assignments.length &&
        new Set(snapshot.answers.map((row) => row.missionAssignmentId)).size ===
          snapshot.answers.length &&
        new Set(snapshot.events.map((row) => row.id)).size === snapshot.events.length,
      'HISTORY_AMBIGUOUS',
    );
    requireEvidence(
      new Set(snapshot.plans.map((row) => `${row.planId}:${row.revision}`)).size ===
        snapshot.plans.length,
      'HISTORY_AMBIGUOUS',
    );
    const baseline = attempt(snapshot, snapshot.baselineAssignmentId),
      followUp = attempt(snapshot, snapshot.followUpAssignmentId);
    const compared = compareLearningReproduction({ baseline, followUp });
    if (compared.status === 'UNKNOWN') return result(compared.reason);
    // R1 has only DRAFT fixtures and no approval source. Even matching evidence stays UNKNOWN.
    const assignment = snapshot.assignments.find(
      (row) => row.id === snapshot.baselineAssignmentId,
    )!;
    const approval = resolveReproductionChallengeReference(
      object(object(assignment.displaySnapshot).personalLearning).challenge,
    );
    return result(approval.reason);
  } catch (error) {
    if (error instanceof Unavailable) return result(error.message);
    throw error;
  }
}
