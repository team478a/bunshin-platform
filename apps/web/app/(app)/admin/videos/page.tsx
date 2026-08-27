import { GetVideoRenderOperations } from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';
import { VideoRenderRetryForm } from './video-render-retry-form';

export const dynamic = 'force-dynamic';

const statusText: Record<string, string> = {
  QUEUED: '受付済み',
  SUBMITTED: '外部サービスへ依頼済み',
  RENDERING: '動画を作成中',
  SUCCEEDED: '完成',
  FAILED: '失敗',
  CANCELLED: '中止',
};

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
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>動画生成の状況</h1>
        <p>動画が完成したか、止まっていないかを確認できます。</p>
      </header>
      <section className="settings-card">
        <h2>現在の件数</h2>
        <p>対象環境：{currentLineEnvironment()}</p>
        <p>
          待機 {snapshot.counts.QUEUED + snapshot.counts.SUBMITTED}件 ／ 作成中{' '}
          {snapshot.counts.RENDERING}件 ／ 完成 {snapshot.counts.SUCCEEDED}件 ／ 失敗{' '}
          {snapshot.counts.FAILED}件
        </p>
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
