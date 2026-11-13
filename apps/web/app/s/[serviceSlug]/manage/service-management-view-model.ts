export const serviceManagementSections = [
  {
    title: '利用記録と改善の確認',
    description: 'SNS・研修の保存記録を範囲表示で確認します。少人数や欠測は未判定です。',
    href: 'improvement-overview',
  },
  {
    title: 'SNSの困った報告',
    description: '本人の報告を読み取り専用で確認します。少人数・不完全な集計は保留します。',
    href: 'improvement-feedback',
  },
  {
    title: '90日集客レポート',
    description: '参加者ごとの投稿、ポイント、集客成果、SNSの変化を確認します。',
    href: '90-day-report',
  },
  {
    title: '週次レポート',
    description: '今週の利用状況と、声かけが役立ちそうな参加者を確認します。',
    href: 'weekly-report',
  },
  {
    title: '個別化の確認',
    description: '参加者ごとに、どの情報を根拠に投稿案が作られたかと生成経路を確認します。',
    href: 'personalization',
  },
  {
    title: '参加者・運営者と利用権限',
    description: '参加者の招待、運営担当者の役割、参加者ごとの「利用する・停止する」を管理します。',
    href: 'members',
  },
  {
    title: '公式情報・ナレッジ',
    description: 'PDF、動画、URL、よくある質問など、サービスで使う公式情報を登録します。',
    href: 'knowledge',
  },
  {
    title: '商品・活動情報',
    description: '紹介する商品、必須表示、避ける表現、キャンペーンを準備します。',
    href: 'product-packs',
  },
  {
    title: '発信企画（参加募集）',
    description: '商品・イベントの企画を公開し、参加状況と投稿の流れを確認します。',
    href: 'campaigns',
  },
  {
    title: '専用URL',
    description: '参加者別・商品別の紹介URLを登録し、投稿案へ安全に差し込みます。',
    href: 'external-tracking',
  },
  {
    title: '商品投稿の確認',
    description: '商品・キャンペーン投稿を、コピー前に確認するか設定します。',
    href: 'post-approvals',
  },
  {
    title: '公式LINE',
    description: 'このサービス専用の公式LINE、通知時間、接続状態を設定します。',
    href: 'line',
  },
  {
    title: '登録完了メール',
    description: '登録後の案内文、送信者、返信先、自社メール配信を設定します。',
    href: 'email',
  },
  {
    title: '配信テンプレート',
    description: 'メールとLINEの案内文を用途別に保存し、配信準備に使います。',
    href: 'templates',
  },
  {
    title: 'ポイントとバッジ',
    description: 'ポイント数や獲得条件を決め、参加者へのボーナスとバッジを管理します。',
    href: 'points',
  },
  {
    title: '紹介特典',
    description: '紹介で参加した人の行動に応じて、画像作成回数を渡す条件を設定します。',
    href: 'referral-rewards',
  },
  {
    title: '紹介の審査・確定',
    description: '有効紹介の条件、重複などの審査、確定と取消を管理します。',
    href: 'referrals',
  },
  {
    title: '画像作成回数',
    description: '参加者ごとに画像作成に使える回数を付与・減額し、理由を残します。',
    href: 'credits',
  },
  {
    title: '画像生成の利用状況',
    description: '画像生成の完成・採用・失敗の件数を、参加者ごとに確認します。',
    href: 'image-operations',
  },
  {
    title: '実践プログラム',
    description: '参加者に提供するコースや、選べる支援内容を管理します。',
    href: 'programs',
  },
  {
    title: 'AI研修の進み具合',
    description: '受講者の進捗、現在の課題、苦手領域、最終実施日を確認します。',
    href: 'training',
  },
  {
    title: '動画生成の状況',
    description: 'このサービス内で作られている動画とAI場面の進み具合を確認します。',
    href: 'video-operations',
  },
  {
    title: '個別動画の確認依頼',
    description: '完成した個別動画を、対象の参加者だけが確認・採用できる状態にします。',
    href: 'video-deliveries',
  },
  {
    title: 'サービスの見た目・登録',
    description: '名前、ロゴ、色、参加方法など、利用者に見える内容を設定します。',
    href: 'settings',
  },
  {
    title: '利用規約・プライバシー',
    description: '参加者が確認する利用規約とプライバシーポリシーを管理します。',
    href: 'legal',
  },
  {
    title: '占いの公開準備',
    description: 'カード解釈の完全性と安全性を確認し、占い機能の公開・停止を管理します。',
    href: 'fortune',
  },
  {
    title: 'SNS支援提案の設定',
    description: '本部の許可範囲で、提案対象・判定件数・見送り後の抑制日数を管理します。',
    href: 'recommendations',
  },
] as const;

export type OperationAction = {
  title: string;
  detail: string;
  href?: string;
  label?: string;
};

export function buildServiceOperationActions(input: {
  serviceSlug: string;
  lineEnabled: boolean;
  lineMode: 'SHARED' | 'DEDICATED' | 'DISABLED';
  sharedLineReadyCount: number;
  dedicatedLinePilotEnabled: boolean;
  dedicatedLine:
    | {
        lastVerifiedAt: Date | null;
        lastErrorCategory: string | null;
        globallyPaused: boolean;
      }
    | undefined;
  dedicatedLineReady: boolean;
  dedicatedRichMenuPublishCount: number;
  failedLineDeliveries: number;
  overdueLineDeliveries: number;
  businessDailyService: boolean;
  pendingPostApprovalCount: number;
  missingLinkWarning: string | null;
  feedbackSummary: {
    needsAttention: boolean;
    posted: number;
    rated: number;
  };
  knowledgeReviewCount: number;
  knowledgeFailedCount: number;
  failedVideoRenders: number;
  failedAiCalls: number;
}): OperationAction[] {
  const {
    serviceSlug,
    lineEnabled,
    lineMode,
    sharedLineReadyCount,
    dedicatedLinePilotEnabled,
    dedicatedLine: line,
    dedicatedLineReady,
    dedicatedRichMenuPublishCount,
    failedLineDeliveries,
    overdueLineDeliveries,
    businessDailyService: isBusinessDailyService,
    pendingPostApprovalCount,
    missingLinkWarning,
    feedbackSummary,
    knowledgeReviewCount,
    knowledgeFailedCount,
    failedVideoRenders,
    failedAiCalls,
  } = input;
  const lineOperationActions: OperationAction[] = [];
  if (lineEnabled && lineMode === 'DISABLED') {
    lineOperationActions.push({
      title: 'LINEを使う設定と配信停止が矛盾しています',
      detail:
        '参加方法ではLINEを使用します。公式LINE画面で共通LINEまたは専用LINEを選んでください。',
      href: `/s/${serviceSlug}/manage/line`,
      label: 'LINEの使い方を確認する',
    });
  } else if (lineEnabled && lineMode === 'SHARED' && sharedLineReadyCount === 0) {
    lineOperationActions.push({
      title: '共通LINEを利用できません',
      detail:
        'システム側の共通LINE設定に接続確認または再開が必要です。システム管理者へ連絡してください。',
    });
  } else if (lineMode === 'DEDICATED' && line === undefined) {
    lineOperationActions.push({
      title: '公式LINEの準備ができていません',
      detail:
        '参加者へのLINE通知はまだ利用できません。サービス専用の公式LINEを登録して接続確認してください。',
      href: `/s/${serviceSlug}/manage/line`,
      label: '公式LINEを設定する',
    });
  } else if (lineMode === 'DEDICATED' && !dedicatedLinePilotEnabled) {
    lineOperationActions.push({
      title: '専用LINEのテスト利用が無効です',
      detail: '公式LINE画面で専用LINEを選び直し、テスト利用を有効にしてください。',
      href: `/s/${serviceSlug}/manage/line`,
      label: 'LINEの使い方を確認する',
    });
  } else if (lineMode === 'DEDICATED' && line?.globallyPaused) {
    lineOperationActions.push({
      title: '公式LINEの通知が停止中です',
      detail:
        '安全のため、このサービスのLINE通知は止まっています。設定内容を確認してから再開してください。',
      href: `/s/${serviceSlug}/manage/line`,
      label: '公式LINEを確認する',
    });
  } else if (lineMode === 'DEDICATED' && (!line?.lastVerifiedAt || line.lastErrorCategory)) {
    lineOperationActions.push({
      title: '公式LINEの接続確認が必要です',
      detail:
        '登録した公式LINEが使えるか、まだ確認できていません。接続確認後に通知を開始してください。',
      href: `/s/${serviceSlug}/manage/line`,
      label: '公式LINEを確認する',
    });
  }
  if (lineMode === 'DEDICATED' && dedicatedLineReady && dedicatedRichMenuPublishCount === 0) {
    lineOperationActions.push({
      title: '専用LINEの標準メニューが未公開です',
      detail: '今日やることなど4つのボタンを、公式LINE画面から公開してください。',
      href: `/s/${serviceSlug}/manage/line`,
      label: '標準メニューを公開する',
    });
  }
  const operationActions: OperationAction[] = [
    ...lineOperationActions,
    ...(failedLineDeliveries > 0
      ? [
          {
            title: 'LINE通知で確認が必要',
            detail: `直近7日間に${failedLineDeliveries}件のLINE通知が送れませんでした。公式LINEの接続状態を確認してください。`,
            href: `/s/${serviceSlug}/manage/line`,
            label: '公式LINEを確認する',
          },
        ]
      : []),
    ...(overdueLineDeliveries > 0
      ? [
          {
            title: '送信予定時刻を過ぎたLINE通知',
            detail: `${overdueLineDeliveries}件のLINE通知が送信待ちです。続く場合はシステム管理者へ連絡してください。`,
          },
        ]
      : []),
    ...(!isBusinessDailyService && pendingPostApprovalCount > 0
      ? [
          {
            title: '商品投稿の確認待ち',
            detail: `${pendingPostApprovalCount}件の投稿案が、参加者のコピー前の確認を待っています。`,
            href: `/s/${serviceSlug}/manage/post-approvals`,
            label: '投稿案を確認する',
          },
        ]
      : []),
    ...(!isBusinessDailyService && missingLinkWarning
      ? [
          {
            title: '商品投稿案に専用URLがありません',
            detail: missingLinkWarning,
            href: `/s/${serviceSlug}/manage/external-tracking`,
            label: '専用URLを確認する',
          },
        ]
      : []),
    ...(feedbackSummary.needsAttention
      ? [
          {
            title: '投稿後の感想が不足しています',
            detail: `直近28日間の投稿${feedbackSummary.posted}件のうち、感想入力は${feedbackSummary.rated}件です。次週の投稿案を改善できるよう、参加者へ入力をご案内ください。`,
            href: `/s/${serviceSlug}/manage/line`,
            label: 'LINEで案内する',
          },
        ]
      : []),
    ...(knowledgeReviewCount > 0
      ? [
          {
            title: '公式情報の確認待ち',
            detail: `${knowledgeReviewCount}件の公式情報が、利用する前の確認を待っています。`,
            href: `/s/${serviceSlug}/manage/knowledge`,
            label: '公式情報を確認する',
          },
        ]
      : []),
    ...(knowledgeFailedCount > 0
      ? [
          {
            title: '読み込めなかった公式情報',
            detail: `${knowledgeFailedCount}件の公式情報を読み込めませんでした。内容を確認して、もう一度試してください。`,
            href: `/s/${serviceSlug}/manage/knowledge`,
            label: '公式情報を確認する',
          },
        ]
      : []),
    ...(!isBusinessDailyService && failedVideoRenders > 0
      ? [
          {
            title: '作成に失敗した動画',
            detail: `${failedVideoRenders}件の動画作成が止まっています。原因を確認して、必要な場合だけ作り直してください。`,
            href: `/s/${serviceSlug}/manage/video-operations`,
            label: '動画の状況を確認する',
          },
        ]
      : []),
    ...(failedAiCalls > 0
      ? [
          {
            title: 'AIの処理で確認が必要',
            detail: `直近7日間に${failedAiCalls}回の失敗がありました。続く場合は、システム管理者へ連絡してください。`,
          },
        ]
      : []),
  ];
  return operationActions;
}

export type ServiceDailyTask = {
  title: string;
  lines: string[];
  links: Array<{ label: string; href: string }>;
};

/** 企業の日常業務（参加者・発信企画・公式素材・活動状況）を、既存画面への入口として並べる。 */
export function buildServiceDailyTasks(input: {
  serviceSlug: string;
  participantCount: number;
  overview: {
    publishedProductPackCount: number;
    openCampaignCount: number;
    pendingPostApprovalCount: number;
    recent: { generated: number; accepted: number; copied: number; postedSelfReported: number };
  } | null;
}): ServiceDailyTask[] {
  const base = `/s/${input.serviceSlug}/manage`;
  const overview = input.overview;
  return [
    {
      title: '参加者',
      lines: [`利用中の参加者：${input.participantCount}名`],
      links: [{ label: '参加者を招待・確認する', href: `${base}/members` }],
    },
    {
      title: '発信企画',
      lines: overview
        ? [
            `募集中の企画：${overview.openCampaignCount}件`,
            `確認を待つ投稿案：${overview.pendingPostApprovalCount}件`,
          ]
        : [],
      links: [
        { label: '企画を作る・確認する', href: `${base}/campaigns` },
        { label: '投稿案を確認する', href: `${base}/post-approvals` },
      ],
    },
    {
      title: '公式素材',
      lines: overview ? [`公開中の商品情報：${overview.publishedProductPackCount}件`] : [],
      links: [{ label: '商品情報・素材を登録する', href: `${base}/product-packs` }],
    },
    {
      title: '活動状況（直近7日）',
      lines: overview
        ? [
            `投稿案 ${overview.recent.generated}件 ／ 採用 ${overview.recent.accepted}件`,
            `コピー ${overview.recent.copied}件 ／ 投稿完了（本人申告） ${overview.recent.postedSelfReported}件`,
          ]
        : [],
      links: [{ label: '企画ごとの状況を見る', href: `${base}/campaigns` }],
    },
  ];
}
