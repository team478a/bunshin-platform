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
  const assistanceLabels = {
    IDEA_ONLY: '企画だけ',
    GUIDED: '作り方まで',
    READY_TO_USE: '完成版',
  } as const;

  return (
    <main className="validation-dashboard">
      <p>
        <Link href="/bunshins">← BUNSHINへ戻る</Link>
      </p>
      <header className="validation-header">
        <div>
          <p className="validation-eyebrow">100人での確認</p>
          <h1>無料版の利用状況</h1>
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
        <h2 id="primary-kpi">いちばん大切な数字</h2>
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
            <span>「自分らしい」と答えた割合</span>
          </article>
          <article>
            <strong>{percentage(outcomes.d7ActiveRate)}</strong>
            <span>7日後も使っている人の割合</span>
          </article>
          <article>
            <strong>{outcomes.aiCalls}</strong>
            <span>AI実行回数</span>
          </article>
          <article>
            <strong>{outcomes.aiInputTokens + outcomes.aiOutputTokens}</strong>
            <span>AIが読み書きした量</span>
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
        <h2 id="funnel-heading">登録してから投稿するまで</h2>
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

      <section aria-labelledby="assistance-heading">
        <h2 id="assistance-heading">どこまで作ると行動しやすいか</h2>
        <p>投稿案の見せ方ごとに、見た後の行動を比べます。投稿内容や個人名は表示しません。</p>
        <div className="validation-table-wrap">
          <table className="validation-table">
            <thead>
              <tr>
                <th scope="col">見せ方</th>
                <th scope="col">作成</th>
                <th scope="col">採用率</th>
                <th scope="col">採用→コピー</th>
                <th scope="col">コピー→投稿</th>
                <th scope="col">自分らしい</th>
              </tr>
            </thead>
            <tbody>
              {metrics.assistanceLevels.map((item) => (
                <tr key={item.level}>
                  <th scope="row">{assistanceLabels[item.level]}</th>
                  <td>{item.missions}件</td>
                  <td>{percentage(item.acceptanceRate)}</td>
                  <td>{percentage(item.copyRate)}</td>
                  <td>{percentage(item.postRate)}</td>
                  <td>{percentage(item.goodFeedbackRate)}</td>
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
