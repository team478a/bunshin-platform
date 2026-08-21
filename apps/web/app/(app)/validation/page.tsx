import { GetValidationMetrics } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';
import { funnelRows, percentage, resolveValidationPeriod, usdFromMicros } from './view-model';

export const dynamic = 'force-dynamic';

export default async function ValidationPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; from?: string; to?: string }>;
}) {
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  if (currentUser === null) redirect('/login');
  const query = await searchParams;
  const { listActiveWorkspacesForUser, PrismaValidationMetricsRepository } =
    await import('@bunshin/database');
  const workspaces = await listActiveWorkspacesForUser(currentUser.userId);
  const workspace = query.workspaceId
    ? workspaces.find(({ id }) => id === query.workspaceId)
    : workspaces[0];
  if (!workspace) notFound();
  const period = resolveValidationPeriod(query);
  let metrics;
  try {
    metrics = await new GetValidationMetrics(new PrismaValidationMetricsRepository()).execute({
      workspaceId: workspace.id,
      actorUserId: currentUser.userId,
      from: period.from,
      to: period.to,
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const outcomes = metrics.outcomes;

  return (
    <main className="validation-dashboard">
      <p>
        <Link href="/bunshins">← BUNSHINへ戻る</Link>
      </p>
      <header className="validation-header">
        <div>
          <p className="validation-eyebrow">100-user Validation</p>
          <h1>FREE MVP 検証指標</h1>
          <p>{workspace.name}の集計値です。個人情報や投稿内容は表示しません。</p>
        </div>
      </header>

      <form className="validation-filter" method="get">
        <input type="hidden" name="workspaceId" value={workspace.id} />
        <label>
          開始日
          <input type="date" name="from" defaultValue={period.fromInput} required />
        </label>
        <label>
          終了日
          <input type="date" name="to" defaultValue={period.toInput} required />
        </label>
        <button type="submit">期間を更新</button>
      </form>
      {period.usedFallback && query.from !== undefined ? (
        <p className="validation-notice">期間が正しくないため、直近30日を表示しました。</p>
      ) : null}

      <section aria-labelledby="primary-kpi">
        <h2 id="primary-kpi">最重要KPI</h2>
        <div className="validation-primary-card">
          <strong>{percentage(outcomes.threePostsInFirstSevenDaysRate)}</strong>
          <span>登録後7日以内に3回以上投稿したユーザー率</span>
          <small>
            {outcomes.threePostsInFirstSevenDaysUsers}人 / 観測完了
            {outcomes.eligibleFirstSevenDayUsers}人
          </small>
        </div>
      </section>

      <section aria-labelledby="outcome-kpi">
        <h2 id="outcome-kpi">行動指標</h2>
        <div className="validation-kpi-grid">
          <article>
            <strong>{outcomes.postCount}</strong>
            <span>投稿件数</span>
          </article>
          <article>
            <strong>{outcomes.postedUsers}</strong>
            <span>投稿ユーザー</span>
          </article>
          <article>
            <strong>{percentage(outcomes.goodFeedbackRate)}</strong>
            <span>GOOD率</span>
          </article>
          <article>
            <strong>{percentage(outcomes.d7ActiveRate)}</strong>
            <span>D7 Active率</span>
          </article>
          <article>
            <strong>{outcomes.aiCalls}</strong>
            <span>AI実行回数</span>
          </article>
          <article>
            <strong>{outcomes.aiInputTokens + outcomes.aiOutputTokens}</strong>
            <span>AI token合計</span>
          </article>
          <article>
            <strong>{outcomes.aiFailedCalls}</strong>
            <span>AI失敗回数</span>
          </article>
          <article>
            <strong>{usdFromMicros(outcomes.aiEstimatedCostUsdMicros)}</strong>
            <span>AI見積原価</span>
            {outcomes.aiPricedCalls < outcomes.aiCalls ? (
              <small>未価格の実行を含みます</small>
            ) : null}
          </article>
        </div>
      </section>

      <section aria-labelledby="funnel-heading">
        <h2 id="funnel-heading">ファネル</h2>
        <div className="validation-table-wrap">
          <table className="validation-table">
            <thead>
              <tr>
                <th scope="col">段階</th>
                <th scope="col">ユニークユーザー</th>
              </tr>
            </thead>
            <tbody>
              {funnelRows(metrics).map(([label, count]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{count}人</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="validation-footnote">
        D7と初週3投稿率は、期間末までに必要な観測期間を完了したユーザーだけを分母にします。
      </p>
    </main>
  );
}
