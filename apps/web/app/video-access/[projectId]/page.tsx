import { redirect } from 'next/navigation';
import { authorizedVideoView } from '../../../src/http/video-line-access';
import { PublicShell } from '../../ui/public-shell';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: '動画を見る',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default async function VideoAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { projectId } = await params;
  const scope = await authorizedVideoView(projectId);
  if (scope?.appOwner && !scope.project.renderAttempts.length)
    redirect(`/groups/${scope.project.groupId}/videos/${projectId}?manage=1`);
  const source = `/video-access/${projectId}/download`;
  return (
    <PublicShell>
      <main className="app-page" style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
        {scope ? (
          <>
            <h1>{scope.project.title}</h1>
            {scope.project.renderAttempts.length ? (
              <>
                <video
                  controls
                  playsInline
                  preload="metadata"
                  src={source}
                  style={{ width: '100%', maxHeight: '65vh', background: '#111' }}
                />
                <p>
                  <a href={source} target="_blank" rel="noreferrer">
                    動画を開く・保存する
                  </a>
                </p>
                <p>スマートフォンでは、動画を開いて共有メニューから保存できます。</p>
              </>
            ) : (
              <p>動画は準備中、または保存期限を過ぎています。</p>
            )}
            {scope.appOwner ? (
              <a href={`/groups/${scope.project.groupId}/videos/${projectId}?manage=1`}>
                動画の管理画面へ
              </a>
            ) : null}
          </>
        ) : (
          <>
            <h1>LINEで届いた動画を見る</h1>
            <p>通知を受け取ったLINEで本人確認すると、この動画を閲覧・保存できます。</p>
            {(await searchParams).result === 'failed' ? (
              <p role="alert">
                確認できませんでした。通知を受け取ったLINEで、もう一度確認してください。保存期限を過ぎた動画は開けません。
              </p>
            ) : null}
            <form action="/auth/video-line/start" method="post">
              <input type="hidden" name="projectId" value={projectId} />
              <button type="submit">LINEで本人確認して動画を見る</button>
            </form>
            <p>
              <a href={`/login?returnTo=${encodeURIComponent(`/video-access/${projectId}`)}`}>
                動画を作成したアカウントでログインする
              </a>
            </p>
          </>
        )}
      </main>
    </PublicShell>
  );
}
