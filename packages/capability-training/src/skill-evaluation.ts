import type { TrainingActionKey } from './index';

export const TRAINING_SKILL_KEYS = [
  'promptStructure',
  'contextSetting',
  'constraintSetting',
  'outputControl',
  'businessApplication',
  'revisionSkill',
] as const;

export const AI_TRAINING_SKILL_RULE_VERSION = 'AI_TRAINING_SKILL_RULES_V1';

export type TrainingSkillKey = (typeof TRAINING_SKILL_KEYS)[number];
export type TrainingSkillScores = Record<TrainingSkillKey, number>;

export const TRAINING_SKILL_LABELS: Record<TrainingSkillKey, string> = {
  promptStructure: '指示の組み立て',
  contextSetting: '背景の伝え方',
  constraintSetting: '条件指定',
  outputControl: '出力の整え方',
  businessApplication: '実務への活用',
  revisionSkill: '改善する力',
};

export const AI_TRAINING_MISSION_SKILLS = {
  AI_BASIC: ['businessApplication'],
  CHATGPT_BASIC: ['promptStructure'],
  PROMPT_BASIC: ['promptStructure', 'contextSetting'],
  PROMPT_CONDITION: ['constraintSetting', 'contextSetting'],
  PROMPT_FORMAT: ['outputControl'],
  PROMPT_REVIEW: ['revisionSkill', 'promptStructure', 'constraintSetting'],
  EMAIL_WRITING: ['businessApplication', 'contextSetting', 'outputControl'],
  DOCUMENT_SUMMARY: ['contextSetting', 'constraintSetting', 'outputControl'],
  DOCUMENT_PROOFREAD: ['contextSetting', 'outputControl', 'revisionSkill'],
  IDEA_GENERATION: ['contextSetting', 'constraintSetting', 'businessApplication'],
  SALES_EMAIL: ['businessApplication', 'contextSetting', 'constraintSetting', 'outputControl'],
  SALES_HEARING: ['contextSetting', 'businessApplication', 'outputControl'],
  SALES_PROPOSAL: ['businessApplication', 'contextSetting', 'outputControl'],
  SALES_FOLLOW_UP: ['businessApplication', 'contextSetting', 'constraintSetting'],
  OFFICE_MINUTES: ['contextSetting', 'outputControl', 'businessApplication'],
  OFFICE_DOCUMENT: ['contextSetting', 'outputControl', 'businessApplication'],
  OFFICE_EXCEL: ['contextSetting', 'constraintSetting', 'businessApplication'],
  OFFICE_DATA: ['contextSetting', 'outputControl', 'businessApplication'],
  MANAGER_PROCESS_REVIEW: ['businessApplication', 'contextSetting', 'outputControl'],
  MANAGER_IMPROVEMENT: ['businessApplication', 'constraintSetting', 'revisionSkill'],
  MANAGER_AI_DESIGN: ['businessApplication', 'constraintSetting', 'outputControl'],
  MANAGER_TEAM_GUIDANCE: ['promptStructure', 'constraintSetting', 'businessApplication'],
  MANAGER_AI_RULES: ['constraintSetting', 'businessApplication', 'outputControl'],
  RECOVERY: ['promptStructure', 'businessApplication'],
  WAIT: [],
} as const satisfies Record<TrainingActionKey, readonly TrainingSkillKey[]>;

export type TrainingSkillEvaluationInput = {
  understanding: number;
  skills: TrainingSkillScores;
  strengths: string[];
  weaknesses: string[];
  proposedNextSkill: TrainingSkillKey;
};

export type TrainingSkillEvaluation = {
  result: 'PASS' | 'REVIEW';
  understanding: number;
  skills: TrainingSkillScores;
  evaluatedSkillKeys: readonly TrainingSkillKey[];
  strengths: string[];
  weaknesses: string[];
  recommendedNextSkill: TrainingSkillKey;
  nextRecommendation: string;
  evaluationRuleVersion: typeof AI_TRAINING_SKILL_RULE_VERSION;
};

const PASS_SCORE = 60;

export function finalizeTrainingSkillEvaluation(
  input: TrainingSkillEvaluationInput,
  evaluatedSkillKeys: readonly TrainingSkillKey[],
): TrainingSkillEvaluation {
  if (evaluatedSkillKeys.length === 0) throw new Error('evaluatedSkillKeys must not be empty');
  const weakestSkill = evaluatedSkillKeys.reduce((weakest, skill) =>
    input.skills[skill] < input.skills[weakest] ? skill : weakest,
  );
  const passed =
    input.understanding >= PASS_SCORE &&
    evaluatedSkillKeys.every((skill) => input.skills[skill] >= PASS_SCORE);
  const recommendedNextSkill = passed ? input.proposedNextSkill : weakestSkill;
  return {
    result: passed ? 'PASS' : 'REVIEW',
    understanding: input.understanding,
    skills: input.skills,
    evaluatedSkillKeys,
    strengths: input.strengths,
    weaknesses: input.weaknesses,
    recommendedNextSkill,
    nextRecommendation: passed
      ? `次は「${TRAINING_SKILL_LABELS[recommendedNextSkill]}」を使う課題へ進みます。`
      : `次は「${TRAINING_SKILL_LABELS[recommendedNextSkill]}」を短く復習しましょう。`,
    evaluationRuleVersion: AI_TRAINING_SKILL_RULE_VERSION,
  };
}

export function parseTrainingSkillScores(value: unknown): Partial<TrainingSkillScores> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    TRAINING_SKILL_KEYS.flatMap((key) => {
      const score = source[key];
      return typeof score === 'number' && Number.isInteger(score) && score >= 0 && score <= 100
        ? [[key, score]]
        : [];
    }),
  );
}

export function mergeTrainingSkillScores(
  current: unknown,
  evaluation: TrainingSkillEvaluation,
): Partial<TrainingSkillScores> {
  const merged = parseTrainingSkillScores(current);
  for (const key of evaluation.evaluatedSkillKeys) merged[key] = evaluation.skills[key];
  return merged;
}

export function trainingSkillBottleneckKey(skill: TrainingSkillKey): string {
  return `TRAINING_SKILL_${skill.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
}
