export interface ServiceLaunchReadinessItem {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
  path: string;
}

export interface ServiceLaunchReadinessInput {
  serviceSlug: string;
  operatorName: string;
  contactEmail: string | null;
  registrationMode: 'PUBLIC' | 'INVITATION_ONLY' | 'APPROVAL_REQUIRED' | 'CLOSED';
  emailEnabled: boolean;
  lineEnabled: boolean;
  onboardingQuestionCount: number;
  publishedLegalTypes: string[];
  activeFeatureCount: number;
  activeParticipantCount: number;
  activeKnowledgeCount: number;
  lineConfigurationReady: boolean;
  commercialContentRequired?: boolean;
  trendResearchEnabled?: boolean;
  trendProviderReady?: boolean;
  activeProductPackCount?: number;
  activeCampaignCount?: number;
  activeTrackingLinkCount?: number;
}

export function buildServiceLaunchReadiness(
  input: ServiceLaunchReadinessInput,
): ServiceLaunchReadinessItem[] {
  const base = `/s/${input.serviceSlug}/manage`;
  const registrationReady =
    input.registrationMode !== 'CLOSED' && (input.emailEnabled || input.lineEnabled);
  const legal = new Set(input.publishedLegalTypes);
  const items: ServiceLaunchReadinessItem[] = [
    {
      key: 'BASIC',
      label: 'サービスの基本情報',
      ready: input.operatorName.trim().length > 0 && Boolean(input.contactEmail),
      detail: '運営者と問い合わせ先を利用者へ案内します。',
      path: `${base}/settings`,
    },
    {
      key: 'REGISTRATION',
      label: '参加方法',
      ready: registrationReady,
      detail: '公開・招待・承認制と、LINEまたはメールの入口を確認します。',
      path: `${base}/settings`,
    },
    {
      key: 'ONBOARDING',
      label: '最初の質問',
      ready: input.onboardingQuestionCount > 0,
      detail: '参加者に合う投稿パートナーを作るための質問です。',
      path: `${base}/settings`,
    },
    {
      key: 'LEGAL',
      label: '利用規約とプライバシー',
      ready: legal.has('TERMS') && legal.has('PRIVACY'),
      detail: '公開中の利用規約とプライバシー文書を1件ずつ用意します。',
      path: `${base}/legal`,
    },
    {
      key: 'LINE',
      label: '利用者への連絡方法',
      ready: input.lineEnabled ? input.lineConfigurationReady : input.emailEnabled,
      detail: input.lineEnabled
        ? 'この環境で確認済みのLINE設定を使用できる状態にします。'
        : '現在はメールで参加できます。LINEは必要になった時に追加できます。',
      path: input.lineEnabled ? `${base}/line` : `${base}/settings`,
    },
    {
      key: 'FEATURES',
      label: '利用できる機能',
      ready: input.activeFeatureCount > 0,
      detail: '参加者が使う投稿・画像・動画などの機能を許可します。',
      path: `${base}/members`,
    },
    {
      key: 'KNOWLEDGE',
      label: '公式資料・FAQ',
      ready: input.activeKnowledgeCount > 0,
      detail: 'AIが参照する正しい公式情報を1件以上用意します。',
      path: `${base}/knowledge`,
    },
    {
      key: 'PARTICIPANTS',
      label: '一般参加者',
      ready: input.activeParticipantCount > 0,
      detail: '実際に利用する参加者を招待し、利用中にします。',
      path: `${base}/members`,
    },
  ];
  if (!input.commercialContentRequired) return items;
  items.splice(
    6,
    0,
    {
      key: 'TREND_RESEARCH',
      label: '新しい話題の調査',
      ready: input.trendResearchEnabled === true && input.trendProviderReady === true,
      detail:
        input.trendResearchEnabled !== true
          ? 'サービス設定で話題調査を使用するようにします。'
          : input.trendProviderReady !== true
            ? '話題調査サービスの接続確認をシステム管理者へ依頼します。'
            : '確認済みの話題調査サービスから、投稿案へ新しい情報を反映します。',
      path: `${base}/settings`,
    },
    {
      key: 'PRODUCT',
      label: '紹介する商品・活動',
      ready: (input.activeProductPackCount ?? 0) > 0,
      detail: '公開済みの商品情報、必須表示、避ける表現を用意します。',
      path: `${base}/product-packs`,
    },
    {
      key: 'CAMPAIGN',
      label: '参加できる投稿企画',
      ready: (input.activeCampaignCount ?? 0) > 0,
      detail: '現在の期間内で参加できる商品投稿企画を1件以上公開します。',
      path: `${base}/product-packs`,
    },
    {
      key: 'TRACKING_LINK',
      label: '投稿へ入れる専用URL',
      ready: (input.activeTrackingLinkCount ?? 0) > 0,
      detail: '利用中の商品別・参加者別URLを用意し、投稿案へ安全に差し込みます。',
      path: `${base}/external-tracking`,
    },
  );
  return items;
}
