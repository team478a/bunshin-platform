import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentAiProviderEnvironment } from '../../../../src/ai/secure-provider-configuration';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';
import { resolveManagedServiceContext } from '../../../../src/services/public-service';
import { buildServiceLaunchReadiness } from '../../../../src/services/service-launch-readiness';
import { readServiceOnboardingSettings } from '../../../../src/services/service-onboarding-settings';
import { isFortuneServicePackage } from '../../../../src/services/service-creation-templates';
import { isPromptOnlyImageService } from '../../../../src/services/service-image-policy';
import { selectServiceManagementSections } from '../../../../src/services/service-management-navigation';
import { buildSideHustleContentFunnel } from '../../../../src/services/side-hustle-content-funnel';
import { buildPerformanceFeedbackSummary } from '../../../../src/services/performance-feedback-summary';
import { buildBusinessPilotMetrics } from '../../../../src/services/business-pilot-metrics';
import { sumBusinessOutcomes } from '../../../../src/services/business-outcomes';
import { PublicShell } from '../../../ui/public-shell';
import {
  buildServiceOperationActions,
  serviceManagementSections,
} from './service-management-view-model';

export const dynamic = 'force-dynamic';

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
        select: { id: true, userId: true, createdAt: true },
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
      fortuneServiceSetting: { select: { id: true } },
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
  const isBusinessDailyService = onboarding.businessProfileEnabled;
  const isFortuneService =
    isFortuneServicePackage(configuration.registration.onboardingConfig) ||
    group.fortuneServiceSetting !== null;
  const participantIds = group.memberships.map(({ userId }) => userId);
  const [businessActivityRows, businessLineOpenRows, businessOutcomePosts] =
    isBusinessDailyService && participantIds.length > 0
      ? await Promise.all([
          db.prisma.missionActivity.findMany({
            where: {
              ...missionScope,
              actorUserId: { in: participantIds },
            },
            select: { actorUserId: true, dailyMissionId: true, occurredAt: true, type: true },
          }),
          db.prisma.missionDeepLinkState.findMany({
            where: {
              workspaceId: service.workspaceId,
              userId: { in: participantIds },
              consumedAt: { not: null },
              dailyMission: { is: { bunshin: { is: { groupId: service.serviceId } } } },
            },
            select: { userId: true, dailyMissionId: true, consumedAt: true },
          }),
          db.prisma.postRecord.findMany({
            where: {
              ...missionScope,
              postedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
            },
            select: { manualMetrics: true },
          }),
        ])
      : [[], [], []];
  const businessEvents = [
    ...businessActivityRows.map((row) => ({ userId: row.actorUserId, occurredAt: row.occurredAt })),
    ...businessLineOpenRows.flatMap((row) =>
      row.consumedAt ? [{ userId: row.userId, occurredAt: row.consumedAt }] : [],
    ),
  ];
  const openedMissionCount = new Set(
    businessLineOpenRows
      .filter((row) => row.consumedAt && row.consumedAt >= sevenDaysAgo)
      .map((row) => row.dailyMissionId),
  ).size;
  const viewedMissionCount = new Set(
    businessActivityRows
      .filter((row) => row.type === 'VIEWED' && row.occurredAt >= sevenDaysAgo)
      .map((row) => row.dailyMissionId),
  ).size;
  const businessMetrics = buildBusinessPilotMetrics({
    participants: group.memberships.map(({ userId, createdAt }) => ({
      userId,
      joinedAt: createdAt,
    })),
    events: businessEvents,
    now,
    missions: missionsCreated,
    viewed: viewedMissionCount,
    accepted: acceptedMissions,
    copied: copiedMissions,
    posted: postedMissions,
    lineSent: sentLineDeliveries,
    lineOpened: openedMissionCount,
  });
  const businessOutcomes = sumBusinessOutcomes(
    businessOutcomePosts.map(({ manualMetrics }) => manualMetrics),
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
    ...(isBusinessDailyService
      ? {
          businessDailyIdeas: {
            businessProfileEnabled: onboarding.businessProfileEnabled,
            deliveryEnabled: onboarding.dailyIdeaDelivery.enabled,
            cadence: onboarding.dailyIdeaDelivery.cadence,
            contentMode: onboarding.dailyIdeaDelivery.contentMode,
            mediaMode: onboarding.dailyIdeaDelivery.mediaMode,
          },
        }
      : {}),
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
  const operationActions = buildServiceOperationActions({
    serviceSlug: configuration.slug,
    lineEnabled: configuration.registration.lineEnabled,
    lineMode,
    sharedLineReadyCount,
    dedicatedLinePilotEnabled: linePolicy?.pilotEnabled ?? false,
    dedicatedLine: line,
    dedicatedLineReady,
    dedicatedRichMenuPublishCount,
    failedLineDeliveries,
    overdueLineDeliveries,
    businessDailyService: isBusinessDailyService,
    pendingPostApprovalCount,
    missingLinkWarning: sideHustleFunnel.missingLinkWarning,
    feedbackSummary,
    knowledgeReviewCount,
    knowledgeFailedCount,
    failedVideoRenders,
    failedAiCalls,
  });
  const visibleSections = selectServiceManagementSections(serviceManagementSections, {
    businessDaily: isBusinessDailyService,
    fortune: isFortuneService,
    promptOnlyImages: isPromptOnlyImageService(configuration.slug),
  });

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>{configuration.displayName}の開始準備と運営</h1>
          <p>開始準備の確認と、日々の運営に必要な設定をまとめました。</p>
          <Link href={`/s/${configuration.slug}/help` as Route}>運営マニュアル・ヘルプを見る</Link>
        </header>
        {isBusinessDailyService ? (
          <section className="settings-card">
            <h2>企業向け無料の限定運用</h2>
            <p>
              初期運用では、完成した投稿文章を1日1件LINEで届けます。画像・動画の自動生成、商品配布、紹介報酬は使用しません。
            </p>
            <ol>
              <li>
                開始準備：{readyCount} / {readiness.length}項目完了
              </li>
              <li>社内受信：直近7日間にLINE送信 {sentLineDeliveries}件</li>
              <li>投稿確認：直近7日間に投稿完了 {postedMissions}件</li>
              <li>限定テスト：現在の参加者 {group.memberships.length}名（最初の目安は3〜5社）</li>
            </ol>
            <p>
              開始準備をすべて完了し、社内アカウントで受信と投稿を確認してから、3〜5社の7日間テストへ進みます。
            </p>
          </section>
        ) : null}
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
            {!isBusinessDailyService ? (
              <div className="settings-status-item">
                <dt>話題を使った投稿案</dt>
                <dd>{trendMissions}件</dd>
              </div>
            ) : null}
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
        {isBusinessDailyService ? (
          <section className="settings-card">
            <h2>無料運用の利用率・継続率</h2>
            <p>個人名や投稿本文を表示せず、サービス全体の割合だけを確認できます。</p>
            <dl className="settings-status-list">
              <div className="settings-status-item">
                <dt>LINEを開いた割合</dt>
                <dd>
                  {businessMetrics.openRate === null ? '集計前' : `${businessMetrics.openRate}%`}
                </dd>
              </div>
              <div className="settings-status-item">
                <dt>投稿案を見た割合</dt>
                <dd>
                  {businessMetrics.viewRate === null ? '集計前' : `${businessMetrics.viewRate}%`}
                </dd>
              </div>
              <div className="settings-status-item">
                <dt>採用 / コピー / 投稿完了</dt>
                <dd>
                  {businessMetrics.acceptanceRate ?? 0}% / {businessMetrics.copyRate ?? 0}% /{' '}
                  {businessMetrics.postRate ?? 0}%
                </dd>
              </div>
              <div className="settings-status-item">
                <dt>7日後も利用</dt>
                <dd>
                  {businessMetrics.sevenDayRetention.percent === null
                    ? '対象者がまだいません'
                    : `${businessMetrics.sevenDayRetention.percent}%（${businessMetrics.sevenDayRetention.retained}/${businessMetrics.sevenDayRetention.eligible}名）`}
                </dd>
              </div>
              <div className="settings-status-item">
                <dt>30日後も利用</dt>
                <dd>
                  {businessMetrics.thirtyDayRetention.percent === null
                    ? '対象者がまだいません'
                    : `${businessMetrics.thirtyDayRetention.percent}%（${businessMetrics.thirtyDayRetention.retained}/${businessMetrics.thirtyDayRetention.eligible}名）`}
                </dd>
              </div>
              <div className="settings-status-item">
                <dt>直近7日で3日以上利用</dt>
                <dd>{businessMetrics.threeDayActiveUsers}名</dd>
              </div>
            </dl>
          </section>
        ) : null}
        {isBusinessDailyService ? (
          <section className="settings-card">
            <h2>投稿から生まれたお客様の反応</h2>
            <p>参加者が投稿後に自己申告した、直近30日間の合計です。</p>
            <dl className="settings-status-list">
              <div className="settings-status-item">
                <dt>問い合わせ</dt>
                <dd>{businessOutcomes.inquiries}件</dd>
              </div>
              <div className="settings-status-item">
                <dt>予約</dt>
                <dd>{businessOutcomes.reservations}件</dd>
              </div>
              <div className="settings-status-item">
                <dt>来店</dt>
                <dd>{businessOutcomes.visits}件</dd>
              </div>
              <div className="settings-status-item">
                <dt>購入・申込</dt>
                <dd>{businessOutcomes.orders}件</dd>
              </div>
              <div className="settings-status-item">
                <dt>その他</dt>
                <dd>{businessOutcomes.other}件</dd>
              </div>
            </dl>
          </section>
        ) : null}
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
            {visibleSections.map((section) => (
              <li className="settings-status-item" key={section.href}>
                <h3>{section.title}</h3>
                <p>{section.description}</p>
                <Link
                  className="button button--secondary"
                  href={`/s/${configuration.slug}/manage/${section.href}` as Route}
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
