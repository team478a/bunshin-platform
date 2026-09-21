import type { TrainingRole } from './index';

export const AI_TRAINING_LEARNING_CATALOG_VERSION = 'AI_TRAINING_CATALOG_V1';

export const TRAINING_USE_CASE_KEYS = [
  'NOT_YET',
  'EMAIL',
  'SUMMARY',
  'IDEAS',
  'DOCUMENTS',
  'DATA',
] as const;

export const TRAINING_CHALLENGE_KEYS = [
  'WRITING_TAKES_TIME',
  'SUMMARIZING_IS_HARD',
  'IDEAS_DO_NOT_COME',
  'PROMPTS_ARE_UNCLEAR',
  'OUTPUT_NEEDS_REWORK',
  'DO_NOT_KNOW_WHERE_TO_USE_AI',
] as const;

export const TRAINING_TOPIC_KEYS = [
  'WRITING',
  'SUMMARY',
  'INFORMATION_ORGANIZATION',
  'IDEA_GENERATION',
  'PROMPT_IMPROVEMENT',
  'SALES_EMAIL',
  'SALES_PREPARATION',
  'PROPOSAL',
  'MEETING_MINUTES',
  'EXCEL_SUPPORT',
  'MANUAL_CREATION',
  'BUSINESS_IMPROVEMENT',
  'TEAM_AI_GUIDANCE',
] as const;

export const TRAINING_GOAL_KEYS = [
  'CREATE_SALES_EMAIL',
  'ORGANIZE_MEETING_MINUTES',
  'DRAFT_PROPOSAL',
  'USE_AI_IN_DAILY_WORK',
  'IMPROVE_WORK_WITH_AI',
] as const;

export type TrainingUseCaseKey = (typeof TRAINING_USE_CASE_KEYS)[number];
export type TrainingChallengeKey = (typeof TRAINING_CHALLENGE_KEYS)[number];
export type TrainingTopicKey = (typeof TRAINING_TOPIC_KEYS)[number];
export type TrainingGoalKey = (typeof TRAINING_GOAL_KEYS)[number];

export type TrainingCatalogOption<Key extends string> = {
  key: Key;
  label: string;
  description?: string;
  roles?: readonly TrainingRole[];
};

export const TRAINING_USE_CASES: readonly TrainingCatalogOption<TrainingUseCaseKey>[] = [
  { key: 'NOT_YET', label: 'まだ仕事では使っていない' },
  { key: 'EMAIL', label: 'メール・文章作成' },
  { key: 'SUMMARY', label: '要約・議事録' },
  { key: 'IDEAS', label: 'アイデア出し' },
  { key: 'DOCUMENTS', label: '資料・文書作成' },
  { key: 'DATA', label: 'Excel・データ整理' },
];

export const TRAINING_CHALLENGES: readonly TrainingCatalogOption<TrainingChallengeKey>[] = [
  { key: 'WRITING_TAKES_TIME', label: '文章作成に時間がかかる' },
  { key: 'SUMMARIZING_IS_HARD', label: '要点をまとめるのが難しい' },
  { key: 'IDEAS_DO_NOT_COME', label: 'アイデアが出ない' },
  { key: 'PROMPTS_ARE_UNCLEAR', label: 'AIへの頼み方が分からない' },
  { key: 'OUTPUT_NEEDS_REWORK', label: 'AIの回答を直す手間が多い' },
  { key: 'DO_NOT_KNOW_WHERE_TO_USE_AI', label: '仕事のどこでAIを使えるか分からない' },
];

export const TRAINING_TOPICS: readonly TrainingCatalogOption<TrainingTopicKey>[] = [
  { key: 'WRITING', label: '文章作成' },
  { key: 'SUMMARY', label: '要約' },
  { key: 'INFORMATION_ORGANIZATION', label: '情報整理' },
  { key: 'IDEA_GENERATION', label: 'アイデア出し' },
  { key: 'PROMPT_IMPROVEMENT', label: 'AIへの指示改善' },
  { key: 'SALES_EMAIL', label: '営業メール', roles: ['SALES'] },
  { key: 'SALES_PREPARATION', label: '商談準備', roles: ['SALES'] },
  { key: 'PROPOSAL', label: '提案書', roles: ['SALES', 'MANAGER'] },
  { key: 'MEETING_MINUTES', label: '議事録', roles: ['OFFICE', 'MANAGER'] },
  { key: 'EXCEL_SUPPORT', label: 'Excel補助', roles: ['OFFICE'] },
  { key: 'MANUAL_CREATION', label: 'マニュアル作成', roles: ['OFFICE', 'MANAGER'] },
  { key: 'BUSINESS_IMPROVEMENT', label: '業務改善', roles: ['MANAGER'] },
  { key: 'TEAM_AI_GUIDANCE', label: '部下へのAI活用指示', roles: ['MANAGER'] },
];

export const TRAINING_GOALS: readonly TrainingCatalogOption<TrainingGoalKey>[] = [
  {
    key: 'CREATE_SALES_EMAIL',
    label: '営業メールをAIで作れる',
    description: '相手と目的に合わせた、実際に送れるメールを作ります。',
    roles: ['SALES'],
  },
  {
    key: 'ORGANIZE_MEETING_MINUTES',
    label: '議事録をAIで整理できる',
    description: '決定事項、担当、期限が伝わる形に整理します。',
    roles: ['OFFICE', 'MANAGER'],
  },
  {
    key: 'DRAFT_PROPOSAL',
    label: '提案書の下書きをAIで作れる',
    description: '相手の課題に沿った提案の骨組みを作ります。',
    roles: ['SALES', 'MANAGER'],
  },
  {
    key: 'USE_AI_IN_DAILY_WORK',
    label: '日常業務でAIを使える',
    description: '文章、要約、整理など、毎日の仕事で使える形を作ります。',
  },
  {
    key: 'IMPROVE_WORK_WITH_AI',
    label: '業務改善にAIを使える',
    description: '仕事の手順を見直し、AIを安全に組み込む方法を学びます。',
    roles: ['MANAGER'],
  },
];

export function findTrainingGoal(key: TrainingGoalKey) {
  return TRAINING_GOALS.find((goal) => goal.key === key) ?? null;
}

export function recommendedTrainingGoalKeys(role: TrainingRole): TrainingGoalKey[] {
  return TRAINING_GOALS.filter((goal) => !goal.roles || goal.roles.includes(role)).map(
    ({ key }) => key,
  );
}
