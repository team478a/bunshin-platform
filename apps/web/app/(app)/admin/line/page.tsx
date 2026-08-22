import { GetLineAdminMetrics, ListLineConfigurations } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import {
  currentLineEnvironment,
  lineEndpointUrls,
} from '../../../../src/line/secure-configuration';
import { LineConfigurationEditor } from './line-configuration-editor';

export const dynamic = 'force-dynamic';

export default async function LineConfigurationPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  try {
    const environment = currentLineEnvironment();
    const configurations = await new ListLineConfigurations(
      new db.PrismaLineConfigurationRepository(),
    ).execute(user.userId, environment);
    const metrics = await new GetLineAdminMetrics(
      new db.PrismaLineAdminMetricsRepository(),
    ).execute(user.userId, environment);
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
