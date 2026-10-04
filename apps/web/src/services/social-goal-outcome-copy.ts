import type { SocialAccountStrategyGoal } from '@bunshin/capability-social';
import type { SocialGoalOutcomeResult } from './social-goal-outcomes';

type GoalOutcomeOption = {
  result: SocialGoalOutcomeResult;
  label: string;
};

type GoalOutcomeCopy = {
  question: string;
  description: string;
  options: readonly GoalOutcomeOption[];
};

const commonDescription =
  '投稿の好みとは別の回答です。自動計測ではないため、実際に確認できた範囲で選んでください。';

const defaultOptions = [
  { result: 'ACHIEVED', label: '目的につながった' },
  { result: 'SOME_PROGRESS', label: '手応えがあった' },
  { result: 'NO_CHANGE', label: '変化はなかった' },
  { result: 'UNKNOWN', label: 'まだ分からない' },
] as const;

const goalSpecificCopy: Partial<Record<SocialAccountStrategyGoal, GoalOutcomeCopy>> = {
  BRAND_AWARENESS: {
    question: 'この投稿で、新しく知ってもらえた反応はありましたか？',
    description: commonDescription,
    options: [
      { result: 'ACHIEVED', label: '新しい人から反応があった' },
      { result: 'SOME_PROGRESS', label: '閲覧・フォローなどに手応えがあった' },
      { result: 'NO_CHANGE', label: '目立った変化はなかった' },
      { result: 'UNKNOWN', label: 'まだ分からない' },
    ],
  },
  RECRUIT: {
    question: 'この投稿は、応募・見学・採用への関心につながりましたか？',
    description: commonDescription,
    options: [
      { result: 'ACHIEVED', label: '応募・見学の連絡があった' },
      { result: 'SOME_PROGRESS', label: '採用について質問・反応があった' },
      { result: 'NO_CHANGE', label: '目立った変化はなかった' },
      { result: 'UNKNOWN', label: 'まだ分からない' },
    ],
  },
  TRUST_EXPERTISE: {
    question: 'この投稿で、信頼や専門性が伝わった反応はありましたか？',
    description: commonDescription,
    options: [
      { result: 'ACHIEVED', label: '相談・依頼につながった' },
      { result: 'SOME_PROGRESS', label: '保存・詳しい質問などがあった' },
      { result: 'NO_CHANGE', label: '目立った変化はなかった' },
      { result: 'UNKNOWN', label: 'まだ分からない' },
    ],
  },
};

export function socialGoalOutcomeCopy(
  goal: SocialAccountStrategyGoal,
  goalLabel: string,
): GoalOutcomeCopy {
  return (
    goalSpecificCopy[goal] ?? {
      question: `今回の目的「${goalLabel}」にはつながりましたか？`,
      description: commonDescription,
      options: defaultOptions,
    }
  );
}
