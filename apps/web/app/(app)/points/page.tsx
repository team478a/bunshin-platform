import { GetPointUserDashboard, type PointTransactionType } from '@bunshin/application';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const ruleLabels: Record<string, string> = {
  MISSION_VIEWED_DAILY: '今日の企画をはじめて見る',
  POSTED_DAILY: '「投稿しました」を押す',
  THREE_POSTS_WEEKLY: '1週間に3回投稿する',
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

export default async function PointsPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const workspace = (await db.listActiveWorkspacesForUser(user.userId))[0];
  if (!workspace) redirect('/bunshins');

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
  return (
    <main className="app-page points-page">
      <header className="app-page__heading">
        <p className="eyebrow">ワタシポイント</p>
        <h1>ポイント</h1>
        <p>投稿を続けると、ポイントがたまります。</p>
      </header>

      <section className="point-balance" aria-labelledby="point-balance-title">
        <span id="point-balance-title">いま使えるポイント</span>
        <strong>
          {dashboard.account.availablePoints.toLocaleString('ja-JP')}
          <small> WP</small>
        </strong>
        {dashboard.nextExpiryAt ? (
          <p>
            {date(dashboard.nextExpiryAt)}までに期限を迎える予定: {dashboard.expiringWithin30Days}{' '}
            WP
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
