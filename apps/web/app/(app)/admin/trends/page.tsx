import { GetTrendOperationsSnapshot } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentAiProviderEnvironment } from '../../../../src/ai/secure-provider-configuration';
import { percentage, resolvePeriod, usd } from '../users/view-model';

export const dynamic = 'force-dynamic';

export default async function AdminTrendsPage({
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
    snapshot = await new GetTrendOperationsSnapshot(
      new db.PrismaTrendOperationsRepository(),
    ).execute({
      actorUserId: actor.userId,
      environment: currentAiProviderEnvironment(),
      from: period.from,
      to: period.to,
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  return (
    <main className="app-page validation-dashboard">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>トレンド企画の利用状況</h1>
        <p>投稿内容や個人情報を表示せず、調査から投稿までの進み方を確認します。</p>
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
      <section>
        <h2>調査の状態</h2>
        <div className="validation-kpi-grid">
          <article>
            <strong>{snapshot.research.total}</strong>
            <span>調査回数</span>
          </article>
          <article>
            <strong>{snapshot.research.completed}</strong>
            <span>調査成功</span>
          </article>
          <article>
            <strong>{snapshot.research.failed}</strong>
            <span>調査失敗</span>
          </article>
          <article>
            <strong>{snapshot.candidates.total}</strong>
            <span>企画候補</span>
          </article>
          <article>
            <strong>{snapshot.candidates.selected}</strong>
            <span>Missionで採用</span>
          </article>
          <article>
            <strong>{snapshot.candidates.averageFreshnessScore ?? '—'}</strong>
            <span>平均の新しさ</span>
          </article>
        </div>
      </section>
      <section>
        <h2>企画を見てから投稿するまで</h2>
        <div className="validation-kpi-grid">
          <article>
            <strong>{snapshot.missions.attributed}</strong>
            <span>トレンド企画を作成</span>
          </article>
          <article>
            <strong>{snapshot.missions.accepted}</strong>
            <span>採用</span>
          </article>
          <article>
            <strong>{snapshot.missions.copied}</strong>
            <span>コピー</span>
          </article>
          <article>
            <strong>{snapshot.missions.posted}</strong>
            <span>投稿完了</span>
          </article>
          <article>
            <strong>{percentage(snapshot.missions.accepted, snapshot.missions.attributed)}</strong>
            <span>企画採用率</span>
          </article>
          <article>
            <strong>{percentage(snapshot.missions.posted, snapshot.missions.attributed)}</strong>
            <span>投稿完了率</span>
          </article>
        </div>
      </section>
      <section className="settings-card">
        <h2>情報の新しさ</h2>
        <p>
          使える根拠：{snapshot.evidence.available}件 ／ 期限切れ：{snapshot.evidence.expired}件
        </p>
        <p>安全確認済み候補：{snapshot.candidates.safe}件</p>
      </section>
      <section className="settings-card">
        <h2>費用</h2>
        <p>
          実際の調査費用：
          {snapshot.cost.measuredUsdMicros === null
            ? '未計測'
            : usd(snapshot.cost.measuredUsdMicros)}
        </p>
        <p>費用未計測の調査：{snapshot.cost.unpricedRuns}件</p>
        <p>
          比較テストの参考平均：
          {snapshot.cost.benchmarkAverageUsdMicros === null
            ? 'データなし'
            : usd(snapshot.cost.benchmarkAverageUsdMicros)}
        </p>
        <small>比較テストの費用は本番運用の実費ではありません。</small>
      </section>
      <section className="settings-card">
        <h2>サービス別の調査</h2>
        {snapshot.providers.length === 0 ? (
          <p>この期間の調査はありません。</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>サービス</th>
                  <th>調査</th>
                  <th>失敗</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.providers.map((provider) => (
                  <tr key={provider.providerKey}>
                    <td>{provider.providerKey}</td>
                    <td>{provider.runs}</td>
                    <td>{provider.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {snapshot.research.failureCategories.length > 0 ? (
        <section className="settings-card">
          <h2>失敗の理由</h2>
          <ul>
            {snapshot.research.failureCategories.map((item) => (
              <li key={item.category}>
                {item.category}：{item.count}件
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
