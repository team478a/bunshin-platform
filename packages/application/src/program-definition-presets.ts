import { BUSINESS_GROWTH_ACTION_KINDS } from './business-growth-actions';
import {
  BUSINESS_GROWTH_PROGRAM_LENGTH_DAYS,
  BUSINESS_GROWTH_PROGRAM_PHASES,
} from './business-growth-program';
import type { ProgramDefinitionPreset, ProgramDefinitionV1 } from './program-definition';

const actionByPhase = {
  FOUNDATION: [
    'REST',
    'PROFILE_IMPROVEMENT',
    'CUSTOMER_QUESTION',
    'PROFILE_IMPROVEMENT',
    'CUSTOMER_QUESTION',
    'PROFILE_IMPROVEMENT',
    'RESULT_REVIEW',
  ],
  START_POSTING: ['REST', 'PHOTO', 'CUSTOMER_QUESTION', 'POST', 'PHOTO', 'POST', 'RESULT_REVIEW'],
  BUILD_RESPONSE: [
    'REST',
    'COMMENT_REPLY',
    'CUSTOMER_QUESTION',
    'POST',
    'COMMENT_REPLY',
    'CUSTOMER_QUESTION',
    'RESULT_REVIEW',
  ],
  ESTABLISH_PATTERN: [
    'REST',
    'RESULT_REVIEW',
    'CUSTOMER_QUESTION',
    'POST',
    'COMMENT_REPLY',
    'RESULT_REVIEW',
    'RESULT_REVIEW',
  ],
} as const;

const actionLabels = {
  POST: '投稿する',
  PHOTO: '写真を1枚撮る',
  COMMENT_REPLY: 'コメントやメッセージへ返信する',
  CUSTOMER_QUESTION: 'お客様の質問を1つ残す',
  PROFILE_IMPROVEMENT: 'プロフィールを1か所整える',
  RESULT_REVIEW: '今週の反応を確認する',
  REST: '休み、次の題材を1つだけメモする',
} as const;

const completionEvents = {
  POST: 'CONTENT_PUBLISHED',
  PHOTO: 'PHOTO_SAVED',
  COMMENT_REPLY: 'CUSTOMER_REPLIED',
  CUSTOMER_QUESTION: 'CUSTOMER_QUESTION_SAVED',
  PROFILE_IMPROVEMENT: 'PROFILE_UPDATED',
  RESULT_REVIEW: 'RESULT_REVIEWED',
  REST: 'REST_CONFIRMED',
} as const;

const minutes = {
  POST: 10,
  PHOTO: 5,
  COMMENT_REPLY: 5,
  CUSTOMER_QUESTION: 3,
  PROFILE_IMPROVEMENT: 5,
  RESULT_REVIEW: 5,
  REST: 1,
} as const;

type SupportMode = ProgramDefinitionV1['supportModes'][number];

export function createProgramDefinition(input: {
  preset: ProgramDefinitionPreset;
  durationDays: number;
  supportModes: SupportMode[];
}): ProgramDefinitionV1 {
  if (input.preset === 'SIDE_HUSTLE_90_DAY') {
    return {
      schemaVersion: 1,
      duration: { type: 'FIXED_DAYS', days: BUSINESS_GROWTH_PROGRAM_LENGTH_DAYS },
      participation: 'INVITATION_ONLY',
      supportModes: input.supportModes,
      routes: [{ key: 'STANDARD', label: '標準コース', isDefault: true }],
      phases: BUSINESS_GROWTH_PROGRAM_PHASES.map((phase, index) => ({
        ...phase,
        order: index + 1,
        goals: [...phase.goals],
      })),
      missions: BUSINESS_GROWTH_PROGRAM_PHASES.flatMap((phase) =>
        actionByPhase[phase.key].map((kind, dayOfWeek) => ({
          key: `${phase.key}_${kind}_${dayOfWeek}`,
          routeKey: 'STANDARD',
          phaseKey: phase.key,
          type: kind === 'POST' ? ('TEMPLATE' as const) : ('FIXED' as const),
          title: actionLabels[kind],
          capability: kind === 'POST' ? 'SOCIAL_MISSION' : 'DAILY_ACTION',
          schedule: { type: 'DAY_OF_WEEK' as const, dayOfWeek },
          estimatedMinutes: minutes[kind],
          completionEvent: completionEvents[kind],
        })),
      ),
      notificationPolicy: { cadence: 'DAILY', dormantAfterDays: 14 },
      resultDefinitions: [
        { key: 'MARKET', label: '投稿・案内を行った', eventType: 'CONTENT_PUBLISHED' },
        {
          key: 'RESPONSE',
          label: 'お客様から反応があった',
          eventType: 'CUSTOMER_RESPONSE_RECORDED',
        },
        {
          key: 'RESULT',
          label: '問い合わせ・申込みにつながった',
          eventType: 'BUSINESS_RESULT_RECORDED',
        },
        { key: 'REPEAT', label: '成果が2回以上発生した', eventType: 'BUSINESS_RESULT_REPEATED' },
      ],
    };
  }

  const actions = BUSINESS_GROWTH_ACTION_KINDS;
  return {
    schemaVersion: 1,
    duration: { type: 'FIXED_DAYS', days: input.durationDays },
    participation: 'INVITATION_ONLY',
    supportModes: input.supportModes,
    routes: [{ key: 'STANDARD', label: '標準コース', isDefault: true }],
    phases: [
      {
        key: 'PRACTICE',
        order: 1,
        label: '実践する',
        title: '毎日の小さな行動を続ける',
        description: '無理のない行動を一つずつ進めます。',
        startDay: 1,
        endDay: input.durationDays,
        goals: ['期間中に毎日の行動を続ける'],
      },
    ],
    missions: actions.map((kind, dayOfWeek) => ({
      key: `PRACTICE_${kind}_${dayOfWeek}`,
      routeKey: 'STANDARD',
      phaseKey: 'PRACTICE',
      type: kind === 'POST' ? ('TEMPLATE' as const) : ('FIXED' as const),
      title: actionLabels[kind],
      capability: kind === 'POST' ? 'SOCIAL_MISSION' : 'DAILY_ACTION',
      schedule: { type: 'DAY_OF_WEEK' as const, dayOfWeek },
      estimatedMinutes: minutes[kind],
      completionEvent: completionEvents[kind],
    })),
    notificationPolicy: { cadence: 'DAILY', dormantAfterDays: 14 },
    resultDefinitions: [],
  };
}
