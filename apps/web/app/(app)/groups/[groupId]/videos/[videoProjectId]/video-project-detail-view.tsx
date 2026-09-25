import { VideoDeliveryActions } from '../../../../../ui/video-delivery-actions';
import { VideoReviewActions } from '../../../../../ui/video-review-actions';
import { VideoPostCopy } from '../../../../../ui/video-post-copy';
import type { VideoProjectDetailPageData } from './video-project-detail-data';
import { VideoProjectPlanSections } from './video-project-plan-sections';

export function VideoProjectDetailView({ data }: { data: VideoProjectDetailPageData }) {
  const {
    project,
    renderAttempt,
    serviceSlug,
    delivery,
    deliveryMessage,
    deliveryStatus,
    postCopy,
    disclosure,
    character,
  } = data;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">動画づくり</p>
        <h1>{project.title}</h1>
        <p>{project.durationSeconds}秒の動画です。</p>
        <a href={serviceSlug ? `/s/${serviceSlug}/videos` : `/groups/${project.groupId}/videos`}>
          ← 動画一覧へ戻る
        </a>
      </header>

      {project.status === 'READY_FOR_REVIEW' && renderAttempt?.status === 'SUCCEEDED' ? (
        <section className="settings-card">
          <h2>動画ができました</h2>
          <p>内容を確認してください。動画は一般公開されていません。</p>
          {postCopy ? (
            <VideoPostCopy
              value={postCopy}
              authorizationPath={`/video-access/${project.id}/copy-authorization`}
            />
          ) : null}
          {delivery && serviceSlug ? (
            <>
              <VideoDeliveryActions
                deliveryId={delivery.id}
                serviceSlug={serviceSlug}
                status={deliveryStatus ?? delivery.status}
                usageMessage={deliveryMessage}
              />
              <VideoReviewActions
                workspaceId={project.workspaceId}
                groupId={project.groupId}
                projectId={project.id}
                revision={project.revision}
                allowAdopt={false}
              />
            </>
          ) : (
            <>
              <p>
                <a
                  className="button button--primary"
                  href={`/api/workspaces/${project.workspaceId}/groups/${project.groupId}/video-projects/${project.id}/render/download`}
                  target="_blank"
                  rel="noreferrer"
                >
                  動画を確認する
                </a>
              </p>
              <VideoReviewActions
                workspaceId={project.workspaceId}
                groupId={project.groupId}
                projectId={project.id}
                revision={project.revision}
              />
            </>
          )}
        </section>
      ) : null}
      {project.status === 'COMPLETED' && renderAttempt?.status === 'SUCCEEDED' ? (
        <section className="settings-card">
          <h2>この動画を使うことを記録しました</h2>
          <p>動画を開き、iPhoneの共有メニューから「ビデオを保存」を選べます。</p>
          {postCopy ? (
            <VideoPostCopy
              value={postCopy}
              authorizationPath={`/video-access/${project.id}/copy-authorization`}
            />
          ) : null}
          <p>
            <a
              className="button button--primary"
              href={`/api/workspaces/${project.workspaceId}/groups/${project.groupId}/video-projects/${project.id}/render/download`}
              target="_blank"
              rel="noreferrer"
            >
              動画を開く・保存する
            </a>
          </p>
          <VideoReviewActions
            workspaceId={project.workspaceId}
            groupId={project.groupId}
            projectId={project.id}
            revision={project.revision}
            allowAdopt={false}
          />
        </section>
      ) : null}
      <section className="settings-card">
        <h2>投稿するときの大切な確認</h2>
        {disclosure.text ? (
          <p>
            <strong>AIを使ったことの説明：</strong>
            {disclosure.text}
          </p>
        ) : null}
        {disclosure.hashtags.length > 0 ? (
          <p>
            <strong>おすすめの表示：</strong>
            {disclosure.hashtags.join(' ')}
          </p>
        ) : null}
        {disclosure.guidance ? <p>{disclosure.guidance}</p> : null}
        <p>動画は自動では投稿されません。完成後に内容を確認し、ご自身で投稿してください。</p>
      </section>

      {character.name ? (
        <section className="settings-card">
          <h2>この動画に固定したAIキャラクター</h2>
          <p>
            {character.name}
            {character.version ? `（第${character.version}版）` : ''}
            の見た目と世界観を企画に反映します。
          </p>
          <p>
            基準画像{character.referenceCount}枚と、その時点の見た目・安全ルールを固定しています。
            現在の標準動画は、基準画像を外部のAI動画サービスへ送信しません。
          </p>
        </section>
      ) : null}

      <VideoProjectPlanSections data={data} />
    </main>
  );
}
