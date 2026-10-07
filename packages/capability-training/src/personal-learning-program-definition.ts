import { parseProgramDefinition, type ProgramDefinitionV1 } from '@bunshin/application';
import { getAiTrainingMissionQuality } from './mission-quality';

/** Runtime reference shell, not approved Learning Definitions or a day-based course. */
export function createPersonalLearningProgramDefinition(): ProgramDefinitionV1 {
  return parseProgramDefinition({
    schemaVersion: 1,
    duration: { type: 'OPEN_ENDED' },
    participation: 'INVITATION_ONLY',
    supportModes: ['GUIDED'],
    routes: [{ key: 'PERSONALIZED', label: 'あなたの学習プラン', isDefault: true }],
    // Existing schema requires a display range. Router uses Plan refs, not elapsed days.
    phases: [
      {
        key: 'FOUNDATION',
        order: 1,
        label: '実践',
        title: 'AIへの伝え方を自分で試す',
        description: '目標と学習結果に合わせて、構造・背景・条件の伝え方を学びます。',
        startDay: 1,
        endDay: 1,
        goals: ['目的・背景・条件を自分でAIへ伝え、回答を確認できる'],
      },
    ],
    missions: (['PROMPT_BASIC', 'PROMPT_CONDITION'] as const).map((key) => {
      const mission = getAiTrainingMissionQuality(key);
      if (!mission) throw new Error('Personal Learning Mission reference missing');
      return {
        key,
        routeKey: 'PERSONALIZED',
        phaseKey: 'FOUNDATION',
        type: 'FIXED',
        title: mission.title,
        capability: 'AI_TRAINING',
        schedule: { type: 'DAY_OF_WEEK', dayOfWeek: 1 },
        estimatedMinutes: mission.estimatedMinutes,
        completionEvent: `${key}_COMPLETED`,
      };
    }),
    // Required schema metadata only; Program notifications are disabled at creation.
    notificationPolicy: { cadence: 'DAILY', dormantAfterDays: 7 },
    resultDefinitions: [],
  });
}
