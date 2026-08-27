import type {
  AiProviderConfiguration,
  VideoDisclosurePolicy,
  VideoPlatform,
} from '@bunshin/application';

const requiredPlatforms = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE_SHORTS'] as const;

export type VideoReadinessItem = {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
  href: '/admin/ai' | '/admin/videos/disclosures';
  actionLabel: string;
};

const platformLabels: Record<VideoPlatform, string> = {
  INSTAGRAM: 'インスタグラム',
  TIKTOK: 'TikTok',
  YOUTUBE_SHORTS: 'YouTube ショート',
};

export function buildVideoReadiness(input: {
  configurations: AiProviderConfiguration[];
  disclosurePolicies: VideoDisclosurePolicy[];
}) {
  const creatomate = input.configurations.find(
    (configuration) => configuration.provider === 'CREATOMATE' && configuration.status === 'ACTIVE',
  );
  const providerReady = Boolean(
    creatomate?.apiKeyConfigured &&
    creatomate.lastVerifiedAt &&
    !creatomate.globallyPaused &&
    !creatomate.lastErrorCategory,
  );
  const items: VideoReadinessItem[] = [
    {
      key: 'CREATOMATE',
      label: '動画を完成させるサービス',
      ready: providerReady,
      detail: providerReady
        ? `接続確認済み（${creatomate?.lastVerifiedAt?.toLocaleString('ja-JP')}）`
        : creatomate?.globallyPaused
          ? '全体停止中です。設定を確認してください。'
          : creatomate?.lastErrorCategory
            ? '前回の接続確認で問題が見つかりました。'
            : '使用中かつ接続確認済みの設定が必要です。',
      href: '/admin/ai',
      actionLabel: '接続設定を確認する',
    },
    ...requiredPlatforms.map((platform) => {
      const policy = input.disclosurePolicies.find(
        (candidate) => candidate.platform === platform && candidate.status === 'ACTIVE',
      );
      return {
        key: `DISCLOSURE_${platform}`,
        label: `${platformLabels[platform]}のAI利用表示`,
        ready: Boolean(policy),
        detail: policy ? `第${policy.version}版を使用中です。` : '使用中の表示ルールがありません。',
        href: '/admin/videos/disclosures' as const,
        actionLabel: '表示ルールを確認する',
      };
    }),
  ];
  const blockers = items.filter((item) => !item.ready);
  return { ready: blockers.length === 0, items, blockerCount: blockers.length };
}
