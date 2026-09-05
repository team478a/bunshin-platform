import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentAiProviderEnvironment } from '../../../../src/ai/secure-provider-configuration';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';
import { resolveManagedServiceContext } from '../../../../src/services/public-service';
import { buildServiceLaunchReadiness } from '../../../../src/services/service-launch-readiness';
import { readServiceOnboardingSettings } from '../../../../src/services/service-onboarding-settings';
import { buildSideHustleContentFunnel } from '../../../../src/services/side-hustle-content-funnel';
import { buildPerformanceFeedbackSummary } from '../../../../src/services/performance-feedback-summary';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

const sections = [
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
    title: 'ポイントとバッジ',
    description: '投稿の継続を応援するポイント・バッジを設定します。',
    href: 'badges',
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
] as const;

export default async function ServiceManagementHome({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const group = await db.prisma.group.findFirst({
    where: {
      workspaceId: service.workspaceId,
      id: service.serviceId,
      status: 'ACTIVE',
    },
    select: {
      memberships: {
        where: { status: 'ACTIVE', serviceRole: 'PARTICIPANT' },
        select: { id: true },
      },
      serviceLegalDocuments: {
        where: { status: 'PUBLISHED' },
        select: { type: true },
      },
      featurePolicies: {
        where: { status: 'ENABLED', feature: { status: 'ACTIVE' } },
        select: { id: true },
      },
      knowledgeSources: {
        where: { status: 'ACTIVE', productPackVersionId: null },
        select: { id: true },
      },
      lineChannelConfigurations: {
        where: { environment: currentLineEnvironment(), status: 'ACTIVE' },
        select: { id: true, lastVerifiedAt: true, lastErrorCategory: true, globallyPaused: true },
        take: 1,
      },
      lineRoutingPolicies: {
        where: { environment: currentLineEnvironment() },
        select: { mode: true, pilotEnabled: true },
        take: 1,
      },
    },
  });
  if (!group) notFound();
  const line = group.lineChannelConfigurations[0];
  const linePolicy = group.lineRoutingPolicies[0];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twentyEightDaysAgo = new Date(now.getTime() - 28 * 86_400_000);
  const missionScope = {
    workspaceId: service.workspaceId,
    bunshin: { is: { groupId: service.serviceId } },
  };
  const [
    activeProductPackCount,
    activeCampaignCount,
    activeTrackingLinkCount,
    trendProviderReadyCount,
    productMissions,
    linkedProductMissions,
    copiedProductMissions,
    postedProductMissions,
    recentPostedForFeedback,
    recentFeedback,
    pendingPostApprovalCount,
    missionsCreated,
    acceptedMissions,
    rejectedMissions,
    copiedMissions,
    postedMissions,
    trendMissions,
    successfulAiCalls,
    failedAiCalls,
    knowledgeReviewCount,
    knowledgeFailedCount,
    failedVideoRenders,
    sentLineDeliveries,
    failedLineDeliveries,
    overdueLineDeliveries,
    generationProviderReadyCount,
    sharedLineReadyCount,
    dedicatedRichMenuPublishCount,
  ] = await Promise.all([
    db.prisma.productPack.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'ACTIVE',
        versions: {
          some: {
            status: 'PUBLISHED',
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
              { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
            ],
          },
        },
      },
    }),
    db.prisma.campaign.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'OPEN',
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
    }),
    db.prisma.externalTrackingLink.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'ACTIVE',
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
    }),
    db.prisma.aiProviderConfiguration.count({
      where: {
        environment: currentAiProviderEnvironment(),
        provider: { in: ['GROK', 'EXA', 'FIRECRAWL'] },
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    }),
    db.prisma.dailyMission.count({
      where: {
        ...missionScope,
        campaignId: { not: null },
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    db.prisma.contentLinkUsage.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    db.prisma.missionActivity.count({
      where: {
        ...missionScope,
        occurredAt: { gte: sevenDaysAgo },
        type: {
          in: [
            'COPIED_TEXT',
            'COPIED_SLIDE',
            'COPIED_IMAGE_INSTRUCTION',
            'COPIED_VIDEO_PROMPT',
            'COPIED_SCRIPT',
          ],
        },
        dailyMission: { is: { contentLinkUsage: { isNot: null } } },
      },
    }),
    db.prisma.postRecord.count({
      where: {
        ...missionScope,
        postedAt: { gte: sevenDaysAgo },
        dailyMission: { is: { contentLinkUsage: { isNot: null } } },
      },
    }),
    db.prisma.postRecord.count({
      where: { ...missionScope, postedAt: { gte: twentyEightDaysAgo } },
    }),
    db.prisma.missionFeedback.findMany({
      where: {
        ...missionScope,
        dailyMission: { is: { postRecord: { is: { postedAt: { gte: twentyEightDaysAgo } } } } },
      },
      select: { rating: true },
    }),
    db.prisma.campaignPostingApprovalRequest.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'PENDING',
      },
    }),
    db.prisma.dailyMission.count({
      where: { ...missionScope, createdAt: { gte: sevenDaysAgo } },
    }),
    db.prisma.missionDecision.count({
      where: {
        ...missionScope,
        decision: 'ACCEPTED',
        decidedAt: { gte: sevenDaysAgo },
      },
    }),
    db.prisma.missionDecision.count({
      where: {
        ...missionScope,
        decision: 'REJECTED',
        decidedAt: { gte: sevenDaysAgo },
      },
    }),
    db.prisma.missionActivity.count({
      where: {
        ...missionScope,
        occurredAt: { gte: sevenDaysAgo },
        type: {
          in: [
            'COPIED_TEXT',
            'COPIED_SLIDE',
            'COPIED_IMAGE_INSTRUCTION',
            'COPIED_VIDEO_PROMPT',
            'COPIED_SCRIPT',
          ],
        },
      },
    }),
    db.prisma.postRecord.count({
      where: { ...missionScope, postedAt: { gte: sevenDaysAgo } },
    }),
    db.prisma.missionTrendContext.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
        dailyMission: { is: missionScope },
      },
    }),
    db.prisma.aiUsageEvent.count({
      where: {
        workspaceId: service.workspaceId,
        occurredAt: { gte: sevenDaysAgo },
        status: 'SUCCESS',
        bunshin: { is: { groupId: service.serviceId } },
      },
    }),
    db.prisma.aiUsageEvent.count({
      where: {
        workspaceId: service.workspaceId,
        occurredAt: { gte: sevenDaysAgo },
        status: 'FAILED',
        bunshin: { is: { groupId: service.serviceId } },
      },
    }),
    db.prisma.groupKnowledgeSource.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'REVIEW_REQUIRED',
      },
    }),
    db.prisma.groupKnowledgeSource.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'FAILED',
      },
    }),
    db.prisma.videoRender.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'FAILED',
      },
    }),
    db.prisma.lineMessageDelivery.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        environment: currentLineEnvironment(),
        status: 'SENT',
        sentAt: { gte: sevenDaysAgo },
      },
    }),
    db.prisma.lineMessageDelivery.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        environment: currentLineEnvironment(),
        status: 'FAILED',
        updatedAt: { gte: sevenDaysAgo },
      },
    }),
    db.prisma.lineMessageDelivery.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        environment: currentLineEnvironment(),
        status: 'PENDING',
        scheduledAt: { lt: now },
      },
    }),
    db.prisma.aiProviderConfiguration.count({
      where: {
        environment: currentAiProviderEnvironment(),
        provider: 'OPENAI',
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    }),
    db.prisma.lineChannelConfiguration.count({
      where: {
        environment: currentLineEnvironment(),
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    }),
    line
      ? db.prisma.groupLineConfigurationAudit.count({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            configurationId: line.id,
            environment: currentLineEnvironment(),
            action: 'RICH_MENU_PUBLISH',
          },
        })
      : Promise.resolve(0),
  ]);
  const configuration = service.configuration;
  const onboarding = readServiceOnboardingSettings(
    configuration.registration.onboardingConfig,
    configuration.registration.surveyConfig,
  );
  const lineMode = linePolicy?.mode ?? 'SHARED';
  const dedicatedLineReady = Boolean(
    linePolicy?.pilotEnabled &&
    line?.lastVerifiedAt &&
    !line.lastErrorCategory &&
    !line.globallyPaused,
  );
  const lineConfigurationReady =
    lineMode === 'SHARED'
      ? sharedLineReadyCount > 0
      : lineMode === 'DEDICATED'
        ? dedicatedLineReady
        : false;
  const readiness = buildServiceLaunchReadiness({
    serviceSlug: configuration.slug,
    operatorName: configuration.operatorName,
    contactEmail: configuration.contactEmail,
    registrationMode: configuration.registration.mode,
    emailEnabled: configuration.registration.emailEnabled,
    lineEnabled: configuration.registration.lineEnabled,
    onboardingQuestionCount: onboarding.questions.length,
    publishedLegalTypes: group.serviceLegalDocuments.map((item) => item.type),
    activeFeatureCount: group.featurePolicies.length,
    activeParticipantCount: group.memberships.length,
    activeKnowledgeCount: group.knowledgeSources.length,
    lineConfigurationReady,
    lineMode,
    linePilotEnabled: linePolicy?.pilotEnabled ?? false,
    lineRichMenuReady: dedicatedRichMenuPublishCount > 0,
    generationProviderReady: generationProviderReadyCount > 0,
    commercialContentRequired: configuration.registration.referralEnabled,
    trendResearchEnabled: configuration.trendResearchEnabled ?? true,
    trendProviderReady: trendProviderReadyCount > 0,
    activeProductPackCount,
    activeCampaignCount,
    activeTrackingLinkCount,
  });
  const readyCount = readiness.filter((item) => item.ready).length;
  const sideHustleFunnel = buildSideHustleContentFunnel({
    productMissions,
    linkedMissions: linkedProductMissions,
    copiedMissions: copiedProductMissions,
    postedMissions: postedProductMissions,
  });
  const feedbackSummary = buildPerformanceFeedbackSummary({
    posted: recentPostedForFeedback,
    good: recentFeedback.filter(({ rating }) => rating === 'GOOD').length,
    neutral: recentFeedback.filter(({ rating }) => rating === 'NEUTRAL').length,
    bad: recentFeedback.filter(({ rating }) => rating === 'BAD').length,
  });
  type OperationAction = {
    title: string;
    detail: string;
    href?: string;
    label?: string;
  };
  const lineOperationActions: OperationAction[] = [];
  if (configuration.registration.lineEnabled && lineMode === 'DISABLED') {
    lineOperationActions.push({
      title: 'LINEを使う設定と配信停止が矛盾しています',
      detail:
        '参加方法ではLINEを使用します。公式LINE画面で共通LINEまたは専用LINEを選んでください。',
      href: `/s/${configuration.slug}/manage/line`,
      label: 'LINEの使い方を確認する',
    });
  } else if (
    configuration.registration.lineEnabled &&
    lineMode === 'SHARED' &&
    sharedLineReadyCount === 0
  ) {
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
      href: `/s/${configuration.slug}/manage/line`,
      label: '公式LINEを設定する',
    });
  } else if (lineMode === 'DEDICATED' && !linePolicy?.pilotEnabled) {
    lineOperationActions.push({
      title: '専用LINEのテスト利用が無効です',
      detail: '公式LINE画面で専用LINEを選び直し、テスト利用を有効にしてください。',
      href: `/s/${configuration.slug}/manage/line`,
      label: 'LINEの使い方を確認する',
    });
  } else if (lineMode === 'DEDICATED' && line?.globallyPaused) {
    lineOperationActions.push({
      title: '公式LINEの通知が停止中です',
      detail:
        '安全のため、このサービスのLINE通知は止まっています。設定内容を確認してから再開してください。',
      href: `/s/${configuration.slug}/manage/line`,
      label: '公式LINEを確認する',
    });
  } else if (lineMode === 'DEDICATED' && (!line?.lastVerifiedAt || line.lastErrorCategory)) {
    lineOperationActions.push({
      title: '公式LINEの接続確認が必要です',
      detail:
        '登録した公式LINEが使えるか、まだ確認できていません。接続確認後に通知を開始してください。',
      href: `/s/${configuration.slug}/manage/line`,
      label: '公式LINEを確認する',
    });
  }
  if (lineMode === 'DEDICATED' && dedicatedLineReady && dedicatedRichMenuPublishCount === 0) {
    lineOperationActions.push({
      title: '専用LINEの標準メニューが未公開です',
      detail: '今日やることなど4つのボタンを、公式LINE画面から公開してください。',
      href: `/s/${configuration.slug}/manage/line`,
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
            href: `/s/${configuration.slug}/manage/line`,
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
    ...(pendingPostApprovalCount > 0
      ? [
          {
            title: '商品投稿の確認待ち',
            detail: `${pendingPostApprovalCount}件の投稿案が、参加者のコピー前の確認を待っています。`,
            href: `/s/${configuration.slug}/manage/post-approvals`,
            label: '投稿案を確認する',
          },
        ]
      : []),
    ...(sideHustleFunnel.missingLinkWarning
      ? [
          {
            title: '商品投稿案に専用URLがありません',
            detail: sideHustleFunnel.missingLinkWarning,
            href: `/s/${configuration.slug}/manage/external-tracking`,
            label: '専用URLを確認する',
          },
        ]
      : []),
    ...(feedbackSummary.needsAttention
      ? [
          {
            title: '投稿後の感想が不足しています',
            detail: `直近28日間の投稿${feedbackSummary.posted}件のうち、感想入力は${feedbackSummary.rated}件です。次週の投稿案を改善できるよう、参加者へ入力をご案内ください。`,
            href: `/s/${configuration.slug}/manage/line`,
            label: 'LINEで案内する',
          },
        ]
      : []),
    ...(knowledgeReviewCount > 0
      ? [
          {
            title: '公式情報の確認待ち',
            detail: `${knowledgeReviewCount}件の公式情報が、投稿づくりに使う前の確認を待っています。`,
            href: `/s/${configuration.slug}/manage/knowledge`,
            label: '公式情報を確認する',
          },
        ]
      : []),
    ...(knowledgeFailedCount > 0
      ? [
          {
            title: '読み込めなかった公式情報',
            detail: `${knowledgeFailedCount}件の公式情報を読み込めませんでした。内容を確認して、もう一度試してください。`,
            href: `/s/${configuration.slug}/manage/knowledge`,
            label: '公式情報を確認する',
          },
        ]
      : []),
    ...(failedVideoRenders > 0
      ? [
          {
            title: '作成に失敗した動画',
            detail: `${failedVideoRenders}件の動画作成が止まっています。原因を確認して、必要な場合だけ作り直してください。`,
            href: `/s/${configuration.slug}/manage/video-operations`,
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

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>{configuration.displayName}の開始準備と運営</h1>
          <p>開始準備の確認と、日々の運営に必要な設定をまとめました。</p>
        </header>
        <section className="settings-card">
          <h2>直近7日間の活動</h2>
          <p>参加者の本文や個別の利用履歴は表示せず、サービス全体の件数だけを確認できます。</p>
          <dl className="settings-status-list">
            <div className="settings-status-item">
              <dt>作られた投稿案</dt>
              <dd>{missionsCreated}件</dd>
            </div>
            <div className="settings-status-item">
              <dt>採用 / 今回は使わない</dt>
              <dd>
                {acceptedMissions}件 / {rejectedMissions}件
              </dd>
            </div>
            <div className="settings-status-item">
              <dt>コピー / 投稿完了</dt>
              <dd>
                {copiedMissions}回 / {postedMissions}件
              </dd>
            </div>
            <div className="settings-status-item">
              <dt>話題を使った投稿案</dt>
              <dd>{trendMissions}件</dd>
            </div>
            <div className="settings-status-item">
              <dt>AIの処理</dt>
              <dd>
                成功 {successfulAiCalls}回 / 要確認 {failedAiCalls}回
              </dd>
            </div>
            <div className="settings-status-item">
              <dt>公式LINEの通知</dt>
              <dd>
                送信 {sentLineDeliveries}件 / 要確認 {failedLineDeliveries}件
              </dd>
            </div>
          </dl>
          <p>
            話題の調査を使うかは「サービスの見た目・登録」で設定できます。調査サービス・原価・APIキーはシステム管理者が管理します。
          </p>
          <a
            className="button button--secondary"
            href={`/api/services/${configuration.slug}/operations-report`}
          >
            この集計をCSVでダウンロード
          </a>
        </section>
        {configuration.registration.referralEnabled ? (
          <section className="settings-card">
            <h2>直近7日間の商品投稿の流れ</h2>
            <p>投稿本文は表示せず、専用URLが入った投稿案の進み方だけを確認します。</p>
            <dl className="settings-status-list">
              {sideHustleFunnel.stages.map((stage) => (
                <div className="settings-status-item" key={stage.key}>
                  <dt>{stage.label}</dt>
                  <dd>{stage.count}件</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        <section className="settings-card">
          <h2>次週の投稿改善に使える感想</h2>
          <p>直近28日間の投稿完了に対する集計です。投稿本文や参加者ごとの回答は表示しません。</p>
          <dl className="settings-status-list">
            <div className="settings-status-item">
              <dt>感想入力率</dt>
              <dd>{feedbackSummary.coveragePercent}%</dd>
            </div>
            <div className="settings-status-item">
              <dt>自分らしい / 普通 / 違う</dt>
              <dd>
                {feedbackSummary.good}件 / {feedbackSummary.neutral}件 / {feedbackSummary.bad}件
              </dd>
            </div>
            <div className="settings-status-item">
              <dt>未入力</dt>
              <dd>{feedbackSummary.unrated}件</dd>
            </div>
          </dl>
          <p>入力された集計は、次に作る週間計画の形式と切り口の改善に使われます。</p>
        </section>
        {operationActions.length > 0 ? (
          <section className="settings-card">
            <h2>いま確認すること</h2>
            <p>止まっている作業や、確認が必要なものだけを表示しています。</p>
            <ul className="settings-status-list">
              {operationActions.map((item) => (
                <li className="settings-status-item" key={item.title}>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                  {item.href && item.label ? (
                    <Link className="button button--secondary" href={item.href as Route}>
                      {item.label}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="settings-card">
          <h2>
            {readyCount} / {readiness.length} 項目が準備できています
          </h2>
          <p>
            {readyCount === readiness.length
              ? '必要な設定がそろいました。参加者のテストを始められます。'
              : '「設定する」と表示されている項目を確認してください。'}
          </p>
        </section>
        <section className="settings-card">
          <h2>開始準備</h2>
          <div className="settings-status-list">
            {readiness.map((item) => (
              <article className="settings-status-item" key={item.key}>
                <div>
                  <p>{item.ready ? '✓ 準備できています' : '● 設定が必要です'}</p>
                  <h3>{item.label}</h3>
                  <p>{item.detail}</p>
                </div>
                <Link className="button button--secondary" href={item.path as Route}>
                  {item.ready ? '確認する' : '設定する'}
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="settings-card">
          <h2>運営メニュー</h2>
          <ul className="settings-status-list">
            {sections.map((section) => (
              <li className="settings-status-item" key={section.href}>
                <h3>{section.title}</h3>
                <p>{section.description}</p>
                <Link
                  className="button button--secondary"
                  href={`/s/${configuration.slug}/manage/${section.href}`}
                >
                  開く
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <Link href={`/s/${configuration.slug}/home` as Route}>← 参加者向けのホームを見る</Link>
      </main>
    </PublicShell>
  );
}
