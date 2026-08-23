import { ADMIN_USER_STAGES, GetAdminOperationsSnapshot } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import Link from 'next/link';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';
import { dateTime, percentage, resolvePeriod, stageLabels, usd } from './view-model';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string; attention?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const query = await searchParams;
  const period = resolvePeriod(query);
  const db = await import('@bunshin/database');
  let snapshot;
  try {
    snapshot = await new GetAdminOperationsSnapshot(
      new db.PrismaAdminOperationsRepository(),
    ).execute({
      actorUserId: actor.userId,
      environment: currentLineEnvironment(),
      from: period.from,
      to: period.to,
      ...(query.q ? { query: query.q } : {}),
      limit: 200,
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const users =
    query.attention === '1'
      ? snapshot.users.filter(({ attentionReason }) => attentionReason)
      : snapshot.users;

  return (
    <main className="app-page validation-dashboard">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>ユーザーと利用状況</h1>
        <p>個人の投稿内容は表示せず、利用の進み方と困っている状態を確認します。</p>
      </header>

      <form className="validation-filter" method="get">
        <label>
          開始日
          <input type="date" name="from" defaultValue={period.fromInput} />
        </label>
        <label>
          終了日
          <input type="date" name="to" defaultValue={period.toInput} />
        </label>
        <label>
          名前・メール
          <input name="q" defaultValue={query.q ?? ''} maxLength={100} />
        </label>
        <label>
          <input
            type="checkbox"
            name="attention"
            value="1"
            defaultChecked={query.attention === '1'}
          />
          確認が必要な人だけ
        </label>
        <button type="submit">表示を更新</button>
      </form>

      <section aria-labelledby="operation-summary">
        <h2 id="operation-summary">現在の状況</h2>
        <div className="validation-kpi-grid">
          <article>
            <strong>{snapshot.totals.users}</strong>
            <span>全ユーザー</span>
          </article>
          <article>
            <strong>{snapshot.totals.newUsers}</strong>
            <span>期間内の新規登録</span>
          </article>
          <article>
            <strong>{snapshot.totals.posts}</strong>
            <span>期間内の投稿完了</span>
          </article>
          <article>
            <strong>{snapshot.totals.lineConnectedUsers}</strong>
            <span>LINE接続中</span>
          </article>
          <article>
            <strong>{snapshot.totals.attentionUsers}</strong>
            <span>確認が必要</span>
          </article>
          <article>
            <strong>{snapshot.totals.aiCalls}</strong>
            <span>AI実行</span>
          </article>
          <article>
            <strong>{snapshot.totals.aiFailedCalls}</strong>
            <span>AI失敗</span>
          </article>
          <article>
            <strong>{usd(snapshot.totals.estimatedAiCostUsdMicros)}</strong>
            <span>AI見積原価</span>
          </article>
        </div>
      </section>

      <section aria-labelledby="all-funnel">
        <h2 id="all-funnel">登録してから投稿するまで</h2>
        <div className="validation-table-wrap">
          <table className="validation-table">
            <thead>
              <tr>
                <th>段階</th>
                <th>人数</th>
                <th>登録者からの割合</th>
              </tr>
            </thead>
            <tbody>
              {ADMIN_USER_STAGES.map((stage) => (
                <tr key={stage}>
                  <th>{stageLabels[stage]}</th>
                  <td>{snapshot.funnel[stage]}人</td>
                  <td>{percentage(snapshot.funnel[stage], snapshot.funnel.REGISTERED)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="user-list">
        <h2 id="user-list">ユーザー一覧</h2>
        <div className="validation-table-wrap">
          <table className="validation-table">
            <thead>
              <tr>
                <th>ユーザー</th>
                <th>現在の段階</th>
                <th>最終利用</th>
                <th>投稿</th>
                <th>確認事項</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link href={`/admin/users/${user.id}` as Route}>
                      <strong>{user.displayName}</strong>
                    </Link>
                    <br />
                    <small>
                      {user.email ?? 'メールなし'} ／{' '}
                      {user.authProviders.join('・') || '認証確認中'}
                    </small>
                  </td>
                  <td>{stageLabels[user.stage]}</td>
                  <td>{dateTime(user.lastActiveAt)}</td>
                  <td>{user.postCount}回</td>
                  <td>{user.attentionReason ?? 'なし'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 ? <p>条件に当てはまるユーザーはいません。</p> : null}
        {snapshot.truncated ? (
          <p>件数が多いため一部だけ表示しています。検索条件を追加してください。</p>
        ) : null}
      </section>
    </main>
  );
}
