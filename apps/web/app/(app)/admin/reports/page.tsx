import { ADMIN_USER_STAGES, GetAdminOperationsSnapshot } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';
import { percentage, resolvePeriod, stageLabels, usd } from '../users/view-model';

export const dynamic = 'force-dynamic';

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const period = resolvePeriod(await searchParams);
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
      limit: 200,
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const query = `from=${period.fromInput}&to=${period.toInput}`;
  return (
    <main className="app-page validation-dashboard">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>運用レポート</h1>
        <p>サービスの利用状況を期間で確認し、表計算ソフトで使えるファイルを保存できます。</p>
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
        <button type="submit">表示を更新</button>
      </form>
      <section className="settings-card" aria-labelledby="download-title">
        <h2 id="download-title">ファイルを保存</h2>
        <p>投稿本文、問い合わせメモ、APIキーなどの秘密情報は含まれません。</p>
        <a
          className="button button--secondary"
          href={`/api/admin/reports/export?type=summary&${query}`}
        >
          集計表を保存
        </a>{' '}
        <a
          className="button button--secondary"
          href={`/api/admin/reports/export?type=users&${query}`}
        >
          ユーザー一覧を保存
        </a>
        <p>
          <small>ユーザー一覧は最大5,000件です。件数を超える場合は期間を分けてください。</small>
        </p>
      </section>
      <section aria-labelledby="report-summary">
        <h2 id="report-summary">期間内のまとめ</h2>
        <div className="validation-kpi-grid">
          <article>
            <strong>{snapshot.totals.newUsers}</strong>
            <span>新規登録</span>
          </article>
          <article>
            <strong>{snapshot.totals.posts}</strong>
            <span>投稿完了</span>
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
          <article>
            <strong>{snapshot.totals.lineConnectedUsers}</strong>
            <span>LINE接続中</span>
          </article>
        </div>
      </section>
      <section aria-labelledby="report-funnel">
        <h2 id="report-funnel">登録してから投稿するまで</h2>
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
    </main>
  );
}
