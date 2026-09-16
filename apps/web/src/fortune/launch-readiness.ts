import type { FortuneOperatorStatus } from './operator';

export interface FortuneLaunchStep {
  key: 'PACKAGE' | 'SERVICE_INFO' | 'TERMS' | 'PRIVACY' | 'LINE';
  title: string;
  description: string;
  ready: boolean;
  href: string;
  actionLabel: string;
}

export function isFortuneLineReady(input: {
  registrationLineEnabled: boolean;
  mode: 'SHARED' | 'DEDICATED' | 'DISABLED';
  sharedLineReadyCount: number;
  dedicatedPilotEnabled: boolean;
  dedicatedLastVerifiedAt: Date | null;
  dedicatedLastErrorCategory: string | null;
  dedicatedGloballyPaused: boolean;
}): boolean {
  if (!input.registrationLineEnabled) return false;
  if (input.mode === 'SHARED') return input.sharedLineReadyCount > 0;
  if (input.mode === 'DISABLED') return false;
  return Boolean(
    input.dedicatedPilotEnabled &&
    input.dedicatedLastVerifiedAt &&
    !input.dedicatedLastErrorCategory &&
    !input.dedicatedGloballyPaused,
  );
}

export function buildFortuneLaunchSteps(
  serviceSlug: string,
  status: FortuneOperatorStatus,
): FortuneLaunchStep[] {
  const base = `/s/${serviceSlug}/manage`;
  return [
    {
      key: 'PACKAGE',
      title: '占いパッケージ',
      description: '占い担当と安全確認済みの標準解釈468件を準備します。',
      ready:
        status.configured &&
        status.bunshinReady &&
        status.approvedMeaningCount === status.requiredMeaningCount,
      href: `${base}/fortune`,
      actionLabel: '占いパッケージを準備する',
    },
    {
      key: 'SERVICE_INFO',
      title: 'ロゴ・問い合わせ先',
      description: '利用者に表示するロゴと、問い合わせを受けるメールアドレスを登録します。',
      ready: status.brandReady,
      href: `${base}/settings`,
      actionLabel: 'サービス情報を設定する',
    },
    {
      key: 'TERMS',
      title: '利用規約',
      description: '参加前に利用者が確認する利用規約を公開します。',
      ready: status.termsReady,
      href: `${base}/legal`,
      actionLabel: '利用規約を設定する',
    },
    {
      key: 'PRIVACY',
      title: 'プライバシーポリシー',
      description: '個人情報の取り扱いを説明する文書を公開します。',
      ready: status.privacyReady,
      href: `${base}/legal`,
      actionLabel: 'プライバシーポリシーを設定する',
    },
    {
      key: 'LINE',
      title: '公式LINE',
      description: '利用者の登録と通知に使うLINEが接続済みか確認します。',
      ready: status.lineReady,
      href: `${base}/line`,
      actionLabel: '公式LINEを確認する',
    },
  ];
}
