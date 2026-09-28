export const TRAINING_BARRIER_REASONS = [
  'BUSY',
  'TOO_DIFFICULT',
  'NOT_RELEVANT',
  'DONT_KNOW_HOW',
  'LOW_VALUE',
  'OTHER',
] as const;

export type TrainingBarrierReason = (typeof TRAINING_BARRIER_REASONS)[number];
export type TrainingMissionVariant = 'STANDARD' | 'SHORT';
export type TrainingPracticeMode = 'PRACTICE' | 'WORK';

export interface TrainingBarrierAdjustment {
  missionVariant: TrainingMissionVariant;
  difficulty?: 'EASY';
  goalReviewRecommended: boolean;
  guidance: string;
}

export const TRAINING_BARRIER_REASON_LABELS: Record<TrainingBarrierReason, string> = {
  BUSY: '忙しい',
  TOO_DIFFICULT: '難しい',
  NOT_RELEVANT: '仕事に関係ない',
  DONT_KNOW_HOW: '操作が分からない',
  LOW_VALUE: '必要性を感じない',
  OTHER: 'その他',
};

export function resolveTrainingBarrierAdjustment(
  reason: TrainingBarrierReason,
): TrainingBarrierAdjustment {
  switch (reason) {
    case 'BUSY':
      return {
        missionVariant: 'SHORT',
        goalReviewRecommended: false,
        guidance: '1分版に切り替えました。要点を1つだけ試せば完了です。',
      };
    case 'TOO_DIFFICULT':
      return {
        missionVariant: 'SHORT',
        difficulty: 'EASY',
        goalReviewRecommended: false,
        guidance: '難易度を下げた1分版に切り替えました。例をまねして進めてください。',
      };
    case 'DONT_KNOW_HOW':
      return {
        missionVariant: 'SHORT',
        difficulty: 'EASY',
        goalReviewRecommended: false,
        guidance: '操作を確認しやすい1分版に切り替えました。ヒントも利用できます。',
      };
    case 'NOT_RELEVANT':
      return {
        missionVariant: 'STANDARD',
        goalReviewRecommended: true,
        guidance: '仕事とのずれを減らすため、学習目標を見直せます。',
      };
    case 'LOW_VALUE':
      return {
        missionVariant: 'STANDARD',
        goalReviewRecommended: true,
        guidance: '必要性に合う課題へ近づけるため、学習目標を見直せます。',
      };
    case 'OTHER':
      return {
        missionVariant: 'STANDARD',
        goalReviewRecommended: false,
        guidance: '困っているときはヒントか「助けが必要」を利用できます。',
      };
  }
}

export const isTrainingBarrierReason = (value: unknown): value is TrainingBarrierReason =>
  TRAINING_BARRIER_REASONS.includes(value as TrainingBarrierReason);
