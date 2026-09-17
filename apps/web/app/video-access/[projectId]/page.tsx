import { redirect } from 'next/navigation';
import { authorizedVideoView } from '../../../src/http/video-line-access';
import { PublicShell } from '../../ui/public-shell';
import { VideoPostCopy } from '../../ui/video-post-copy';
import { PendingSubmitButton } from '../../ui/pending-submit-button';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: '動画を見る',
  robots: { index: false, follow: false },
  // Keep Origin on our POST form while withholding referrers from external sites.
  referrer: 'same-origin' as const,
};
export default async function VideoAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ result?: string; decision?: string; posted?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const scope = await authorizedVideoView(projectId);
  if (scope?.appOwner && !scope.project.renderAttempts.length)
    redirect(`/groups/${scope.project.groupId}/videos/${projectId}?manage=1`);
  const source = `/video-access/${projectId}/download`;
  return (
    <PublicShell>
      <main className="app-page video-access-page">
        {scope ? (
          <>
            <header className="app-page__heading">
              <p className="eyebrow">完成した動画</p>
              <h1>{scope.project.title}</h1>
              <p>内容を確認し、この動画を使うか選んでください。</p>
            </header>
            {scope.project.renderAttempts.length ? (
              <>
                <video
                  className="video-access-player"
                  controls
                  playsInline
                  preload="metadata"
                  src={source}
                />
                {scope.postCopy ? (
                  <VideoPostCopy
                    value={scope.postCopy}
                    authorizationPath={`/video-access/${projectId}/copy-authorization`}
                  />
                ) : null}
                {scope.project.reviewDecision === 'ADOPTED' ? (
                  <>
                    <p className="notice notice--success" role="status">
                      <strong>この動画を使うことを記録しました。</strong>
                    </p>
                    <p className="video-access-download">
                      <a
                        className="button button--primary button--full"
                        href={source}
                        target="_blank"
                        rel="noreferrer"
                      >
                        動画を開く・iPhoneへ保存する
                      </a>
                    </p>
                    <p>動画を開き、共有メニューから「ビデオを保存」を押してください。</p>
                    <section className="settings-card">
                      <h2>SNSに投稿した後</h2>
                      {scope.postRecorded || query.posted === '1' ? (
                        <p role="status">
                          <strong>投稿完了を記録しました。おつかれさまでした。</strong>
                        </p>
                      ) : (
                        <>
                          <p>Instagramなどへの投稿が終わったら、下のボタンを1回押してください。</p>
                          <form action={`/video-access/${projectId}/posted`} method="post">
                            <PendingSubmitButton
                              className="button button--primary button--full"
                              pendingLabel="記録しています…"
                            >
                              投稿しました
                            </PendingSubmitButton>
                          </form>
                        </>
                      )}
                      <p>この記録をもとに、ポイントやバッジが反映されます。</p>
                    </section>
                  </>
                ) : scope.project.reviewDecision === 'REJECTED' ? (
                  <section className="settings-card video-access-decision" role="status">
                    <h2>今回は使わないことを記録しました</h2>
                    <p>選んだ理由は運営者へ届き、次の動画づくりの改善に使われます。</p>
                  </section>
                ) : query.decision === 'adopted' ? (
                  <p className="notice notice--success" role="status">
                    この動画を使うことを記録しました。
                  </p>
                ) : null}
                {!scope.project.reviewDecision && (
                  <section className="settings-card video-access-review">
                    <h2>この動画を使いますか？</h2>
                    <form action={`/video-access/${projectId}/decision`} method="post">
                      <input type="hidden" name="decision" value="ADOPTED" />
                      <PendingSubmitButton
                        className="button button--primary button--full"
                        pendingLabel="記録しています…"
                      >
                        この動画を使う
                      </PendingSubmitButton>
                    </form>
                    <details>
                      <summary>今回は使わない</summary>
                      <form
                        className="form-stack"
                        action={`/video-access/${projectId}/decision`}
                        method="post"
                      >
                        <input type="hidden" name="decision" value="REJECTED" />
                        <label className="field">
                          <span className="field__label">使わない理由</span>
                          <select
                            className="field__control"
                            name="reviewReason"
                            defaultValue=""
                            required
                          >
                            <option value="" disabled>
                              選んでください
                            </option>
                            <option value="NARRATION_HARD_TO_HEAR">
                              ナレーションが聞き取りにくい
                            </option>
                            <option value="AI_VOICE_UNNATURAL">声が不自然</option>
                            <option value="CONTENT_MISMATCH">内容が希望と違う</option>
                            <option value="VISUAL_UNNATURAL">映像や画像が不自然</option>
                            <option value="TOO_LONG">動画が長すぎる</option>
                            <option value="OTHER">その他</option>
                          </select>
                        </label>
                        <label className="field">
                          <span className="field__label">詳しく伝える（任意）</span>
                          <textarea
                            className="field__control"
                            name="reviewNote"
                            maxLength={500}
                            placeholder="例：声が速くて聞き取れませんでした"
                          />
                        </label>
                        <PendingSubmitButton
                          className="button button--secondary button--full"
                          pendingLabel="送信しています…"
                        >
                          理由を送って今回は使わない
                        </PendingSubmitButton>
                      </form>
                    </details>
                  </section>
                )}
                {query.result === 'decision-failed' ? (
                  <p className="notice notice--danger" role="alert">
                    操作を記録できませんでした。もう一度お試しください。
                  </p>
                ) : null}
                {query.result === 'post-failed' ? (
                  <p className="notice notice--danger" role="alert">
                    投稿完了を記録できませんでした。投稿案で「この内容で進める」を押してから、もう一度お試しください。
                  </p>
                ) : null}
              </>
            ) : (
              <p className="settings-card">動画は準備中、または保存期限を過ぎています。</p>
            )}
            {scope.appOwner ? (
              <p>
                <a href={`/groups/${scope.project.groupId}/videos/${projectId}?manage=1`}>
                  台本を直して作り直す
                </a>
              </p>
            ) : null}
          </>
        ) : (
          <section className="auth-panel video-access-auth" aria-labelledby="video-access-title">
            <div className="page-heading page-heading--center">
              <p className="eyebrow">動画の受け取り</p>
              <h1 id="video-access-title">LINEで届いた動画を見る</h1>
              <p>通知を受け取ったLINEで本人確認すると、この動画を閲覧・保存できます。</p>
            </div>
            {query.result === 'failed' ? (
              <div className="notice notice--danger" role="alert">
                <strong>本人確認を完了できませんでした</strong>
                <span>
                  通知を受け取ったLINEで、もう一度確認してください。保存期限を過ぎた動画は開けません。
                </span>
              </div>
            ) : null}
            <form action="/auth/video-line/start" method="post">
              <input type="hidden" name="projectId" value={projectId} />
              <PendingSubmitButton
                className="button button--line button--full"
                pendingLabel="LINEの本人確認を開いています…"
              >
                <span className="button__line-mark" aria-hidden="true">
                  LINE
                </span>
                LINEで本人確認して動画を見る
              </PendingSubmitButton>
            </form>
            <p className="auth-panel__help">
              <a href={`/login?returnTo=${encodeURIComponent(`/video-access/${projectId}`)}`}>
                動画を作成したアカウントでログインする
              </a>
            </p>
          </section>
        )}
      </main>
    </PublicShell>
  );
}
