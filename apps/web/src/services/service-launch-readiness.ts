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
  isAiTrainingService?: boolean;
  publishedLegalTypes: string[];
  activeFeatureCount: number;
  activeParticipantCount: number;
  activeKnowledgeCount: number;
  lineConfigurationReady: boolean;
  lineMode?: 'SHARED' | 'DEDICATED' | 'DISABLED';
  linePilotEnabled?: boolean;
  lineRichMenuReady?: boolean;
  generationProviderReady?: boolean;
  commercialContentRequired?: boolean;
  trendResearchEnabled?: boolean;
  trendProviderReady?: boolean;
  activeProductPackCount?: number;
  activeCampaignCount?: number;
  activeTrackingLinkCount?: number;
  businessDailyIdeas?: {
    businessProfileEnabled: boolean;
    deliveryEnabled: boolean;
    cadence: 'DAILY' | 'WEEKDAYS';
    contentMode: 'IDEA' | 'PROMPT' | 'READY_TO_USE';
    mediaMode: 'TEXT_ONLY' | 'IMAGE' | 'VIDEO' | 'IMAGE_AND_VIDEO';
  };
}

export function buildServiceLaunchReadiness(
  input: ServiceLaunchReadinessInput,
): ServiceLaunchReadinessItem[] {
  const base = `/s/${input.serviceSlug}/manage`;
  const businessDailyIdeas = input.businessDailyIdeas;
  const registrationReady = businessDailyIdeas
    ? input.registrationMode !== 'CLOSED' && input.lineEnabled && !input.emailEnabled
    : input.registrationMode !== 'CLOSED' && (input.emailEnabled || input.lineEnabled);
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
      detail: businessDailyIdeas
        ? '企業向け無料はLINEから参加し、毎日の投稿案を受け取ります。'
        : '公開・招待・承認制と、LINEまたはメールの入口を確認します。',
      path: `${base}/settings`,
    },
    {
      key: businessDailyIdeas ? 'BUSINESS_PROFILE' : 'ONBOARDING',
      label: businessDailyIdeas ? '企業情報の登録' : '最初の質問',
      ready: businessDailyIdeas
        ? businessDailyIdeas.businessProfileEnabled
        : input.onboardingQuestionCount > 0,
      detail: businessDailyIdeas
        ? '業種、商品・サービス、対象顧客、発信目的を企業ごとに登録します。'
        : input.isAiTrainingService
          ? '参加者の目標や経験を確認し、AI研修の学習内容を個別に準備するための質問です。'
          : '参加者に合う投稿パートナーを作るための質問です。',
      path: `${base}/settings`,
    },
    ...(businessDailyIdeas
      ? [
          {
            key: 'DAILY_DELIVERY',
            label: '毎日の文章配信',
            ready:
              businessDailyIdeas.deliveryEnabled &&
              ['DAILY', 'WEEKDAYS'].includes(businessDailyIdeas.cadence) &&
              businessDailyIdeas.contentMode === 'READY_TO_USE' &&
              businessDailyIdeas.mediaMode === 'TEXT_ONLY',
            detail:
              '1日1件の完成した投稿文章を届けます。画像・動画の自動生成は初期運用では使用しません。',
            path: `${base}/settings`,
          },
        ]
      : []),
    {
      key: 'LEGAL',
      label: '利用規約とプライバシー',
      ready: legal.has('TERMS') && legal.has('PRIVACY'),
      detail: '公開中の利用規約とプライバシー文書を1件ずつ用意します。',
      path: `${base}/legal`,
    },
    {
      key: 'GENERATION_AI',
      label: '投稿案を作るAI',
      ready: input.generationProviderReady !== false,
      detail:
        input.generationProviderReady === false
          ? '文章作成AIの接続確認をシステム管理者へ依頼します。'
          : '接続確認済みの文章作成AIで投稿案を作れます。',
      path: `${base}`,
    },
    {
      key: 'LINE',
      label: '利用者への連絡方法',
      ready: businessDailyIdeas
        ? input.lineEnabled && input.lineConfigurationReady
        : input.lineEnabled
          ? input.lineConfigurationReady
          : input.emailEnabled,
      detail:
        !input.lineEnabled && businessDailyIdeas
          ? '企業向け無料ではLINEを有効にし、毎日の投稿案を受け取れる状態にします。'
          : input.lineEnabled
            ? input.lineMode === 'DEDICATED'
              ? 'このサービス専用LINEの接続確認・テスト許可・使用開始をそろえます。'
              : input.lineMode === 'DISABLED'
                ? 'サービス設定ではLINEを使います。LINEの使い方を共通または専用へ変更してください。'
                : '確認済みのワタシワークス共通LINEを使用できる状態にします。'
            : '現在はメールで参加できます。LINEは必要になった時に追加できます。',
      path: input.lineEnabled ? `${base}/line` : `${base}/settings`,
    },
    {
      key: 'FEATURES',
      label: '利用できる機能',
      ready: input.activeFeatureCount > 0,
      detail: businessDailyIdeas
        ? '参加者が投稿案を確認、コピー、投稿完了できる機能を許可します。'
        : '参加者が使う投稿・画像・動画などの機能を許可します。',
      path: `${base}/members`,
    },
    ...(businessDailyIdeas
      ? []
      : [
          {
            key: 'KNOWLEDGE',
            label: '公式資料・FAQ',
            ready: input.activeKnowledgeCount > 0,
            detail: 'AIが参照する正しい公式情報を1件以上用意します。',
            path: `${base}/knowledge`,
          },
        ]),
    {
      key: 'PARTICIPANTS',
      label: '一般参加者',
      ready: input.activeParticipantCount > 0,
      detail: '実際に利用する参加者を招待し、利用中にします。',
      path: `${base}/members`,
    },
  ];
  if (input.lineEnabled && input.lineMode === 'DEDICATED') {
    const lineIndex = items.findIndex((item) => item.key === 'LINE');
    items.splice(lineIndex + 1, 0, {
      key: 'LINE_RICH_MENU',
      label: '専用LINEの標準メニュー',
      ready: input.linePilotEnabled === true && input.lineRichMenuReady === true,
      detail:
        input.linePilotEnabled !== true
          ? '専用LINEのテスト利用を有効にしてください。'
          : input.lineRichMenuReady !== true
            ? '接続確認済みの専用LINEへ標準リッチメニューを公開します。'
            : '今日やることなど4つのボタンを専用LINEへ公開済みです。',
      path: `${base}/line`,
    });
  }
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
      path: `${base}/campaigns`,
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
