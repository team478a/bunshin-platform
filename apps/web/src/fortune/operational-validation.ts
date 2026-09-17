import type { FortuneOperationsQuality, FortuneOperatorStatus } from './operator';

export type FortuneOperationalValidationKey =
  'PUBLICATION' | 'REGISTRATION' | 'READING' | 'VIEWING' | 'FEEDBACK';

export interface FortuneOperationalValidationItem {
  key: FortuneOperationalValidationKey;
  title: string;
  description: string;
  complete: boolean;
  required: boolean;
  href: string;
  actionLabel: string;
}

export interface FortuneOperationalValidation {
  items: FortuneOperationalValidationItem[];
  requiredComplete: number;
  requiredTotal: number;
  recommendedComplete: number;
  recommendedTotal: number;
  ready: boolean;
}

export function buildFortuneOperationalValidation(
  serviceSlug: string,
  status: Pick<FortuneOperatorStatus, 'enabled' | 'registeredParticipants'>,
  quality: FortuneOperationsQuality | null,
): FortuneOperationalValidation {
  const base = `/s/${serviceSlug}`;
  const items: FortuneOperationalValidationItem[] = [
    {
      key: 'PUBLICATION',
      title: '占いを公開する',
      description: '公開準備5項目を完了し、利用者が占い画面を開ける状態にします。',
      complete: status.enabled,
      required: true,
      href: `${base}/manage/fortune`,
      actionLabel: '公開設定を確認する',
    },
    {
      key: 'REGISTRATION',
      title: 'テスト利用者が登録する',
      description:
        '運営者とは別のテスト利用者で、公開した登録導線から参加し、18歳以上の確認を完了します。',
      complete: status.registeredParticipants > 0,
      required: true,
      href: base,
      actionLabel: '利用者画面を開く',
    },
    {
      key: 'READING',
      title: '今日の占いを1件作る',
      description: 'テスト利用者がテーマを選び、占い結果が最後まで表示されることを確認します。',
      complete: (quality?.readingCount ?? 0) > 0,
      required: true,
      href: `${base}/today`,
      actionLabel: '今日の占いを開く',
    },
    {
      key: 'VIEWING',
      title: '結果を開いて履歴を確認する',
      description: '結果詳細を開き、過去の結果から同じ内容を確認できることを確かめます。',
      complete: (quality?.viewedReaders ?? 0) > 0,
      required: true,
      href: `${base}/history`,
      actionLabel: '過去の結果を開く',
    },
    {
      key: 'FEEDBACK',
      title: '結果への評価を1件送る',
      description: '「参考になった」などを選び、運用品質の回答数へ反映されることを確認します。',
      complete: (quality?.feedbackCount ?? 0) > 0,
      required: false,
      href: `${base}/history`,
      actionLabel: '結果を評価する',
    },
  ];
  const required = items.filter((item) => item.required);
  const recommended = items.filter((item) => !item.required);
  const requiredComplete = required.filter((item) => item.complete).length;
  const recommendedComplete = recommended.filter((item) => item.complete).length;
  return {
    items,
    requiredComplete,
    requiredTotal: required.length,
    recommendedComplete,
    recommendedTotal: recommended.length,
    ready: requiredComplete === required.length,
  };
}
