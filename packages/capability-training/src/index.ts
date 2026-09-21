import {
  defineNextActionDecision,
  type NextActionDecision,
  type NextActionPolicy,
  type ProgramDefinitionV1,
} from '@bunshin/application';
import { AI_TRAINING_MISSION_QUALITY } from './mission-quality';
import type { TrainingGoalKey } from './learning-catalog';

export const AI_TRAINING_V1_RULE_VERSION = 'AI_TRAINING_V1_RULES_3';
export const AI_TRAINING_V1_MODULE_KEY = 'AI_TRAINING_V1';
export const TRAINING_ROLES = ['SALES', 'OFFICE', 'MANAGER', 'OTHER'] as const;
export const TRAINING_AI_LEVELS = ['BEGINNER', 'INTERMEDIATE'] as const;
export const TRAINING_INTERACTION_TYPES = [
  'HINT_VIEWED',
  'HELP_REQUESTED',
  'TRAINING_POSTPONED',
] as const;
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
export type TrainingInteractionType = (typeof TRAINING_INTERACTION_TYPES)[number];
export type TrainingActionKey = (typeof TRAINING_ACTION_KEYS)[number];

export interface AiTrainingV1DecisionContext {
  now: Date;
  role: TrainingRole;
  aiLevel: TrainingAiLevel;
  learningGoalKey: TrainingGoalKey | null;
  currentPhase: 'FOUNDATION' | 'PRACTICE' | 'APPLICATION';
  completedMissionKeys: readonly string[];
  completedMissionCount: number;
  recentSuccesses: number;
  recentFailures: number;
  needsReview: boolean;
  lastMissionKey: string | null;
  streak: number;
  bottleneckKey: string | null;
  skillScores: Readonly<Record<string, number>>;
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

const reviewMission = (context: AiTrainingV1DecisionContext) => {
  const previous = context.lastMissionKey
    ? AI_TRAINING_MISSION_QUALITY.find(({ key }) => key === context.lastMissionKey)
    : null;
  return previous?.reviewMissionKey ?? 'PROMPT_REVIEW';
};

const goalMission = (
  context: AiTrainingV1DecisionContext,
): Exclude<TrainingActionKey, 'WAIT'> | null => {
  if (context.learningGoalKey === 'CREATE_SALES_EMAIL' && context.role === 'SALES')
    return 'SALES_EMAIL';
  if (
    context.learningGoalKey === 'ORGANIZE_MEETING_MINUTES' &&
    ['OFFICE', 'MANAGER'].includes(context.role)
  )
    return 'OFFICE_MINUTES';
  if (context.learningGoalKey === 'DRAFT_PROPOSAL' && ['SALES', 'MANAGER'].includes(context.role))
    return 'SALES_PROPOSAL';
  if (context.learningGoalKey === 'IMPROVE_WORK_WITH_AI' && context.role === 'MANAGER')
    return 'MANAGER_PROCESS_REVIEW';
  return null;
};

export class AiTrainingV1Policy implements NextActionPolicy<AiTrainingV1DecisionContext> {
  evaluate(context: AiTrainingV1DecisionContext): NextActionDecision {
    if (context.activeWaitUntil && context.activeWaitUntil > context.now)
      return wait(context.activeWaitUntil);
    if (!Number.isInteger(context.pauseAfterDays) || context.pauseAfterDays < 1)
      throw new Error('pauseAfterDays must be a positive integer');
    const baseline = context.lastActionAt ?? context.activityBaselineAt;
    if (context.now.getTime() - baseline.getTime() >= context.pauseAfterDays * DAY_MS)
      return work('RECOVERY', 'USER_ACTIVITY_PAUSED');
    if (context.needsReview || context.recentFailures > 0)
      return work(reviewMission(context), 'PREVIOUS_MISSION_REQUIRES_REVIEW');
    if (!completed(context, 'AI_BASIC')) return work('AI_BASIC', 'AI_FOUNDATION_NOT_COMPLETED');
    if (!completed(context, 'CHATGPT_BASIC'))
      return work('CHATGPT_BASIC', 'CHATGPT_FOUNDATION_NOT_COMPLETED');
    if (context.aiLevel === 'BEGINNER' && !completed(context, 'PROMPT_BASIC'))
      return work('PROMPT_BASIC', 'BEGINNER_PROMPT_FOUNDATION_REQUIRED');
    if (!completed(context, 'PROMPT_CONDITION'))
      return work('PROMPT_CONDITION', 'PROMPT_CONDITIONS_REQUIRED');
    if (!completed(context, 'PROMPT_FORMAT'))
      return work('PROMPT_FORMAT', 'PROMPT_FORMAT_REQUIRED');
    const selectedForGoal = goalMission(context);
    if (selectedForGoal && !completed(context, selectedForGoal))
      return work(selectedForGoal, 'LEARNING_GOAL_PRIORITY');
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
    missions: AI_TRAINING_MISSION_QUALITY.map((mission) => ({
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
export * from './mission-quality';
export * from './skill-evaluation';
export * from './growth';
