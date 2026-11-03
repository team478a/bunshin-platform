import type { RoadmapDisplay } from '../../../apps/web/app/ui/member-growth-roadmap/data';
export const growthBase = '/api/services/synthetic/bunshins/11111111-1111-4111-8111-111111111111';
const entries = [
  [
    'STEP_1',
    'SNS運用を始める',
    [
      ['INITIAL_SETUP', '初期設定'],
      ['FIRST_GENERATION', '投稿案生成'],
      ['FIRST_DECISION', '投稿案の採用・不採用'],
    ],
  ],
  [
    'STEP_2',
    '継続して利用する',
    [
      ['POST_HISTORY', '投稿履歴確認'],
      ['WEEKLY_PLAN', '週間計画'],
      ['CONTINUED_ACTIVITY', '継続利用'],
    ],
  ],
  [
    'STEP_3',
    '投稿の負担を減らす',
    [
      ['SNS_CONNECTION_GUIDE', 'SNS連携ガイド'],
      ['POST_PREPARATION', '投稿準備支援'],
      ['SCHEDULED_POSTING', '予約投稿'],
    ],
  ],
  [
    'STEP_4',
    '成果を分析する',
    [
      ['SNS_METRICS', 'SNS実績の取得'],
      ['POST_ANALYSIS', '投稿分析'],
      ['APPLY_IMPROVEMENT', '次の投稿への改善反映'],
    ],
  ],
  [
    'STEP_5',
    '自動化を拡張する',
    [
      ['MUSE_GUIDE', 'MUSE活用ガイド'],
      ['ZAPIER_GUIDE', 'Zapier連携ガイド'],
      ['EXTERNAL_AI', '外部AI連携'],
    ],
  ],
] as const;
export function growthRoadmap(): RoadmapDisplay {
  return {
    version: 'member-roadmap-api-v1',
    validReferrals: null,
    definitionVersion: 'hassy-roadmap-v1',
    asOf: '2026-11-02T00:00:00Z',
    timezone: 'Asia/Tokyo',
    currentStageId: 'STEP_1',
    nextRecommended: { stageId: 'STEP_1', milestoneId: 'FIRST_DECISION' },
    stages: entries.map(([id, title, items], index) => ({
      id,
      title,
      status: index === 0 ? 'AVAILABLE' : 'PREPARING',
      progress: {
        completed: index === 0 ? 2 : index === 1 ? 1 : 0,
        total: 3,
        unknown: index === 0 ? 0 : index === 1 ? 2 : 3,
      },
      milestones: items.map(([key, label]) => {
        const complete = ['INITIAL_SETUP', 'FIRST_GENERATION', 'CONTINUED_ACTIVITY'].includes(key);
        const available = key === 'FIRST_DECISION';
        return {
          id: key,
          title: label,
          status: complete ? 'COMPLETED' : available ? 'AVAILABLE' : 'PREPARING',
          achievement: complete ? 'COMPLETED' : available ? 'INCOMPLETE' : 'UNKNOWN',
          availability: { state: available ? 'AVAILABLE' : 'PREPARING' },
          progress: { current: complete ? 1 : available ? 0 : null, target: 1 },
        };
      }),
    })),
  };
}
export const growthUsage = () => ({
  version: 'member-usage-api-v1',
  asOf: '2026-11-02T00:00:00Z',
  timezone: 'Asia/Tokyo',
  allTime: {
    generated: 4,
    unknownTriggerGenerations: 0,
    accepted: 0,
    rejected: 0,
    selfReportedPosts: 0,
    activeDays: 3,
  },
  last7Days: { activeDays: 2 },
  last30Days: { activeDays: 3 },
});
export const growthSnapshot = (roadmap = growthRoadmap(), usage = growthUsage()) => ({
  version: 'member-growth-api-v1',
  roadmap,
  usage,
});
