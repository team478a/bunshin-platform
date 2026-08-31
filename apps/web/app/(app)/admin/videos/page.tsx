import {
  GetVideoRenderOperations,
  ListAiProviderConfigurations,
  ListVideoDisclosurePolicies,
} from '@bunshin/application';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';
import { VideoRenderRetryForm } from './video-render-retry-form';
import { buildVideoReadiness } from './readiness-view-model';

export const dynamic = 'force-dynamic';

const statusText: Record<string, string> = {
  QUEUED: '受付済み',
  SUBMITTED: '外部サービスへ依頼済み',
  RENDERING: '動画を作成中',
  SUCCEEDED: '完成',
  FAILED: '失敗',
  CANCELLED: '中止',
};

const sceneStatusText: Record<string, string> = {
  QUEUED: '順番待ち',
  SUBMITTED: '外部サービスへ依頼済み',
  GENERATING: '場面を作成中',
  SUCCEEDED: '完成',
  FAILED: '失敗',
  CANCELLED: '中止',
};

const usd = (value: number | null) =>
  value === null ? '未確定' : `$${(value / 1_000_000).toFixed(2)}`;

export default async function VideoRenderOperationsPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const snapshot = await new GetVideoRenderOperations(
    new db.PrismaVideoRenderOperationsRepository(),
  )
    .execute({ actorUserId: user.userId, environment: currentLineEnvironment() })
    .catch(() => null);
  if (!snapshot) notFound();
  const environment = currentLineEnvironment();
  const [configurations, disclosurePolicies] = await Promise.all([
    new ListAiProviderConfigurations(new db.PrismaAiProviderConfigurationRepository()).execute(
      user.userId,
      environment,
    ),
    new ListVideoDisclosurePolicies(new db.PrismaVideoDisclosurePolicyRepository()).execute(
      environment,
    ),
  ]);
  const readiness = buildVideoReadiness({ configurations, disclosurePolicies });
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>動画生成の状況</h1>
        <p>動画が完成したか、止まっていないかを確認できます。</p>
      </header>
      <section className="settings-card">
        <h2>動画機能を使う準備</h2>
        <p>
          {readiness.ready
            ? '必要な設定はそろっています。動画機能を利用できます。'
            : `あと${readiness.blockerCount}件の設定が必要です。利用者が動画を作る前に対応してください。`}
        </p>
        <ul className="settings-status-list">
          {readiness.items.map((item) => (
            <li className="settings-status-item" key={item.key}>
              <h3>
                {item.ready ? '準備完了' : '設定が必要'}：{item.label}
              </h3>
              <p>{item.detail}</p>
              <Link className="button button--secondary" href={item.href}>
                {item.actionLabel}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="settings-card">
        <h2>現在の件数</h2>
        <p>対象環境：{environment}</p>
        <p>
          待機 {snapshot.counts.QUEUED + snapshot.counts.SUBMITTED}件 ／ 作成中{' '}
          {snapshot.counts.RENDERING}件 ／ 完成 {snapshot.counts.SUCCEEDED}件 ／ 失敗{' '}
          {snapshot.counts.FAILED}件
        </p>
        <p>
          場面の生成：待機 {snapshot.sceneCounts.QUEUED + snapshot.sceneCounts.SUBMITTED}件 ／
          作成中 {snapshot.sceneCounts.GENERATING}件 ／ 完成 {snapshot.sceneCounts.SUCCEEDED}件 ／
          失敗 {snapshot.sceneCounts.FAILED}件
        </p>
      </section>
      <section className="settings-card">
        <h2>AIで作る場面の状況</h2>
        <p>最終動画を作る前の、一つひとつの場面の進み具合です。</p>
        {snapshot.sceneItems.length === 0 ? (
          <p>この環境で受け付けたAI場面の生成はありません。</p>
        ) : (
          <ul className="settings-status-list">
            {snapshot.sceneItems.map((item) => (
              <li key={item.id} className="settings-status-item">
                <h3>
                  {item.projectTitle}：{item.sceneNo}場面目
                </h3>
                <p>グループ：{item.groupName}</p>
                <p>状態：{sceneStatusText[item.status] ?? item.status}</p>
                <p>
                  使用サービス：{item.provider} ／ モデル：{item.model}
                </p>
                <p>
                  費用：見込み {usd(item.estimatedCostUsdMicros)} ／ 実績{' '}
                  {usd(item.actualCostUsdMicros)}
                </p>
                <p>受付日時：{item.createdAt.toLocaleString('ja-JP')}</p>
                {item.errorCode ? <p>停止理由：{item.errorCode}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="settings-card">
        <h2>最近の動画</h2>
        {snapshot.items.length === 0 ? (
          <p>この環境で作成を受け付けた動画はありません。</p>
        ) : (
          <ul className="settings-status-list">
            {snapshot.items.map((item) => (
              <li key={item.id} className="settings-status-item">
                <h3>{item.projectTitle}</h3>
                <p>グループ：{item.groupName}</p>
                <p>状態：{statusText[item.status] ?? item.status}</p>
                <p>受付日時：{item.createdAt.toLocaleString('ja-JP')}</p>
                {item.status === 'SUCCEEDED' ? (
                  <>
                    <p>利用回数：{item.usageCountedAt ? '確定済み' : '未確定'}</p>
                    <p>
                      完成のお知らせ：
                      {item.notificationStatus === 'SENT'
                        ? '送信済み'
                        : item.notificationStatus === 'CANCELLED'
                          ? '送信しない設定'
                          : item.notificationStatus === 'FAILED'
                            ? '送信に失敗'
                            : '送信待ち'}
                    </p>
                  </>
                ) : null}
                {item.errorCode ? <p>停止理由：{item.errorCode}</p> : null}
                {item.status === 'FAILED' && !item.retryable ? (
                  <p>自動的に直せない失敗です。台本や外部サービスの設定を確認してください。</p>
                ) : null}
                {item.retryable ? <VideoRenderRetryForm renderId={item.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
