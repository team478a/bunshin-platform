import type {
  LearningDefinitionReference,
  LearningRouterResult,
  PersonalLearningPlan,
} from '@bunshin/application';
import { AI_TRAINING_LEARNING_DEFINITION_FIXTURES } from './learning-definition-fixtures';
import { AI_TRAINING_SKILL_RULE_VERSION } from './skill-evaluation';

export const AI_TRAINING_LEARNING_ROUTER_VERSION = 'AI_TRAINING_LEARNING_ROUTER_V1';
export const learningDefinitionIdentity = (ref: LearningDefinitionReference) =>
  `${ref.packageKey}:${ref.definitionKey}:${ref.version}`;
export interface AiTrainingDefinitionEvidence {
  readonly definition: LearningDefinitionReference;
  readonly planRevision: number;
  readonly assignmentId: string;
  readonly sequence: number;
  readonly missionKey: string;
  readonly qualityVersion: string;
  readonly assignmentStatus: string;
  readonly evaluatedAt: string | null;
  /** READY answer + matching ANSWER_EVALUATED audit, not a Profile score. */
  readonly verifiedAssessment: boolean;
  readonly evaluation: unknown;
}
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
export function routeAiTrainingLearning(input: {
  plan: PersonalLearningPlan;
  expectedRevision: number;
  goalActive: boolean;
  enrollmentActive: boolean;
  approvedRefs: readonly LearningDefinitionReference[];
  evidence: readonly AiTrainingDefinitionEvidence[];
}): LearningRouterResult {
  const result = (
    status: LearningRouterResult['status'],
    reason: string,
    definition: LearningDefinitionReference | null = null,
  ): LearningRouterResult =>
    Object.freeze({
      status,
      reason,
      definition,
      ruleVersion: AI_TRAINING_LEARNING_ROUTER_VERSION,
    });
  if (!input.enrollmentActive) return result('BLOCKED', 'ENROLLMENT_NOT_ACTIVE');
  if (!input.goalActive) return result('BLOCKED', 'GOAL_NOT_ACTIVE');
  const { plan } = input;
  if (plan.revision !== input.expectedRevision) return result('BLOCKED', 'PLAN_REVISION_CHANGED');
  if (plan.status !== 'CONFIRMED') return result('BLOCKED', 'PLAN_NOT_CONFIRMED');
  const approved = new Set(input.approvedRefs.map(learningDefinitionIdentity));
  const completed = new Set<string>();
  for (const step of plan.steps) {
    const key = learningDefinitionIdentity(step.definition);
    const definition = AI_TRAINING_LEARNING_DEFINITION_FIXTURES.find(
      (d) => learningDefinitionIdentity(d.reference) === key,
    );
    if (!definition) return result('UNKNOWN', 'DEFINITION_VERSION_UNKNOWN', step.definition);
    if (!approved.has(key)) return result('BLOCKED', 'DEFINITION_NOT_APPROVED', step.definition);
    if (JSON.stringify(step.prerequisites) !== JSON.stringify(definition.prerequisites))
      return result('BLOCKED', 'PREREQUISITE_REFERENCE_MISMATCH', step.definition);
    if (step.prerequisites.some((ref) => !completed.has(learningDefinitionIdentity(ref))))
      return result('BLOCKED', 'PREREQUISITE_NOT_COMPLETED', step.definition);
    const history = input.evidence.filter((e) => learningDefinitionIdentity(e.definition) === key);
    if (history.some((e) => e.planRevision !== plan.revision))
      return result('UNKNOWN', 'PLAN_REVISION_CHANGED', step.definition);
    const attempts = [...history].sort((a, b) => b.sequence - a.sequence);
    const latest = attempts[0];
    if (!latest)
      return result(
        'NEXT',
        completed.size ? 'ASSESSMENT_PASSED' : 'FIRST_REQUIRED_DEFINITION',
        step.definition,
      );
    if (
      latest.missionKey !== definition.legacyMissionRef.actionKey ||
      latest.qualityVersion !== definition.legacyMissionRef.qualityVersion
    )
      return result('UNKNOWN', 'MISSION_REFERENCE_MISMATCH', step.definition);
    const evaluation = record(latest.evaluation);
    if (
      !latest.verifiedAssessment ||
      !latest.evaluatedAt ||
      !Number.isFinite(Date.parse(latest.evaluatedAt)) ||
      !evaluation
    )
      return result('UNKNOWN', 'ASSESSMENT_MISSING', step.definition);
    if (evaluation.evaluationRuleVersion !== AI_TRAINING_SKILL_RULE_VERSION)
      return result('UNKNOWN', 'SKILL_RULE_VERSION_UNKNOWN', step.definition);
    const skills = record(evaluation.skills);
    const evaluated = evaluation.evaluatedSkillKeys;
    if (
      !skills ||
      !Array.isArray(evaluated) ||
      definition.targetSkillRefs.some(
        (skill) =>
          !evaluated.includes(skill.skillKey) ||
          typeof skills[skill.skillKey] !== 'number' ||
          !Number.isFinite(skills[skill.skillKey]) ||
          Number(skills[skill.skillKey]) < 0 ||
          Number(skills[skill.skillKey]) > 100,
      )
    )
      return result('UNKNOWN', 'SKILL_EVIDENCE_MISSING', step.definition);
    if (
      typeof evaluation.understanding !== 'number' ||
      !Number.isFinite(evaluation.understanding) ||
      evaluation.understanding < 0 ||
      evaluation.understanding > 100 ||
      evaluated.some(
        (key) =>
          typeof key !== 'string' ||
          typeof skills[key] !== 'number' ||
          !Number.isFinite(skills[key]) ||
          Number(skills[key]) < 0 ||
          Number(skills[key]) > 100,
      )
    )
      return result('UNKNOWN', 'ASSESSMENT_INCONSISTENT', step.definition);
    if (evaluation.result === 'REVIEW' && latest.assignmentStatus === 'SKIPPED')
      return result(
        typeof evaluation.understanding === 'number' && evaluation.understanding < 60
          ? 'RETRY'
          : 'REVIEW',
        'ASSESSMENT_REVIEW_REQUIRED',
        step.definition,
      );
    if (
      evaluation.result !== 'PASS' ||
      latest.assignmentStatus !== 'COMPLETED' ||
      typeof evaluation.understanding !== 'number' ||
      evaluation.understanding < 60 ||
      evaluation.understanding > 100 ||
      evaluated.some((key) => Number(skills[String(key)]) < 60)
    )
      return result('UNKNOWN', 'ASSESSMENT_INCONSISTENT', step.definition);
    completed.add(key);
  }
  return result('PLAN_COMPLETED', 'PLAN_COMPLETED');
}
