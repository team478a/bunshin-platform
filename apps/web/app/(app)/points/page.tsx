import {
  GetPointUserDashboard,
  ListPointRewardCatalog,
  type PointTransactionType,
} from '@bunshin/application';
import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';
import { getRewardsPilotExpiryNotice } from '../../../src/rewards/rewards-pilot-expiry';
import { RewardsPilotExpiryNoticeCard } from '../../ui/rewards-pilot-expiry-notice';
import { buildPointUseOptions } from '../../../src/rewards/point-use-options';

export const dynamic = 'force-dynamic';

const ruleLabels: Record<string, string> = {
  MISSION_VIEWED_DAILY: '今日の企画をはじめて見る',
  POSTED_DAILY: 'SNSへ投稿した後に「投稿しました」を押す',
  POSTED_WEEKLY_3: '「投稿しました」の記録が1週間に3回になる',
};

const transactionLabels: Record<PointTransactionType, string> = {
  GRANT: 'ポイントをもらいました',
  CONSUME: 'ポイントを使いました',
  REVERSAL: '取り消しがありました',
  REFUND: 'ポイントが戻りました',
  EXPIRE: '期限が切れました',
  RECOVERY: '不足分を回収しました',
};

const date = (value: Date) =>
  new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(value);

export default async function PointsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const workspaces = await db.listActiveWorkspacesForUser(user.userId);
  const requestedWorkspaceId = (await searchParams).workspaceId;
  const workspace = requestedWorkspaceId
    ? workspaces.find(({ id }) => id === requestedWorkspaceId)
    : workspaces[0];
  if (!workspace) redirect('/bunshins');

  const pilotAccess = await db.getActiveRewardsPilotAccess(db.prisma, {
    workspaceId: workspace.id,
    userId: user.userId,
  });
  if (!pilotAccess) {
    return (
      <main className="app-page points-page">
        <header className="app-page__heading">
          <p className="eyebrow">ワタシポイント</p>
          <h1>ポイント</h1>
        </header>
        <section className="settings-card point-unavailable">
          <h2>現在は試験利用中です</h2>
          <p>ポイントとバッジは、運営者から案内を受けた方だけ利用できます。</p>
          <Link className="button button--secondary" href="/bunshins">
            ホームへ戻る
          </Link>
        </section>
      </main>
    );
  }
  const pilotExpiryNotice = getRewardsPilotExpiryNotice(pilotAccess.endsAt);

  let dashboard;
  try {
    dashboard = await new GetPointUserDashboard(new db.PrismaPointLedgerRepository()).execute({
      workspaceId: workspace.id,
      actorUserId: user.userId,
      timezone: 'Asia/Tokyo',
    });
  } catch {
    return (
      <main className="app-page points-page">
        <header className="app-page__heading">
          <p className="eyebrow">ワタシポイント</p>
          <h1>ポイント</h1>
        </header>
        <section className="settings-card point-unavailable">
          <h2>いまはポイントを確認できません</h2>
          <p>ほかの機能はそのまま使えます。時間をおいて、もう一度お試しください。</p>
          <Link className="button button--secondary" href="/bunshins">
            ホームへ戻る
          </Link>
        </section>
      </main>
    );
  }

  const progress = Math.min(100, (dashboard.weeklyPosts / dashboard.weeklyPostGoal) * 100);
  const service = await db.prisma.group.findFirst({
    where: {
      id: pilotAccess.groupId,
      workspaceId: workspace.id,
      status: 'ACTIVE',
    },
    select: {
      serviceConfiguration: { select: { slug: true } },
      bunshins: {
        where: { ownerUserId: user.userId, status: { not: 'ARCHIVED' } },
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
  });
  const serviceSlug = service?.serviceConfiguration?.slug;
  const bunshinId = service?.bunshins[0]?.id;
  const alternativePlanHref = serviceSlug
    ? bunshinId
      ? `/s/${encodeURIComponent(serviceSlug)}/bunshins/${bunshinId}#today-post`
      : `/s/${encodeURIComponent(serviceSlug)}/bunshins`
    : null;
  const imageAccess = serviceSlug
    ? await new db.PrismaGroupFeatureEntitlementRepository()
        .resolveAccess({
          workspaceId: workspace.id,
          groupId: pilotAccess.groupId,
          actorUserId: user.userId,
          featureKey: 'SOCIAL.IMAGE_GENERATION',
          now: new Date(),
        })
        .catch(() => null)
    : null;
  const catalog = await new ListPointRewardCatalog(new db.PrismaPointRedemptionRepository())
    .execute({
      workspaceId: workspace.id,
      groupId: pilotAccess.groupId,
      actorUserId: user.userId,
    })
    .catch(() => []);
  const pointUseOptions = buildPointUseOptions({
    catalog,
    availablePoints: dashboard.account.availablePoints,
    destinations: {
      ...(alternativePlanHref
        ? {
            ALTERNATIVE_PLAN_GENERATION: {
              href: alternativePlanHref,
              actionLabel: bunshinId ? '今日の投稿案を開く' : '投稿パートナーを作る',
            },
          }
        : {}),
      ...(serviceSlug && imageAccess?.allowed
        ? {
            SOCIAL_IMAGE_GENERATION: {
              href: `/s/${encodeURIComponent(serviceSlug)}/images`,
              actionLabel: '画像を作る画面を開く',
            },
          }
        : {}),
    },
  });
  return (
    <main className="app-page points-page">
      <header className="app-page__heading">
        <p className="eyebrow">ワタシポイント</p>
        <h1>ポイント</h1>
        <p>投稿を続けると、ポイントがたまります。</p>
        {workspaces.length > 1 ? (
          <form action="/points" method="get" className="form-stack">
            <label className="field">
              <span className="field__label">表示するサービス</span>
              <select className="field__control" name="workspaceId" defaultValue={workspace.id}>
                {workspaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button--secondary" type="submit">
              このサービスのポイントを見る
            </button>
          </form>
        ) : null}
      </header>

      <RewardsPilotExpiryNoticeCard notice={pilotExpiryNotice} />

      <section className="point-balance" aria-labelledby="point-balance-title">
        <span id="point-balance-title">いま使えるポイント</span>
        <strong>
          {dashboard.account.availablePoints.toLocaleString('ja-JP')}
          <small> WP</small>
        </strong>
        {dashboard.nextExpiryAt ? (
          <p>
            今後30日以内に期限を迎える予定: {dashboard.expiringWithin30Days} WP（最も近い期限は
            {date(dashboard.nextExpiryAt)}）
          </p>
        ) : (
          <p>30日以内に期限を迎えるポイントはありません。</p>
        )}
      </section>

      <section className="settings-card point-progress" aria-labelledby="weekly-progress-title">
        <h2 id="weekly-progress-title">今週の投稿</h2>
        <div className="point-progress__summary">
          <strong>{dashboard.weeklyPosts}回</strong>
          <span> / あと{Math.max(0, dashboard.weeklyPostGoal - dashboard.weeklyPosts)}回</span>
        </div>
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuenow={dashboard.weeklyPosts}
          aria-valuemin={0}
          aria-valuemax={dashboard.weeklyPostGoal}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <p>
          {dashboard.weeklyPosts >= dashboard.weeklyPostGoal
            ? '今週の目標を達成しました。'
            : '1週間に3回投稿すると、追加ポイントの対象になります。'}
        </p>
      </section>

      <section className="settings-card" aria-labelledby="earn-points-title">
        <h2 id="earn-points-title">ポイントのため方</h2>
        {dashboard.earningMethods.length ? (
          <ul className="point-methods">
            {dashboard.earningMethods.map((method) => (
              <li key={method.ruleKey}>
                <span>{ruleLabels[method.ruleKey] ?? '決められた行動をする'}</span>
                <strong>+{method.grantAmount} WP</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p>いま利用できる、ため方はありません。</p>
        )}
        <p>
          「投稿しました」は自己申告です。SNSへの実際の投稿は自動確認されません。実際に投稿した後で記録してください。
        </p>
      </section>

      <section className="settings-card" aria-labelledby="use-points-title">
        <h2 id="use-points-title">ポイントの使い道</h2>
        <p>
          使いたいものを選び、次の画面で内容を確認します。このページを見ただけではポイントは減りません。
        </p>
        {pointUseOptions.length ? (
          <ul className="point-use-options">
            {pointUseOptions.map((option) => (
              <li key={option.id}>
                <div className="point-use-options__heading">
                  <strong>{option.title}</strong>
                  <b>{option.pointCost} WP</b>
                </div>
                <p>{option.description}</p>
                <p className={option.pointsNeeded === 0 ? 'is-ready' : 'is-waiting'}>
                  {option.pointsNeeded === 0
                    ? 'いま使えます'
                    : `あと ${option.pointsNeeded} WP たまると使えます`}
                </p>
                <Link className="button button--secondary button--full" href={option.href as Route}>
                  {option.actionLabel}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>いま利用できる使い道はありません。利用できるようになると、ここに表示されます。</p>
        )}
      </section>

      <section className="settings-card" aria-labelledby="point-reflection-title">
        <h2 id="point-reflection-title">ポイントが増えるまで</h2>
        <ol className="reward-help-steps">
          <li>今日の投稿案を開く、またはSNSへの投稿を記録します。</li>
          <li>通常1分ほど待ち、このページを開き直します。</li>
          <li>増えた内容は、下の「最近の履歴」で確認できます。</li>
        </ol>
        <p>
          同じ行動でもらえるポイントは原則1日1回です。すでに受け取った日は、もう一度操作しても増えません。
        </p>
        <Link
          className="button button--secondary"
          href={`/badges?workspaceId=${encodeURIComponent(workspace.id)}` as Route}
        >
          バッジの進み具合を見る
        </Link>
      </section>

      <section className="settings-card" aria-labelledby="point-history-title">
        <h2 id="point-history-title">最近の履歴</h2>
        {dashboard.recentTransactions.length ? (
          <ul className="point-history">
            {dashboard.recentTransactions.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{transactionLabels[item.type]}</strong>
                  <small>{date(item.createdAt)}</small>
                </span>
                <b className={item.amount >= 0 ? 'is-positive' : ''}>
                  {item.amount > 0 ? '+' : ''}
                  {item.amount} WP
                </b>
              </li>
            ))}
          </ul>
        ) : (
          <p>ポイントの履歴はまだありません。</p>
        )}
      </section>
    </main>
  );
}
