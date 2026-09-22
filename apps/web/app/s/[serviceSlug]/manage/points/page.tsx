import { randomUUID } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';

import { currentUserProvider } from '../../../../../src/auth/current-user';
import { buildRewardsPilotReadiness } from '../../../../../src/rewards/rewards-pilot-readiness';
import {
  buildRewardsPilotMetrics,
  resolveRewardsPilotMeasurementPeriod,
} from '../../../../../src/rewards/rewards-pilot-metrics';
import { getRewardsPilotExpiryNotice } from '../../../../../src/rewards/rewards-pilot-expiry';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import {
  REWARDS,
  RULES,
  cancelRecovery,
  changePointIssuance,
  correctPoints,
  grantBonus,
  redemptionStatusLabels,
  saveCampaignRules,
  saveRewardSettings,
  saveRules,
  startFourWeekPilot,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function ServicePointSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{
    saved?: string;
    campaignRules?: string;
    bonus?: string;
    corrected?: string;
    recoveryCancelled?: string;
    rewards?: string;
    control?: string;
    pilotPeriod?: string;
    error?: string;
  }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/points`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const now = new Date();
  const memberships = await db.prisma.groupMembership.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      userId: true,
      user: { select: { displayName: true, email: true } },
      serviceRole: true,
      consentedAt: true,
    },
    orderBy: { user: { displayName: 'asc' } },
  });
  const memberUserIds = memberships.map(({ userId }) => userId);
  const bonusRecipients = memberships.filter(({ userId }) => userId !== actor.userId);
  const [pointConfiguration, rewardsPolicy, platformAdmin] = await Promise.all([
    db.prisma.serviceConfiguration.findFirstOrThrow({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      select: { pointIssuanceStopped: true },
    }),
    db.prisma.groupFeaturePolicy.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        featureKey: 'REWARDS.POINTS_BADGES',
      },
      select: { status: true, startsAt: true, endsAt: true },
    }),
    db.prisma.platformAdmin.findFirst({
      where: {
        userId: actor.userId,
        status: 'ACTIVE',
        role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
      },
      select: { id: true },
    }),
  ]);
  const [
    versions,
    campaigns,
    rewardSettings,
    globalRewardCatalog,
    history,
    pointAccounts,
    servicePointTransactions,
    badgeAwards,
  ] = await Promise.all([
    db.prisma.pointRuleVersion.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        campaignId: null,
        ruleKey: { in: RULES.map((rule) => rule.key) },
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      include: { budget: true },
      orderBy: [{ ruleKey: 'asc' }, { version: 'desc' }],
    }),
    db.prisma.campaign.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: { in: ['DRAFT', 'OPEN'] },
        endsAt: { gt: now },
      },
      select: {
        id: true,
        name: true,
        status: true,
        startsAt: true,
        endsAt: true,
        pointRuleVersions: {
          where: {
            status: { in: ['ACTIVE', 'SUSPENDED'] },
            ruleKey: { in: RULES.map((rule) => rule.key) },
          },
          include: { budget: true },
          orderBy: { version: 'desc' },
        },
      },
      orderBy: [{ startsAt: 'asc' }, { name: 'asc' }],
    }),
    db.prisma.servicePointRewardSetting.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      select: { rewardType: true, status: true, pointCost: true },
    }),
    db.prisma.pointRewardCatalogItem.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      select: { rewardType: true, pointCost: true, version: true },
      orderBy: [{ rewardType: 'asc' }, { version: 'desc' }],
    }),
    db.prisma.serviceConfigurationAudit.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        action: {
          in: [
            'POINT_RULES_UPDATED',
            'CAMPAIGN_POINT_RULES_UPDATED',
            'POINT_BONUS_GRANTED',
            'POINT_BALANCE_CORRECTED',
            'POINT_RECOVERY_REGISTERED',
            'POINT_RECOVERY_CANCELLED',
            'POINT_ISSUANCE_STOPPED',
            'POINT_ISSUANCE_RESUMED',
            'POINT_REWARDS_UPDATED',
          ],
        },
      },
      select: {
        id: true,
        action: true,
        afterData: true,
        reason: true,
        occurredAt: true,
        performedBy: { select: { displayName: true, email: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 30,
    }),
    db.prisma.pointAccount.findMany({
      where: { workspaceId: service.workspaceId, userId: { in: memberUserIds } },
      select: { userId: true, availablePoints: true, recoveryDue: true, updatedAt: true },
    }),
    db.prisma.pointTransaction.groupBy({
      by: ['userId'],
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: { in: memberUserIds },
      },
      _sum: { amount: true },
      _max: { createdAt: true },
    }),
    db.prisma.badgeAward.groupBy({
      by: ['userId'],
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: { in: memberUserIds },
        status: 'ACTIVE',
      },
      _count: { _all: true },
      _max: { awardedAt: true },
    }),
  ]);
  const recoveryTransactions = await db.prisma.pointTransaction.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      type: { in: ['REVERSAL', 'RECOVERY'] },
      sourceType: 'OPERATOR_RECOVERY',
    },
    select: {
      id: true,
      userId: true,
      amount: true,
      createdAt: true,
      user: { select: { displayName: true, email: true } },
      consumptionFor: { select: { amount: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const recoveryCancellations = recoveryTransactions.length
    ? await db.prisma.pointTransaction.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          type: 'REFUND',
          sourceType: 'OPERATOR_RECOVERY_CANCELLATION',
          sourceId: { in: recoveryTransactions.map(({ id }) => id) },
        },
        select: { sourceId: true },
      })
    : [];
  const cancelledRecoveryIds = new Set(
    recoveryCancellations.flatMap(({ sourceId }) => (sourceId ? [sourceId] : [])),
  );
  const cancellableRecoveries = recoveryTransactions.filter(
    ({ id }) => !cancelledRecoveryIds.has(id),
  );
  const current = new Map<string, (typeof versions)[number]>();
  for (const version of versions)
    if (!current.has(version.ruleKey)) current.set(version.ruleKey, version);
  const currentRewardSettings = new Map(
    rewardSettings.map((setting) => [setting.rewardType, setting]),
  );
  const globalRewardDefaults = new Map<string, number>();
  for (const reward of globalRewardCatalog)
    if (!globalRewardDefaults.has(reward.rewardType))
      globalRewardDefaults.set(reward.rewardType, reward.pointCost);
  const query = await searchParams;
  const pilotPeriod = resolveRewardsPilotMeasurementPeriod({
    startsAt: rewardsPolicy?.startsAt ?? null,
    endsAt: rewardsPolicy?.endsAt ?? null,
    now,
  });
  const rewardsPolicyActive = Boolean(
    rewardsPolicy &&
    rewardsPolicy.status === 'ENABLED' &&
    (!rewardsPolicy.startsAt || rewardsPolicy.startsAt <= now) &&
    (!rewardsPolicy.endsAt || rewardsPolicy.endsAt > now),
  );
  const configuredFourWeekPilot = Boolean(
    rewardsPolicy?.status === 'ENABLED' &&
    rewardsPolicy.startsAt &&
    rewardsPolicy.endsAt &&
    rewardsPolicy.endsAt > now &&
    rewardsPolicy.endsAt.getTime() - rewardsPolicy.startsAt.getTime() >= 28 * 24 * 60 * 60 * 1000,
  );
  const activeRewardsPilotMembers = memberships.filter(
    (membership) => membership.consentedAt && membership.serviceRole === 'PARTICIPANT',
  );
  const rewardsPilotActiveCount = activeRewardsPilotMembers.length;
  const activePointRuleCount = RULES.filter((rule) => {
    const saved = current.get(rule.key);
    return !saved || saved.status === 'ACTIVE';
  }).length;
  const pilotReadiness = buildRewardsPilotReadiness({
    policyStatus: rewardsPolicy?.status ?? null,
    startsAt: rewardsPolicy?.startsAt ?? null,
    endsAt: rewardsPolicy?.endsAt ?? null,
    now,
    activeParticipantCount: rewardsPilotActiveCount,
    pointIssuanceStopped: pointConfiguration.pointIssuanceStopped,
    activeRuleCount: activePointRuleCount,
  });
  const rewardsPilotUserIds = [
    ...new Set(activeRewardsPilotMembers.map((membership) => membership.userId)),
  ];
  const rewardsPilotCount = rewardsPilotUserIds.length;
  const policyExpiryNotice = getRewardsPilotExpiryNotice(rewardsPolicy?.endsAt ?? null, now);
  const [pilotPosts, pilotGrantTransactions, pilotRedemptions] = await Promise.all([
    db.prisma.postRecord.findMany({
      where: {
        workspaceId: service.workspaceId,
        actorUserId: { in: rewardsPilotUserIds },
        postedAt: { gte: pilotPeriod.from, lt: pilotPeriod.toExclusive },
        bunshin: { groupId: service.serviceId },
      },
      select: { actorUserId: true, postedAt: true },
    }),
    db.prisma.pointTransaction.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: { in: rewardsPilotUserIds },
        type: 'GRANT',
        createdAt: { gte: pilotPeriod.from, lt: pilotPeriod.toExclusive },
      },
      select: { userId: true, amount: true },
    }),
    db.prisma.pointRedemption.findMany({
      where: {
        workspaceId: service.workspaceId,
        userId: { in: rewardsPilotUserIds },
        consumptionTransaction: { groupId: service.serviceId },
        status: 'CONFIRMED',
        confirmedAt: { gte: pilotPeriod.from, lt: pilotPeriod.toExclusive },
      },
      select: { userId: true, pointCost: true },
    }),
  ]);
  const rewardsPilotMetrics = buildRewardsPilotMetrics({
    participantIds: rewardsPilotUserIds,
    posts: pilotPosts.map((post) => ({ userId: post.actorUserId, postedAt: post.postedAt })),
    transactions: [
      ...pilotGrantTransactions.map((transaction) => ({
        userId: transaction.userId,
        type: 'GRANT' as const,
        amount: transaction.amount,
      })),
      ...pilotRedemptions.map((redemption) => ({
        userId: redemption.userId,
        type: 'CONSUME' as const,
        amount: -redemption.pointCost,
      })),
    ],
  });
  const recentRedemptions = await db.prisma.pointRedemption.findMany({
    where: {
      workspaceId: service.workspaceId,
      consumptionTransaction: { groupId: service.serviceId },
    },
    select: {
      id: true,
      status: true,
      pointCost: true,
      createdAt: true,
      confirmedAt: true,
      user: { select: { displayName: true, email: true } },
      catalogItem: { select: { title: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const pilotPercentage = (count: number) =>
    rewardsPilotCount === 0 ? '—' : `${Math.round((count / rewardsPilotCount) * 100)}%`;
  const pilotPeriodEnd = new Date(
    Math.max(pilotPeriod.from.getTime(), pilotPeriod.toExclusive.getTime() - 1),
  );
  const formatPilotDate = (value: Date) =>
    value.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const pilotPeriodLabel = `${formatPilotDate(pilotPeriod.from)}〜${formatPilotDate(pilotPeriodEnd)}`;
  const configuredPilotPeriodLabel =
    rewardsPolicy?.startsAt && rewardsPolicy.endsAt
      ? `${formatPilotDate(rewardsPolicy.startsAt)}〜${formatPilotDate(rewardsPolicy.endsAt)}`
      : null;
  const memberName = new Map(
    memberships.map((membership) => [
      membership.userId,
      membership.user.displayName || membership.user.email || '参加者',
    ]),
  );
  const pointAccountByUser = new Map(pointAccounts.map((account) => [account.userId, account]));
  const pointChangeByUser = new Map<string, number>();
  const badgeCountByUser = new Map<string, number>();
  const latestActivityByUser = new Map<string, Date>();
  for (const transaction of servicePointTransactions) {
    pointChangeByUser.set(transaction.userId, transaction._sum.amount ?? 0);
    if (transaction._max.createdAt)
      latestActivityByUser.set(transaction.userId, transaction._max.createdAt);
  }
  for (const award of badgeAwards) {
    badgeCountByUser.set(award.userId, award._count._all);
    const latest = latestActivityByUser.get(award.userId);
    if (award._max.awardedAt && (!latest || award._max.awardedAt > latest))
      latestActivityByUser.set(award.userId, award._max.awardedAt);
  }
  for (const account of pointAccounts) {
    const latest = latestActivityByUser.get(account.userId);
    if (!latest || account.updatedAt > latest)
      latestActivityByUser.set(account.userId, account.updatedAt);
  }

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>ポイントとバッジ</h1>
          <p>このサービスで使うポイント数とバッジを、運営者が設定できます。</p>
          <a href={`/s/${serviceSlug}/manage`}>← 管理メニューへ戻る</a>
        </header>
        {query.saved ? (
          <p className="notice notice--success">ポイント設定を保存しました。</p>
        ) : null}
        {query.campaignRules ? (
          <p className="notice notice--success">募集ごとのポイント設定を保存しました。</p>
        ) : null}
        {query.bonus ? (
          <p className="notice notice--success">ボーナスポイントを付与しました。</p>
        ) : null}
        {query.corrected ? (
          <p className="notice notice--success">誤付与ポイントの回収を記録しました。</p>
        ) : null}
        {query.recoveryCancelled ? (
          <p className="notice notice--success">誤付与ポイントの回収を取り消しました。</p>
        ) : null}
        {query.rewards ? (
          <p className="notice notice--success">ポイントの使い道を保存しました。</p>
        ) : null}
        {query.pilotPeriod ? (
          <p className="notice notice--success">今日から4週間の試験期間を設定しました。</p>
        ) : null}
        {query.control === 'stop' ? (
          <p className="notice notice--success">ポイント付与を一括停止しました。</p>
        ) : null}
        {query.control === 'resume' ? (
          <p className="notice notice--success">ポイント付与を再開しました。</p>
        ) : null}
        {query.error ? (
          <p className="notice notice--danger">
            {query.error === 'recovery-cancellation'
              ? '回収を取り消せませんでした。すでに取り消されていないか確認してください。'
              : query.error === 'pilot-period'
                ? '4週間の試験期間を設定できませんでした。システム管理者の権限を確認してください。'
                : query.error === 'recovery'
                  ? '回収を記録できませんでした。画面を更新し、入力内容を確認してください。'
                  : query.error === 'budget'
                    ? '発行上限は、すでに発行したポイント以上にしてください。'
                    : query.error === 'campaign-budget'
                      ? '募集の発行上限は、すでに発行したポイント以上にしてください。'
                      : query.error === 'campaign-rules'
                        ? '募集ごとのポイント設定を保存できませんでした。募集の期間と入力内容を確認してください。'
                        : query.error === 'stopped'
                          ? 'ポイント付与は一括停止中です。再開してからボーナスを付与してください。'
                          : query.error === 'rewards'
                            ? 'ポイントの使い道を保存できませんでした。入力内容を確認してください。'
                            : '保存できませんでした。入力内容を確認してください。'}
          </p>
        ) : null}

        <section className="settings-card" aria-labelledby="pilot-readiness-title">
          <h2 id="pilot-readiness-title">4週間の試験を始める前の確認</h2>
          {pilotReadiness.status === 'COMPLETED' ? (
            <>
              <p>
                <strong>試験期間は終了しました。</strong>
              </p>
              <p>下にある試験結果を確認し、必要に応じてCSVを保存してください。</p>
              <a className="button button--secondary" href="#pilot-results">
                試験結果を見る
              </a>
            </>
          ) : (
            <>
              <p>
                {pilotReadiness.status === 'READY' ? (
                  <strong>準備完了です。試験を開始できます。</strong>
                ) : (
                  <strong>あと{pilotReadiness.missingCount}項目の設定が必要です。</strong>
                )}
              </p>
              <p>5項目すべてが「準備済み」になれば、ポイントを安全に試せます。</p>
              <ul>
                {pilotReadiness.items.map((item) => {
                  const settingsHref =
                    item.key === 'POLICY' || item.key === 'PERIOD'
                      ? platformAdmin
                        ? `/admin/groups/${service.serviceId}/features/${db.REWARDS_PILOT_FEATURE_KEY}`
                        : '#pilot-quick-start-title'
                      : item.key === 'PARTICIPANTS'
                        ? `/s/${serviceSlug}/manage/members`
                        : item.key === 'ISSUANCE'
                          ? '#point-control'
                          : '#point-rules';
                  return (
                    <li key={item.key}>
                      <strong>
                        {item.ready ? '準備済み' : '要設定'}：{item.label}
                      </strong>
                      <br />
                      <span>{item.detail}</span>
                      {item.key === 'PERIOD' && item.ready ? (
                        <>
                          <br />
                          <span>設定期間：{configuredPilotPeriodLabel ?? pilotPeriodLabel}</span>
                        </>
                      ) : null}
                      {!item.ready && settingsHref ? (
                        <>
                          <br />
                          <a href={settingsHref}>この設定を直す</a>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <section className="settings-card" aria-labelledby="pilot-quick-start-title">
          <h2 id="pilot-quick-start-title">無料試験をまとめて準備する</h2>
          <p>スマートフォンでは、次の順番で設定すると開始できます。</p>
          <ol>
            <li>今日から4週間の期間を設定します。</li>
            <li>登録と規約への同意を終えた一般参加者は、全員が自動で対象になります。</li>
            <li>上の開始確認がすべて「準備済み」になったら完了です。</li>
          </ol>

          {configuredFourWeekPilot ? (
            <p className="notice notice--success">
              4週間の期間は設定済みです。登録済みの一般参加者
              {rewardsPilotActiveCount}人が全員対象です。
            </p>
          ) : (
            <form action={startFourWeekPilot} className="form-stack">
              <input type="hidden" name="serviceSlug" value={serviceSlug} />
              <input
                type="hidden"
                name="reason"
                value="無料のポイント・バッジ試験を今日から4週間実施するため"
              />
              <button className="button button--secondary" type="submit">
                今日から4週間に設定する
              </button>
            </form>
          )}

          <p>
            今後登録する一般参加者も、規約への同意が完了すると自動で対象になります。運営者による選択操作は必要ありません。
          </p>
        </section>

        {policyExpiryNotice ? (
          <section className="settings-card" aria-labelledby="pilot-policy-expiry-title">
            <h2 id="pilot-policy-expiry-title">サービスの試験利用終了日が近づいています</h2>
            <p>
              あと<strong>{policyExpiryNotice.daysRemaining}日</strong>（
              {policyExpiryNotice.endLabel}）で、このサービスのポイントとバッジが停止します。
            </p>
            {platformAdmin ? (
              <a
                className="button button--secondary"
                href={`/admin/groups/${service.serviceId}/features/${db.REWARDS_PILOT_FEATURE_KEY}`}
              >
                サービスの終了日を変更する
              </a>
            ) : (
              <p>継続する場合は、システム管理者へ終了日の変更を依頼してください。</p>
            )}
          </section>
        ) : null}

        <section className="settings-card">
          <h2>無料試験の参加者</h2>
          <p>
            現在、登録と規約への同意を終えた一般参加者
            <strong>{rewardsPilotActiveCount}人全員</strong>がポイントとバッジを利用できます。
          </p>
          {rewardsPolicyActive ? (
            <p>新しく登録した一般参加者も自動で追加されます。</p>
          ) : (
            <p>最初にシステム管理者が、このサービスの試験利用を許可してください。</p>
          )}
          <div className="form-actions">
            {!rewardsPolicyActive && platformAdmin ? (
              <a className="button" href={`/admin/groups/${service.serviceId}/features`}>
                サービスの試験利用を許可する
              </a>
            ) : null}
          </div>
        </section>

        <section className="settings-card" id="pilot-results">
          <h2>試験運用の結果</h2>
          <p>
            {pilotPeriod.status === 'COMPLETED'
              ? '終了した試験期間を固定し、その期間内の結果を表示しています。'
              : pilotPeriod.status === 'UPCOMING'
                ? '試験開始前です。開始後の記録をこの期間へ集計します。'
                : pilotPeriod.status === 'ROLLING'
                  ? '試験期間が未設定のため、現在利用中の参加者について直近28日間を集計しています。'
                  : '設定された試験期間について、現在までの結果を集計しています。'}
          </p>
          <p>集計期間：{pilotPeriodLabel}</p>
          <div className="table-scroll">
            <table>
              <tbody>
                <tr>
                  <th>試験利用者</th>
                  <td>{rewardsPilotMetrics.participantCount}人</td>
                  <td>集計期間中にポイントとバッジを利用できた人数</td>
                </tr>
                <tr>
                  <th>投稿した人</th>
                  <td>
                    {rewardsPilotMetrics.postingUserCount}人（
                    {pilotPercentage(rewardsPilotMetrics.postingUserCount)}）
                  </td>
                  <td>「投稿しました」を1回以上記録した人</td>
                </tr>
                <tr>
                  <th>3日以上続けた人</th>
                  <td>
                    {rewardsPilotMetrics.continuedUserCount}人（
                    {pilotPercentage(rewardsPilotMetrics.continuedUserCount)}）
                  </td>
                  <td>別々の日に3回以上、投稿完了を記録した人</td>
                </tr>
                <tr>
                  <th>ポイントを使った人</th>
                  <td>
                    {rewardsPilotMetrics.redemptionUserCount}人（
                    {pilotPercentage(rewardsPilotMetrics.redemptionUserCount)}）
                  </td>
                  <td>ポイント交換を1回以上行った人</td>
                </tr>
                <tr>
                  <th>期間中の記録</th>
                  <td>{rewardsPilotMetrics.postCount}投稿</td>
                  <td>
                    付与 {rewardsPilotMetrics.grantedPoints}WP／利用{' '}
                    {rewardsPilotMetrics.consumedPoints}WP
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <a
            className="button button--secondary"
            href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=pilot`}
          >
            4週間の試験結果を保存
          </a>

          <h3>確認候補</h3>
          {rewardsPilotMetrics.reviewCandidates.length === 0 ? (
            <p>現在、確認が必要な記録はありません。</p>
          ) : (
            <ul>
              {rewardsPilotMetrics.reviewCandidates.map((candidate) => (
                <li key={candidate.userId}>
                  <strong>{memberName.get(candidate.userId) ?? '参加者'}</strong>：
                  {candidate.reasons.join('、')}
                </li>
              ))}
            </ul>
          )}
          <p>
            <small>
              1日に5件以上、または10分以内に3件以上の投稿完了がある場合に表示します。自動判定は不正を断定するものではありません。入力間違いや操作状況を確認してください。
            </small>
          </p>
        </section>

        <section className="settings-card" id="point-control">
          <h2>ポイント付与の一括停止</h2>
          <p>
            現在は
            <strong>{pointConfiguration.pointIssuanceStopped ? '停止中' : '稼働中'}</strong>
            です。停止中は、行動による自動付与と運営者ボーナスが新しく発行されません。
          </p>
          <p>残高確認、履歴、訂正、失効や返却は継続します。</p>
          <form action={changePointIssuance} className="form-stack">
            <input type="hidden" name="serviceSlug" value={serviceSlug} />
            <input
              type="hidden"
              name="target"
              value={pointConfiguration.pointIssuanceStopped ? 'resume' : 'stop'}
            />
            <label className="field">
              <span className="field__label">
                {pointConfiguration.pointIssuanceStopped ? '再開する理由' : '停止する理由'}
              </span>
              <textarea
                className="field__control"
                name="reason"
                minLength={3}
                maxLength={1000}
                required
              />
            </label>
            <button
              className={`button${pointConfiguration.pointIssuanceStopped ? '' : ' button--secondary'}`}
              type="submit"
            >
              {pointConfiguration.pointIssuanceStopped
                ? 'ポイント付与を再開'
                : 'ポイント付与を一括停止'}
            </button>
          </form>
        </section>

        <section className="settings-card" id="redemption-history">
          <h2>最近のポイント交換</h2>
          <p>誰が、何に、何WPを使ったかを確認できます。失敗して返却された処理も残ります。</p>
          {recentRedemptions.length === 0 ? (
            <p>ポイント交換の履歴はまだありません。</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>参加者</th>
                    <th>交換内容</th>
                    <th>使用WP</th>
                    <th>状態</th>
                    <th>日時</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRedemptions.map((redemption) => (
                    <tr key={redemption.id}>
                      <td>{redemption.user.displayName || redemption.user.email || '参加者'}</td>
                      <td>{redemption.catalogItem.title}</td>
                      <td>{redemption.pointCost.toLocaleString('ja-JP')} WP</td>
                      <td>{redemptionStatusLabels[redemption.status]}</td>
                      <td>
                        {(redemption.confirmedAt ?? redemption.createdAt).toLocaleString('ja-JP')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="settings-card">
          <h2>参加者のポイント・バッジ状況</h2>
          <p>
            現在のWPは、この参加者が同じワークスペースで使える共通残高です。「サービス内の増減」とバッジは、このサービスの活動だけを表示します。
          </p>
          <p>運用記録はCSVで保存できます。ExcelやGoogleスプレッドシートで開けます。</p>
          <div className="button-row">
            <a
              className="button button--secondary"
              href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=summary`}
            >
              参加者一覧を保存
            </a>
            <a
              className="button button--secondary"
              href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=points`}
            >
              ポイント履歴を保存
            </a>
            <a
              className="button button--secondary"
              href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=badges`}
            >
              バッジ履歴を保存
            </a>
            <a
              className="button button--secondary"
              href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=audit`}
            >
              運営操作履歴を保存
            </a>
          </div>
          {memberships.length === 0 ? (
            <p>参加者はまだいません。</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>参加者</th>
                    <th>現在のWP</th>
                    <th>回収未済</th>
                    <th>サービス内の増減</th>
                    <th>獲得バッジ</th>
                    <th>最終更新</th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((membership) => {
                    const account = pointAccountByUser.get(membership.userId);
                    const change = pointChangeByUser.get(membership.userId) ?? 0;
                    const latest = latestActivityByUser.get(membership.userId);
                    return (
                      <tr key={membership.userId}>
                        <td>
                          <strong>
                            {membership.user.displayName ||
                              membership.user.email ||
                              membership.userId}
                          </strong>
                          <br />
                          <small>
                            {membership.serviceRole === 'SERVICE_OWNER'
                              ? 'サービス所有者'
                              : membership.serviceRole === 'SERVICE_ADMIN'
                                ? '運営管理者'
                                : membership.serviceRole === 'CONTENT_EDITOR'
                                  ? 'コンテンツ担当者'
                                  : '参加者'}
                          </small>
                        </td>
                        <td>{(account?.availablePoints ?? 0).toLocaleString('ja-JP')} WP</td>
                        <td>
                          {account?.recoveryDue ? (
                            <strong className="status-warning">
                              {account.recoveryDue.toLocaleString('ja-JP')} WP
                            </strong>
                          ) : (
                            'なし'
                          )}
                        </td>
                        <td>
                          {change > 0 ? '+' : ''}
                          {change.toLocaleString('ja-JP')} WP
                        </td>
                        <td>{badgeCountByUser.get(membership.userId) ?? 0}個</td>
                        <td>{latest ? latest.toLocaleString('ja-JP') : 'まだありません'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="settings-card" id="point-rules">
          <h2>ポイントのため方を設定</h2>
          <p>
            チェックを外すと、その条件からはポイントが付かなくなります。変更前の履歴も残ります。
          </p>
          <form action={saveRules} className="form-stack">
            <input type="hidden" name="serviceSlug" value={serviceSlug} />
            {RULES.map((rule) => {
              const saved = current.get(rule.key);
              return (
                <fieldset className="settings-card" key={rule.key}>
                  <legend>
                    <strong>{rule.label}</strong>
                  </legend>
                  <label className="field">
                    <span className="field__label">利用する</span>
                    <input
                      name={`enabled_${rule.key}`}
                      type="checkbox"
                      defaultChecked={!saved || saved.status === 'ACTIVE'}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">もらえるポイント</span>
                    <input
                      className="field__control"
                      name={rule.key}
                      type="number"
                      min="1"
                      max="10000"
                      defaultValue={saved?.grantAmount ?? rule.defaultAmount}
                      required
                    />
                  </label>
                  <small>{rule.help}</small>
                  <label className="field">
                    <span className="field__label">この設定で発行できる合計上限</span>
                    <input
                      className="field__control"
                      name={rule.budgetKey}
                      type="number"
                      min="1"
                      max="10000000"
                      defaultValue={saved?.budget?.maximumPoints ?? ''}
                      placeholder="空欄なら上限なし"
                    />
                  </label>
                  {saved?.budget ? (
                    <small>
                      現在 {saved.budget.grantedPoints.toLocaleString('ja-JP')} WP発行済み／残り
                      {(saved.budget.maximumPoints - saved.budget.grantedPoints).toLocaleString(
                        'ja-JP',
                      )}{' '}
                      WP
                    </small>
                  ) : (
                    <small>上限なしで発行します。</small>
                  )}
                </fieldset>
              );
            })}
            <label className="field">
              <span className="field__label">変更理由</span>
              <textarea
                className="field__control"
                name="reason"
                minLength={3}
                maxLength={1000}
                required
              />
            </label>
            <button className="button" type="submit">
              ポイント設定を保存
            </button>
          </form>
        </section>

        <section className="settings-card" id="campaign-point-rules">
          <h2>募集ごとのポイントを設定</h2>
          <p>
            特定の募集だけポイント数を変えられます。「サービス設定を使う」を選ぶと、上の通常設定に戻ります。
          </p>
          {campaigns.length === 0 ? (
            <>
              <p>設定できる募集中・準備中の企画はありません。</p>
              <a className="button button--secondary" href={`/s/${serviceSlug}/manage/campaigns`}>
                参加募集を確認
              </a>
            </>
          ) : (
            <div className="form-stack">
              {campaigns.map((campaign) => (
                <form
                  action={saveCampaignRules}
                  className="settings-card form-stack"
                  key={campaign.id}
                >
                  <input type="hidden" name="serviceSlug" value={serviceSlug} />
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <h3>{campaign.name}</h3>
                  <p>
                    {campaign.status === 'OPEN' ? '募集中' : '準備中'}／
                    {campaign.startsAt.toLocaleDateString('ja-JP')}〜
                    {campaign.endsAt.toLocaleDateString('ja-JP')}
                  </p>
                  {RULES.map((rule) => {
                    const saved = campaign.pointRuleVersions.find(
                      (version) => version.ruleKey === rule.key,
                    );
                    const serviceRule = current.get(rule.key);
                    return (
                      <fieldset key={rule.key}>
                        <legend>
                          <strong>{rule.label}</strong>
                        </legend>
                        <label className="field">
                          <span className="field__label">この募集での設定</span>
                          <select
                            className="field__control"
                            name={`mode_${rule.key}`}
                            defaultValue={saved?.status ?? 'INHERIT'}
                          >
                            <option value="INHERIT">サービス設定を使う</option>
                            <option value="ACTIVE">この募集専用のポイント数にする</option>
                            <option value="SUSPENDED">この募集では付与しない</option>
                          </select>
                        </label>
                        <label className="field">
                          <span className="field__label">この募集でもらえるポイント</span>
                          <input
                            className="field__control"
                            name={rule.key}
                            type="number"
                            min="1"
                            max="10000"
                            defaultValue={
                              saved?.grantAmount ?? serviceRule?.grantAmount ?? rule.defaultAmount
                            }
                            required
                          />
                        </label>
                        <label className="field">
                          <span className="field__label">この募集で発行できる合計上限</span>
                          <input
                            className="field__control"
                            name={rule.budgetKey}
                            type="number"
                            min="1"
                            max="10000000"
                            defaultValue={saved?.budget?.maximumPoints ?? ''}
                            placeholder="専用設定時のみ。空欄なら上限なし"
                          />
                        </label>
                        {saved?.budget ? (
                          <small>
                            現在 {saved.budget.grantedPoints.toLocaleString('ja-JP')}{' '}
                            WP発行済み／残り
                            {(
                              saved.budget.maximumPoints - saved.budget.grantedPoints
                            ).toLocaleString('ja-JP')}{' '}
                            WP
                          </small>
                        ) : null}
                      </fieldset>
                    );
                  })}
                  <label className="field">
                    <span className="field__label">変更理由</span>
                    <textarea
                      className="field__control"
                      name="reason"
                      minLength={3}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <button className="button" type="submit">
                    この募集の設定を保存
                  </button>
                </form>
              ))}
            </div>
          )}
        </section>

        <section className="settings-card" id="point-rewards">
          <h2>ポイントの使い道を設定</h2>
          <p>
            チェックを外すと、参加者の画面から消え、新しい交換もできなくなります。すでに完了した交換の履歴は残ります。
          </p>
          <form action={saveRewardSettings} className="form-stack">
            <input type="hidden" name="serviceSlug" value={serviceSlug} />
            {REWARDS.map((reward) => {
              const saved = currentRewardSettings.get(reward.type);
              return (
                <fieldset className="settings-card" key={reward.type}>
                  <legend>
                    <strong>{reward.label}</strong>
                  </legend>
                  <label className="field">
                    <span className="field__label">利用する</span>
                    <input
                      name={`enabled_${reward.type}`}
                      type="checkbox"
                      defaultChecked={!saved || saved.status === 'ACTIVE'}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">必要なポイント</span>
                    <input
                      className="field__control"
                      name={reward.type}
                      type="number"
                      min="1"
                      max="10000"
                      defaultValue={
                        saved?.pointCost ??
                        globalRewardDefaults.get(reward.type) ??
                        reward.defaultCost
                      }
                      required
                    />
                  </label>
                  <small>{reward.help}</small>
                </fieldset>
              );
            })}
            <label className="field">
              <span className="field__label">変更理由</span>
              <textarea
                className="field__control"
                name="reason"
                minLength={3}
                maxLength={1000}
                required
              />
            </label>
            <button className="button" type="submit">
              使い道の設定を保存
            </button>
          </form>
        </section>

        <section className="settings-card">
          <h2>参加者へボーナスを付与</h2>
          <p>イベントやお礼など、運営判断でポイントを追加できます。理由と実行者を記録します。</p>
          <p>運営者自身への付与はできません。</p>
          {bonusRecipients.length === 0 ? (
            <p>付与できる参加者はまだいません。</p>
          ) : (
            <form action={grantBonus} className="form-stack">
              <input type="hidden" name="serviceSlug" value={serviceSlug} />
              <input type="hidden" name="operationId" value={randomUUID()} />
              <label className="field">
                <span className="field__label">参加者</span>
                <select className="field__control" name="userId" required>
                  {bonusRecipients.map((membership) => (
                    <option key={membership.userId} value={membership.userId}>
                      {membership.user.displayName || membership.user.email || membership.userId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">追加するポイント</span>
                <input
                  className="field__control"
                  name="amount"
                  type="number"
                  min="1"
                  max="10000"
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">付与する理由</span>
                <textarea
                  className="field__control"
                  name="reason"
                  minLength={3}
                  maxLength={1000}
                  required
                />
              </label>
              <button
                className="button"
                type="submit"
                disabled={pointConfiguration.pointIssuanceStopped}
              >
                {pointConfiguration.pointIssuanceStopped ? '一括停止中' : 'ボーナスを付与'}
              </button>
            </form>
          )}
        </section>

        <section className="settings-card" id="point-recovery">
          <h2>誤付与ポイントを回収</h2>
          <p>
            誤って付与した合計額を入力します。残高で足りない分は「回収未済」として残り、解消するまでポイント交換を停止します。
          </p>
          <p>その後にもらうポイントは、回収未済分へ自動で充てられます。</p>
          <form action={correctPoints} className="form-stack">
            <input type="hidden" name="serviceSlug" value={serviceSlug} />
            <input type="hidden" name="operationId" value={randomUUID()} />
            <label className="field">
              <span className="field__label">参加者</span>
              <select className="field__control" name="userId" required>
                {memberships.map((membership) => (
                  <option key={membership.userId} value={membership.userId}>
                    {membership.user.displayName || membership.user.email || membership.userId}
                    （現在
                    {pointAccountByUser.get(membership.userId)?.availablePoints ?? 0} WP／回収未済
                    {pointAccountByUser.get(membership.userId)?.recoveryDue ?? 0} WP）
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">誤って付与したポイント</span>
              <input
                className="field__control"
                name="amount"
                type="number"
                min="1"
                max="10000"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">回収する理由（本人にも表示されます）</span>
              <textarea
                className="field__control"
                name="reason"
                minLength={3}
                maxLength={1000}
                required
              />
            </label>
            <button className="button button--secondary" type="submit">
              回収を記録
            </button>
          </form>
        </section>

        <section className="settings-card" id="point-recovery-cancellation">
          <h2>回収を取り消す</h2>
          <p>
            回収する相手や金額を間違えた場合に使います。回収済みのポイントは本人へ戻り、回収未済分も解除されます。
          </p>
          {cancellableRecoveries.length === 0 ? (
            <p>取り消せる回収記録はありません。</p>
          ) : (
            <form action={cancelRecovery} className="form-stack">
              <input type="hidden" name="serviceSlug" value={serviceSlug} />
              <input type="hidden" name="operationId" value={randomUUID()} />
              <label className="field">
                <span className="field__label">取り消す回収記録</span>
                <select className="field__control" name="recoveryTransactionId" required>
                  {cancellableRecoveries.map((recovery) => {
                    const recovered = recovery.consumptionFor.reduce(
                      (sum, link) => sum + link.amount,
                      0,
                    );
                    return (
                      <option key={recovery.id} value={recovery.id}>
                        {recovery.user.displayName || recovery.user.email || recovery.userId}／
                        {Math.abs(recovery.amount)} WP／回収済み{recovered} WP／
                        {recovery.createdAt.toLocaleDateString('ja-JP')}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="field">
                <span className="field__label">取り消す理由（本人にも表示されます）</span>
                <textarea
                  className="field__control"
                  name="reason"
                  minLength={3}
                  maxLength={1000}
                  required
                />
              </label>
              <button className="button button--secondary" type="submit">
                この回収を取り消す
              </button>
            </form>
          )}
        </section>

        <section className="settings-card">
          <h2>バッジを設定・付与</h2>
          <p>このサービス専用のバッジを作り、参加者を選んで付与できます。</p>
          <a className="button button--secondary" href={`/s/${serviceSlug}/manage/badges`}>
            バッジ管理を開く
          </a>
        </section>

        <section className="settings-card">
          <h2>最近の変更履歴</h2>
          {history.length === 0 ? (
            <p>まだ変更はありません。</p>
          ) : (
            <ul>
              {history.map((item) => {
                const data =
                  item.afterData &&
                  typeof item.afterData === 'object' &&
                  !Array.isArray(item.afterData)
                    ? (item.afterData as Record<string, unknown>)
                    : {};
                const target = typeof data.userId === 'string' ? memberName.get(data.userId) : null;
                const amount = typeof data.amount === 'number' ? data.amount : '';
                return (
                  <li key={item.id}>
                    <strong>
                      {item.action === 'POINT_RULES_UPDATED'
                        ? '獲得条件を変更'
                        : item.action === 'CAMPAIGN_POINT_RULES_UPDATED'
                          ? `${typeof data.campaignName === 'string' ? data.campaignName : '募集'}のポイント条件を変更`
                          : item.action === 'POINT_REWARDS_UPDATED'
                            ? 'ポイントの使い道を変更'
                            : item.action === 'POINT_ISSUANCE_STOPPED'
                              ? 'ポイント付与を一括停止'
                              : item.action === 'POINT_ISSUANCE_RESUMED'
                                ? 'ポイント付与を再開'
                                : item.action === 'POINT_BALANCE_CORRECTED'
                                  ? `${target ?? '参加者'}のポイントを ${Math.abs(Number(amount))} WP訂正`
                                  : item.action === 'POINT_RECOVERY_REGISTERED'
                                    ? `${target ?? '参加者'}から ${Math.abs(Number(amount))} WP回収`
                                    : item.action === 'POINT_RECOVERY_CANCELLED'
                                      ? `${target ?? '参加者'}の回収 ${Math.abs(Number(amount))} WPを取消`
                                      : `${target ?? '参加者'}へ ${amount} WP付与`}
                    </strong>
                    <br />
                    {item.occurredAt.toLocaleString('ja-JP')}／
                    {item.performedBy.displayName || item.performedBy.email || '運営者'}／
                    {item.reason}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
