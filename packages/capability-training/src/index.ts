import {
  defineNextActionDecision,
  type NextActionDecision,
  type NextActionPolicy,
  type ProgramDefinitionV1,
} from '@bunshin/application';

export const AI_TRAINING_V1_RULE_VERSION = 'AI_TRAINING_V1_RULES_2';
export const AI_TRAINING_V1_MODULE_KEY = 'AI_TRAINING_V1';
export const TRAINING_ROLES = ['SALES', 'OFFICE', 'MANAGER', 'OTHER'] as const;
export const TRAINING_AI_LEVELS = ['BEGINNER', 'INTERMEDIATE'] as const;
export const TRAINING_ACTION_KEYS = [
  'AI_BASIC',
  'CHATGPT_BASIC',
  'PROMPT_BASIC',
  'PROMPT_CONDITION',
  'PROMPT_FORMAT',
  'PROMPT_REVIEW',
  'EMAIL_WRITING',
  'DOCUMENT_SUMMARY',
  'DOCUMENT_PROOFREAD',
  'IDEA_GENERATION',
  'SALES_EMAIL',
  'SALES_HEARING',
  'SALES_PROPOSAL',
  'SALES_FOLLOW_UP',
  'OFFICE_MINUTES',
  'OFFICE_DOCUMENT',
  'OFFICE_EXCEL',
  'OFFICE_DATA',
  'MANAGER_PROCESS_REVIEW',
  'MANAGER_IMPROVEMENT',
  'MANAGER_AI_DESIGN',
  'MANAGER_TEAM_GUIDANCE',
  'MANAGER_AI_RULES',
  'RECOVERY',
  'WAIT',
] as const;
export type TrainingRole = (typeof TRAINING_ROLES)[number];
export type TrainingAiLevel = (typeof TRAINING_AI_LEVELS)[number];
export type TrainingActionKey = (typeof TRAINING_ACTION_KEYS)[number];

export interface AiTrainingV1DecisionContext {
  now: Date;
  role: TrainingRole;
  aiLevel: TrainingAiLevel;
  currentPhase: 'FOUNDATION' | 'PRACTICE' | 'APPLICATION';
  completedMissionKeys: readonly string[];
  completedMissionCount: number;
  recentSuccesses: number;
  recentFailures: number;
  needsReview: boolean;
  lastMissionKey: string | null;
  streak: number;
  bottleneckKey: string | null;
  activityBaselineAt: Date;
  lastActionAt: Date | null;
  pauseAfterDays: number;
  activeWaitUntil: Date | null;
}

const DAY_MS = 86_400_000;
const completed = (context: AiTrainingV1DecisionContext, key: TrainingActionKey) =>
  context.completedMissionKeys.includes(key);
const firstIncomplete = (
  context: AiTrainingV1DecisionContext,
  missionKeys: readonly Exclude<TrainingActionKey, 'WAIT'>[],
) => missionKeys.find((key) => !completed(context, key));
const work = (actionKey: Exclude<TrainingActionKey, 'WAIT'>, reasonCode: string) =>
  defineNextActionDecision({
    actionKey,
    mode: 'WORK',
    reasonCode,
    target: null,
    ruleVersion: AI_TRAINING_V1_RULE_VERSION,
    reevaluateAt: null,
  });
const wait = (reevaluateAt: Date) =>
  defineNextActionDecision({
    actionKey: 'WAIT',
    mode: 'WAIT',
    reasonCode: 'TRAINING_REEVALUATION_PENDING',
    target: null,
    ruleVersion: AI_TRAINING_V1_RULE_VERSION,
    reevaluateAt,
  });

export class AiTrainingV1Policy implements NextActionPolicy<AiTrainingV1DecisionContext> {
  evaluate(context: AiTrainingV1DecisionContext): NextActionDecision {
    if (context.activeWaitUntil && context.activeWaitUntil > context.now)
      return wait(context.activeWaitUntil);
    if (!Number.isInteger(context.pauseAfterDays) || context.pauseAfterDays < 1)
      throw new Error('pauseAfterDays must be a positive integer');
    const baseline = context.lastActionAt ?? context.activityBaselineAt;
    if (context.now.getTime() - baseline.getTime() >= context.pauseAfterDays * DAY_MS)
      return work('RECOVERY', 'USER_ACTIVITY_PAUSED');
    if (context.needsReview || context.recentFailures >= 2)
      return work('PROMPT_REVIEW', 'RECENT_FAILURES_REQUIRE_REVIEW');
    if (!completed(context, 'AI_BASIC')) return work('AI_BASIC', 'AI_FOUNDATION_NOT_COMPLETED');
    if (!completed(context, 'CHATGPT_BASIC'))
      return work('CHATGPT_BASIC', 'CHATGPT_FOUNDATION_NOT_COMPLETED');
    if (context.aiLevel === 'BEGINNER' && !completed(context, 'PROMPT_BASIC'))
      return work('PROMPT_BASIC', 'BEGINNER_PROMPT_FOUNDATION_REQUIRED');
    if (!completed(context, 'PROMPT_CONDITION'))
      return work('PROMPT_CONDITION', 'PROMPT_CONDITIONS_REQUIRED');
    if (!completed(context, 'PROMPT_FORMAT'))
      return work('PROMPT_FORMAT', 'PROMPT_FORMAT_REQUIRED');
    const roleMissions =
      context.role === 'SALES'
        ? (['SALES_EMAIL', 'SALES_HEARING', 'SALES_PROPOSAL', 'SALES_FOLLOW_UP'] as const)
        : context.role === 'OFFICE'
          ? ([
              'DOCUMENT_SUMMARY',
              'OFFICE_MINUTES',
              'OFFICE_DOCUMENT',
              'OFFICE_EXCEL',
              'OFFICE_DATA',
            ] as const)
          : context.role === 'MANAGER'
            ? ([
                'MANAGER_PROCESS_REVIEW',
                'MANAGER_IMPROVEMENT',
                'MANAGER_AI_DESIGN',
                'MANAGER_TEAM_GUIDANCE',
                'MANAGER_AI_RULES',
              ] as const)
            : ([
                'EMAIL_WRITING',
                'DOCUMENT_SUMMARY',
                'DOCUMENT_PROOFREAD',
                'IDEA_GENERATION',
              ] as const);
    const nextMission = firstIncomplete(context, roleMissions);
    if (nextMission) return work(nextMission, `ROLE_${context.role}_NEXT_PRACTICE`);
    return wait(new Date(context.now.getTime() + DAY_MS));
  }
}

type Mission = {
  key: TrainingActionKey;
  title: string;
  phaseKey: 'FOUNDATION' | 'PRACTICE' | 'APPLICATION';
  estimatedMinutes: number;
};

const missions: Mission[] = [
  { key: 'AI_BASIC', title: 'AIの基本を知る', phaseKey: 'FOUNDATION', estimatedMinutes: 5 },
  {
    key: 'CHATGPT_BASIC',
    title: 'ChatGPTの基本を試す',
    phaseKey: 'FOUNDATION',
    estimatedMinutes: 5,
  },
  {
    key: 'PROMPT_BASIC',
    title: '指示を分かりやすく書く',
    phaseKey: 'FOUNDATION',
    estimatedMinutes: 5,
  },
  { key: 'PROMPT_CONDITION', title: '条件を指定する', phaseKey: 'FOUNDATION', estimatedMinutes: 5 },
  {
    key: 'PROMPT_FORMAT',
    title: '出力形式を指定する',
    phaseKey: 'FOUNDATION',
    estimatedMinutes: 5,
  },
  { key: 'PROMPT_REVIEW', title: '指示を見直す', phaseKey: 'FOUNDATION', estimatedMinutes: 4 },
  { key: 'EMAIL_WRITING', title: 'メールを作る', phaseKey: 'PRACTICE', estimatedMinutes: 8 },
  { key: 'DOCUMENT_SUMMARY', title: '文章を要約する', phaseKey: 'PRACTICE', estimatedMinutes: 8 },
  { key: 'DOCUMENT_PROOFREAD', title: '文章を整える', phaseKey: 'PRACTICE', estimatedMinutes: 8 },
  { key: 'IDEA_GENERATION', title: 'アイデアを出す', phaseKey: 'PRACTICE', estimatedMinutes: 8 },
  { key: 'SALES_EMAIL', title: '営業メールを作る', phaseKey: 'PRACTICE', estimatedMinutes: 10 },
  {
    key: 'SALES_HEARING',
    title: 'ヒアリングを準備する',
    phaseKey: 'PRACTICE',
    estimatedMinutes: 10,
  },
  {
    key: 'SALES_PROPOSAL',
    title: '提案の骨子を作る',
    phaseKey: 'APPLICATION',
    estimatedMinutes: 12,
  },
  {
    key: 'SALES_FOLLOW_UP',
    title: 'フォロー文を作る',
    phaseKey: 'APPLICATION',
    estimatedMinutes: 8,
  },
  { key: 'OFFICE_MINUTES', title: '議事録を整える', phaseKey: 'PRACTICE', estimatedMinutes: 10 },
  { key: 'OFFICE_DOCUMENT', title: '社内文書を作る', phaseKey: 'PRACTICE', estimatedMinutes: 10 },
  {
    key: 'OFFICE_EXCEL',
    title: 'Excel作業を補助する',
    phaseKey: 'APPLICATION',
    estimatedMinutes: 12,
  },
  { key: 'OFFICE_DATA', title: 'データを整理する', phaseKey: 'APPLICATION', estimatedMinutes: 12 },
  {
    key: 'MANAGER_PROCESS_REVIEW',
    title: '業務を棚卸しする',
    phaseKey: 'PRACTICE',
    estimatedMinutes: 10,
  },
  {
    key: 'MANAGER_IMPROVEMENT',
    title: '業務改善案を作る',
    phaseKey: 'APPLICATION',
    estimatedMinutes: 12,
  },
  {
    key: 'MANAGER_AI_DESIGN',
    title: 'AI活用を設計する',
    phaseKey: 'APPLICATION',
    estimatedMinutes: 12,
  },
  {
    key: 'MANAGER_TEAM_GUIDANCE',
    title: '部下へのAI活用指示を作る',
    phaseKey: 'APPLICATION',
    estimatedMinutes: 12,
  },
  {
    key: 'MANAGER_AI_RULES',
    title: '社内AIルールを作る',
    phaseKey: 'APPLICATION',
    estimatedMinutes: 12,
  },
  { key: 'RECOVERY', title: 'もう一度、小さく始める', phaseKey: 'FOUNDATION', estimatedMinutes: 3 },
  { key: 'WAIT', title: '今日は待つ', phaseKey: 'PRACTICE', estimatedMinutes: 1 },
];

export function createAiTrainingV1Definition(): ProgramDefinitionV1 {
  return {
    schemaVersion: 1,
    duration: { type: 'FIXED_DAYS', days: 30 },
    participation: 'INVITATION_ONLY',
    supportModes: ['GUIDED', 'READY_TO_USE'],
    routes: [{ key: 'PERSONALIZED', label: 'あなたに合ったコース', isDefault: true }],
    phases: [
      {
        key: 'FOUNDATION',
        order: 1,
        label: '基礎',
        title: 'AIの基本を身につける',
        description: '短い課題で、AIへ伝える基本を試します。',
        startDay: 1,
        endDay: 7,
        goals: ['基本の指示を作れる'],
      },
      {
        key: 'PRACTICE',
        order: 2,
        label: '実務練習',
        title: '仕事に近い場面で使う',
        description: '職種に合う小さな実務課題を進めます。',
        startDay: 8,
        endDay: 21,
        goals: ['自分の仕事でAIを使える'],
      },
      {
        key: 'APPLICATION',
        order: 3,
        label: '活用',
        title: 'AI活用を広げる',
        description: 'より実践的な課題へ進みます。',
        startDay: 22,
        endDay: 30,
        goals: ['継続して使う形を作る'],
      },
    ],
    missions: missions.map((mission) => ({
      key: mission.key,
      routeKey: 'PERSONALIZED',
      phaseKey: mission.phaseKey,
      type: 'FIXED' as const,
      title: mission.title,
      capability: 'AI_TRAINING',
      schedule: { type: 'DAY_OF_WEEK' as const, dayOfWeek: 1 },
      estimatedMinutes: mission.estimatedMinutes,
      completionEvent: `${mission.key}_COMPLETED`,
    })),
    notificationPolicy: { cadence: 'DAILY', dormantAfterDays: 7 },
    resultDefinitions: [
      { key: 'FIRST_PRACTICE', label: '最初の研修課題を完了した', eventType: 'MISSION_COMPLETED' },
    ],
  };
}

export * from './runtime';
export * from './line-action';
export * from './learning-catalog';
