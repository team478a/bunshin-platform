export type ImagePilotReadinessItem = {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
  href: '/admin/ai' | '/admin/images' | '/admin/guide';
  actionLabel: string;
};

export function buildImagePilotReadiness(input: {
  now: Date;
  pilot: {
    emergencyStop: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    dailyLimit: number;
    monthlyLimit: number;
    memberMonthlyLimit: number;
  } | null;
  enrolledCount: number;
  provider: {
    apiKeyConfigured: boolean;
    lastVerifiedAt: Date | null;
    globallyPaused: boolean;
    lastErrorCategory: string | null;
  } | null;
  storageConfigured: boolean;
}) {
  const providerReady = Boolean(
    input.provider?.apiKeyConfigured &&
    input.provider.lastVerifiedAt &&
    !input.provider.globallyPaused &&
    !input.provider.lastErrorCategory,
  );
  const periodReady = Boolean(
    input.pilot &&
    (!input.pilot.startsAt || input.pilot.startsAt <= input.now) &&
    (!input.pilot.endsAt || input.pilot.endsAt > input.now),
  );
  const limitsReady = Boolean(
    input.pilot &&
    input.pilot.dailyLimit > 0 &&
    input.pilot.monthlyLimit >= input.pilot.dailyLimit &&
    input.pilot.memberMonthlyLimit > 0 &&
    input.pilot.memberMonthlyLimit <= input.pilot.monthlyLimit,
  );
  const items: ImagePilotReadinessItem[] = [
    {
      key: 'OPENAI',
      label: '画像を作るAIサービス',
      ready: providerReady,
      detail: providerReady
        ? `接続確認済み（${input.provider?.lastVerifiedAt?.toLocaleString('ja-JP')}）`
        : input.provider?.globallyPaused
          ? 'AIサービスが全体停止中です。'
          : input.provider?.lastErrorCategory
            ? '前回の接続確認で問題が見つかりました。'
            : '使用中かつ接続確認済みのOpenAI設定が必要です。',
      href: '/admin/ai',
      actionLabel: 'AI設定を確認する',
    },
    {
      key: 'STORAGE',
      label: '画像の非公開保存先',
      ready: input.storageConfigured,
      detail: input.storageConfigured
        ? '非公開画像を保存するためのサーバー設定があります。'
        : 'SupabaseのURLと管理用鍵をサーバーへ設定してください。鍵は画面へ入力しません。',
      href: '/admin/guide',
      actionLabel: '設定手順を確認する',
    },
    {
      key: 'PILOT',
      label: '試験運用の設定',
      ready: Boolean(input.pilot),
      detail: input.pilot
        ? '使用中の試験設定があります。'
        : '試験グループ、期間、上限を保存してください。',
      href: '/admin/images',
      actionLabel: '試験設定を確認する',
    },
    {
      key: 'EMERGENCY_STOP',
      label: '緊急停止の状態',
      ready: Boolean(input.pilot && !input.pilot.emergencyStop),
      detail: input.pilot?.emergencyStop
        ? '緊急停止中です。問題を解消してから再開してください。'
        : input.pilot
          ? '緊急停止は解除されています。'
          : '試験設定がまだありません。',
      href: '/admin/images',
      actionLabel: '運転状態を確認する',
    },
    {
      key: 'PERIOD',
      label: '利用期間',
      ready: periodReady,
      detail: periodReady
        ? '現在は設定した利用期間内です。'
        : !input.pilot
          ? '試験設定がまだありません。'
          : input.pilot.startsAt && input.pilot.startsAt > input.now
            ? '開始日時前です。'
            : '終了日時を過ぎています。',
      href: '/admin/images',
      actionLabel: '期間を確認する',
    },
    {
      key: 'LIMITS',
      label: '利用回数の上限',
      ready: limitsReady,
      detail: limitsReady
        ? 'グループと参加者の上限が設定されています。'
        : '1日の上限、月間上限、参加者上限の大小関係を確認してください。',
      href: '/admin/images',
      actionLabel: '上限を確認する',
    },
    {
      key: 'ENROLLMENT',
      label: '同意済みの試験参加者',
      ready: input.enrolledCount > 0,
      detail:
        input.enrolledCount > 0
          ? `${input.enrolledCount}人が試験対象です。`
          : '参加同意と画像生成の利用許可がある参加者を1人以上選んでください。',
      href: '/admin/images',
      actionLabel: '参加者を確認する',
    },
  ];
  const blockers = items.filter((item) => !item.ready);
  return { ready: blockers.length === 0, blockerCount: blockers.length, items };
}
