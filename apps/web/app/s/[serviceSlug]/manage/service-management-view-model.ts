export const serviceManagementSections = [
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
    title: '参加者・運営者と利用権限',
    description: '参加者の招待、運営担当者の役割、参加者ごとの「利用する・停止する」を管理します。',
    href: 'members',
  },
  {
    title: '公式情報・ナレッジ',
    description: 'PDF、動画、URL、よくある質問などを登録し、投稿づくりに使います。',
    href: 'knowledge',
  },
  {
    title: '商品・活動情報',
    description: '紹介する商品、必須表示、避ける表現、キャンペーンを準備します。',
    href: 'product-packs',
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
            detail: `${knowledgeReviewCount}件の公式情報が、投稿づくりに使う前の確認を待っています。`,
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
