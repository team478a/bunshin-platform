import {
  GetLineAdminFunnel,
  GetLineAdminMetrics,
  ListLineConfigurations,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import {
  currentLineEnvironment,
  lineEndpointUrls,
} from '../../../../src/line/secure-configuration';
import { LineConfigurationEditor } from './line-configuration-editor';
import { LineDeliveryRetryPanel } from './line-delivery-retry-panel';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
const inputDate = (value: Date) => value.toISOString().slice(0, 10);
function funnelPeriod(query: { from?: string; to?: string }) {
  const today = new Date(`${inputDate(new Date())}T00:00:00.000Z`);
  const parse = (value?: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && inputDate(parsed) === value ? parsed : null;
  };
  const requestedFrom = parse(query.from);
  const requestedTo = parse(query.to);
  const from = requestedFrom ?? new Date(today.getTime() - 29 * DAY_MS);
  const inclusiveTo = requestedTo ?? today;
  const to = new Date(inclusiveTo.getTime() + DAY_MS);
  if (from >= to || to.getTime() - from.getTime() > 366 * DAY_MS)
    return {
      from: new Date(today.getTime() - 29 * DAY_MS),
      to: new Date(today.getTime() + DAY_MS),
      fromInput: inputDate(new Date(today.getTime() - 29 * DAY_MS)),
      toInput: inputDate(today),
    };
  return { from, to, fromInput: inputDate(from), toInput: inputDate(inclusiveTo) };
}
const percentage = (value: number | null) =>
  value === null ? '—' : `${(value * 100).toFixed(1)}%`;

export default async function LineConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  try {
    const environment = currentLineEnvironment();
    const period = funnelPeriod(await searchParams);
    const configurations = await new ListLineConfigurations(
      new db.PrismaLineConfigurationRepository(),
    ).execute(user.userId, environment);
    const metrics = await new GetLineAdminMetrics(
      new db.PrismaLineAdminMetricsRepository(),
    ).execute(user.userId, environment);
    const funnel = await new GetLineAdminFunnel(new db.PrismaLineAdminFunnelRepository()).execute({
      actorUserId: user.userId,
      environment,
      from: period.from,
      to: period.to,
    });
    return (
      <main>
        <h1>LINE設定管理</h1>
        <p>対象環境: {environment}</p>
        <p>秘密値は保存後に再表示されません。Production変更には理由が必要です。</p>
        <section aria-labelledby="line-operations-heading">
          <h2 id="line-operations-heading">配信状況</h2>
          <p>
            通知可能 {metrics.connections.notificationReady} / 接続中 {metrics.connections.active} /
            友だち {metrics.connections.following}
          </p>
          <p>
            送信済み {metrics.deliveries.sent} / 待機 {metrics.deliveries.pending} / 処理中{' '}
            {metrics.deliveries.processing} / 失敗 {metrics.deliveries.failed} / 取消{' '}
            {metrics.deliveries.cancelled}
          </p>
          <p>
            再試行待ち {metrics.jobs.retryScheduled} / Dead Job {metrics.jobs.dead}
          </p>
          <p>
            設定: {metrics.configuration.active ? 'ACTIVE' : '未設定'} / 接続確認:{' '}
            {metrics.configuration.verified ? 'OK' : '未確認・エラー'} / 全体停止:{' '}
            {metrics.configuration.globallyPaused ? '停止中' : '稼働'}
          </p>
          {metrics.failures.length > 0 && (
            <ul>
              {metrics.failures.map((failure) => (
                <li key={failure.category}>
                  {failure.category}: {failure.count}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="line-funnel-heading">
          <h2 id="line-funnel-heading">LINE Funnel</h2>
          <form method="get">
            <label>
              開始日 <input type="date" name="from" defaultValue={period.fromInput} />
            </label>{' '}
            <label>
              終了日 <input type="date" name="to" defaultValue={period.toInput} />
            </label>{' '}
            <button type="submit">集計</button>
          </form>
          <p>対象期間に送信成功した通知をコホートとし、期間終了までの行動を集計します。</p>
          <table>
            <thead>
              <tr>
                <th>段階</th>
                <th>ユーザー数</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>友だち追加</td>
                <td>{funnel.stages.followedUsers}</td>
              </tr>
              <tr>
                <td>通知送信</td>
                <td>{funnel.cohort.sentUsers}</td>
              </tr>
              <tr>
                <td>Missionを開いた</td>
                <td>{funnel.stages.openedUsers}</td>
              </tr>
              <tr>
                <td>採用</td>
                <td>{funnel.stages.acceptedUsers}</td>
              </tr>
              <tr>
                <td>コピー</td>
                <td>{funnel.stages.copiedUsers}</td>
              </tr>
              <tr>
                <td>投稿完了</td>
                <td>{funnel.stages.postedUsers}</td>
              </tr>
            </tbody>
          </table>
          <p>
            送信 {funnel.cohort.sentMessages}件 / Open率 {percentage(funnel.rates.openRate)} /
            通知→投稿完了率 {percentage(funnel.rates.notificationToPostRate)} / 解除・ブロック相当率{' '}
            {percentage(funnel.rates.unfollowRate)}
          </p>
          {funnel.cohort.truncated && <p>5,000件を超えたため率は表示していません。</p>}
        </section>
        <LineDeliveryRetryPanel
          failures={metrics.retryableFailures.map((failure) => ({
            ...failure,
            failedAt: failure.failedAt.toISOString(),
          }))}
        />
        <LineConfigurationEditor
          environment={environment}
          urls={lineEndpointUrls()}
          initialConfigurations={configurations.map((value) => ({
            ...value,
            lastVerifiedAt: value.lastVerifiedAt?.toISOString() ?? null,
            createdAt: value.createdAt.toISOString(),
            updatedAt: value.updatedAt.toISOString(),
          }))}
        />
      </main>
    );
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}
