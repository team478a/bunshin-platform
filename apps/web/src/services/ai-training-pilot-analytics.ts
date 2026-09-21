import { TRAINING_SKILL_KEYS, type TrainingSkillKey } from '@bunshin/capability-training';

type EvaluationRecord = {
  programEnrollmentId: string;
  evaluation: unknown;
  evaluatedAt: Date | null;
};

export type AiTrainingPilotAnalytics = {
  participants: number;
  assessmentCompleted: number;
  assessmentCompletionPercent: number;
  goalSelected: number;
  goalSelectionPercent: number;
  missionStarted: number;
  missionStartPercent: number;
  answered: number;
  answerPercent: number;
  passedEvaluations: number;
  reviewEvaluations: number;
  passPercent: number;
  reviewParticipants: number;
  retriedParticipants: number;
  retryPercent: number;
  skillMeasuredParticipants: number;
  skillImprovedParticipants: number;
  skillImprovementPercent: number;
  toolkitSavedParticipants: number;
  toolkitSavePercent: number;
};

const percent = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const evaluationResult = (value: unknown): 'PASS' | 'REVIEW' | null => {
  const result = record(value)?.['result'];
  return result === 'PASS' || result === 'REVIEW' ? result : null;
};

const evaluationSkills = (value: unknown): Partial<Record<TrainingSkillKey, number>> => {
  const skills = record(record(value)?.['skills']);
  if (!skills) return {};
  return Object.fromEntries(
    TRAINING_SKILL_KEYS.flatMap((key) => {
      const score = skills[key];
      return typeof score === 'number' && score >= 0 && score <= 100 ? [[key, score]] : [];
    }),
  );
};

export function buildAiTrainingPilotAnalytics(input: {
  enrollmentIds: readonly string[];
  assessedEnrollmentIds: readonly string[];
  goalEnrollmentIds: readonly string[];
  presentedEnrollmentIds: readonly string[];
  answers: readonly EvaluationRecord[];
  toolkitEnrollmentIds: readonly string[];
}): AiTrainingPilotAnalytics {
  const participants = new Set(input.enrollmentIds).size;
  const assessmentCompleted = new Set(input.assessedEnrollmentIds).size;
  const goalSelected = new Set(input.goalEnrollmentIds).size;
  const presented = new Set(input.presentedEnrollmentIds).size;
  const answersByEnrollment = new Map<string, EvaluationRecord[]>();
  for (const answer of input.answers) {
    const values = answersByEnrollment.get(answer.programEnrollmentId) ?? [];
    values.push(answer);
    answersByEnrollment.set(answer.programEnrollmentId, values);
  }
  const answered = answersByEnrollment.size;
  const evaluated = input.answers.filter(({ evaluation }) => evaluationResult(evaluation));
  const passedEvaluations = evaluated.filter(
    ({ evaluation }) => evaluationResult(evaluation) === 'PASS',
  ).length;
  const reviewEvaluations = evaluated.filter(
    ({ evaluation }) => evaluationResult(evaluation) === 'REVIEW',
  ).length;
  const reviewedEnrollmentIds = new Set(
    evaluated
      .filter(({ evaluation }) => evaluationResult(evaluation) === 'REVIEW')
      .map(({ programEnrollmentId }) => programEnrollmentId),
  );
  const retriedParticipants = [...reviewedEnrollmentIds].filter(
    (enrollmentId) => (answersByEnrollment.get(enrollmentId)?.length ?? 0) >= 2,
  ).length;
  let skillMeasuredParticipants = 0;
  let skillImprovedParticipants = 0;
  for (const values of answersByEnrollment.values()) {
    const ordered = [...values]
      .filter(({ evaluatedAt, evaluation }) => evaluatedAt && evaluationResult(evaluation))
      .sort((left, right) => left.evaluatedAt!.getTime() - right.evaluatedAt!.getTime());
    if (ordered.length < 2) continue;
    const first = evaluationSkills(ordered[0]!.evaluation);
    const latest = evaluationSkills(ordered.at(-1)!.evaluation);
    const comparable = TRAINING_SKILL_KEYS.filter(
      (key) => first[key] !== undefined && latest[key] !== undefined,
    );
    if (!comparable.length) continue;
    skillMeasuredParticipants += 1;
    if (comparable.some((key) => latest[key]! > first[key]!)) skillImprovedParticipants += 1;
  }
  const passedEnrollmentIds = new Set(
    evaluated
      .filter(({ evaluation }) => evaluationResult(evaluation) === 'PASS')
      .map(({ programEnrollmentId }) => programEnrollmentId),
  );
  const toolkitSavedParticipants = new Set(input.toolkitEnrollmentIds).size;

  return {
    participants,
    assessmentCompleted,
    assessmentCompletionPercent: percent(assessmentCompleted, participants),
    goalSelected,
    goalSelectionPercent: percent(goalSelected, assessmentCompleted),
    missionStarted: presented,
    missionStartPercent: percent(presented, assessmentCompleted),
    answered,
    answerPercent: percent(answered, presented),
    passedEvaluations,
    reviewEvaluations,
    passPercent: percent(passedEvaluations, passedEvaluations + reviewEvaluations),
    reviewParticipants: reviewedEnrollmentIds.size,
    retriedParticipants,
    retryPercent: percent(retriedParticipants, reviewedEnrollmentIds.size),
    skillMeasuredParticipants,
    skillImprovedParticipants,
    skillImprovementPercent: percent(skillImprovedParticipants, skillMeasuredParticipants),
    toolkitSavedParticipants,
    toolkitSavePercent: percent(toolkitSavedParticipants, passedEnrollmentIds.size),
  };
}
