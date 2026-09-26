import { isSupportedVideoComposition } from '@bunshin/application';
import { VideoPlanGenerator } from '../../../../../ui/video-plan-generator';
import { VideoPlanApprover } from '../../../../../ui/video-plan-approver';
import { VideoRenderRequester } from '../../../../../ui/video-render-requester';
import { VideoAiSceneRequester } from '../../../../../ui/video-ai-scene-requester';
import { VideoSceneEditor } from '../../../../../ui/video-scene-editor';
import { VideoNarrationSettings } from '../../../../../ui/video-narration-settings';
import type { VideoProjectDetailPageData } from './video-project-detail-data';

const visualLabel: Record<string, string> = {
  USER_ASSET: 'あなたの写真・動画',
  APPROVED_ASSET: 'グループが用意した素材',
  STOCK_IMAGE: '素材写真',
  GENERATED_IMAGE: 'AIで作る画像',
  TEXT_MOTION: '文字の動き',
  AI_VIDEO: 'AIで作る動画',
};

const narrationVoiceLabel: Record<string, string> = {
  marin: 'やさしく落ち着いた声',
  cedar: 'はっきり信頼感のある声',
  coral: '明るく親しみやすい声',
};

export function VideoProjectPlanSections({ data }: { data: VideoProjectDetailPageData }) {
  const { project, sceneGenerations, aiSceneGenerationFailed, canComposeAiVideo } = data;
  return (
    <>
      {project.scenes.length === 0 ? (
        <section className="settings-card">
          <h2>企画と台本を作る</h2>
          <p>投稿パートナーの目的・届けたい相手・話し方と、使える素材をもとにAIが提案します。</p>
          <p>
            選択した写真または背景と字幕を合成します。音声を有効にした場合はAIナレーションを追加します。
          </p>
          <VideoPlanGenerator
            workspaceId={project.workspaceId}
            groupId={project.groupId}
            projectId={project.id}
            revision={project.revision}
          />
        </section>
      ) : (
        <>
          <section className="settings-card">
            <h2>内容を確認してください</h2>
            {!isSupportedVideoComposition(project) ? (
              <p>
                この企画には準備中の写真・音声機能が含まれます。台本を作り直すか、
                <a href={`/groups/${project.groupId}/videos`}>
                  動画一覧から字幕動画を新しく作成してください。
                </a>
              </p>
            ) : null}
            <p>
              {project.narrationEnabled
                ? '下の順番、字幕、読み上げる台本を確認してください。AI音声で読み上げます。'
                : '下の順番と字幕を確認してください。音声は付けません。'}
            </p>
            {project.narrationEnabled ? (
              <p>
                <strong>選んだ声：</strong>
                {narrationVoiceLabel[project.narrationVoice ?? 'marin'] ??
                  narrationVoiceLabel.marin}
              </p>
            ) : null}
            {['DRAFT', 'PLANNING', 'WAITING_APPROVAL'].includes(project.status) ? (
              <p>この画面では動画本体はまだ作りません。</p>
            ) : null}
          </section>
          {project.narrationEnabled && project.status === 'WAITING_APPROVAL' ? (
            <VideoNarrationSettings
              workspaceId={project.workspaceId}
              groupId={project.groupId}
              projectId={project.id}
              revision={project.revision}
              initialVoice={project.narrationVoice ?? 'marin'}
              initialSpeed={project.narrationSpeed ?? 'STANDARD'}
            />
          ) : null}
          {project.scenes.map((scene) => (
            <section className="settings-card" key={scene.id}>
              <h2>
                {scene.sceneNo}番目（{Math.round(scene.durationMs / 1000)}秒）
              </h2>
              <p>
                <strong>
                  {project.narrationEnabled ? 'AI音声で読み上げる台本：' : '参考台本（音声なし）：'}
                </strong>
                {scene.narration}
              </p>
              <p>
                <strong>画面の文字：</strong>
                {scene.caption}
              </p>
              <p>
                <strong>見せるもの：</strong>
                {visualLabel[scene.visualType] ?? scene.visualType}
              </p>
              {scene.visualPrompt ? (
                <p>
                  <strong>画像を作るときの指示：</strong>
                  {scene.visualPrompt}
                </p>
              ) : null}
              {project.status === 'WAITING_APPROVAL' ? (
                <VideoSceneEditor
                  workspaceId={project.workspaceId}
                  groupId={project.groupId}
                  projectId={project.id}
                  sceneId={scene.id}
                  revision={project.revision}
                  narration={scene.narration}
                  caption={scene.caption}
                  narrationEnabled={project.narrationEnabled ?? false}
                  maxNarrationLength={Math.floor((scene.durationMs / 1_000) * 3)}
                />
              ) : null}
            </section>
          ))}
          {project.status === 'WAITING_APPROVAL' ? (
            <>
              <section className="settings-card">
                <h2>この内容でよいですか？</h2>
                <p>よければ台本を確認済みにします。確認後は内容を固定します。</p>
                {isSupportedVideoComposition(project) ? (
                  <VideoPlanApprover
                    workspaceId={project.workspaceId}
                    groupId={project.groupId}
                    projectId={project.id}
                    revision={project.revision}
                  />
                ) : null}
              </section>
              <section className="settings-card">
                <h2>作り直す場合</h2>
                <p>今の台本を置き換えて、もう一度提案できます。</p>
                <VideoPlanGenerator
                  workspaceId={project.workspaceId}
                  groupId={project.groupId}
                  projectId={project.id}
                  revision={project.revision}
                />
              </section>
            </>
          ) : null}
          {project.status === 'APPROVED' && isSupportedVideoComposition(project) ? (
            <section className="settings-card">
              <h2>台本を確認しました</h2>
              {project.standardComposition ? (
                <>
                  <p>この内容から動画を作ります。受付後は画面を閉じても大丈夫です。</p>
                  <VideoRenderRequester
                    workspaceId={project.workspaceId}
                    groupId={project.groupId}
                    projectId={project.id}
                    revision={project.revision}
                  />
                </>
              ) : (
                <>
                  {canComposeAiVideo ? (
                    <>
                      <p>すべてのAI動画の場面ができました。場面をつないで完成動画を作ります。</p>
                      <VideoRenderRequester
                        workspaceId={project.workspaceId}
                        groupId={project.groupId}
                        projectId={project.id}
                        revision={project.revision}
                      />
                    </>
                  ) : aiSceneGenerationFailed ? (
                    <p>作れなかった場面があります。管理者が設定を確認します。</p>
                  ) : (
                    <>
                      <p>
                        AI動画を使う場面を一つずつ作ります。設定と予算を確認できる場合だけ開始します。
                      </p>
                      <VideoAiSceneRequester
                        workspaceId={project.workspaceId}
                        groupId={project.groupId}
                        projectId={project.id}
                        revision={project.revision}
                      />
                    </>
                  )}
                </>
              )}
            </section>
          ) : null}
          {!project.standardComposition && sceneGenerations.length > 0 ? (
            <section className="settings-card">
              <h2>AI動画の場面</h2>
              <p>作成中の場面は、少し時間をおいてこの画面を開き直してください。</p>
              {sceneGenerations.map((generation) => {
                const scene = project.scenes.find((item) => item.id === generation.videoSceneId);
                const label =
                  generation.status === 'SUCCEEDED'
                    ? 'できました'
                    : generation.status === 'FAILED'
                      ? '作れませんでした'
                      : '作っています';
                return (
                  <p key={generation.id}>
                    {scene ? `${scene.sceneNo}番目` : '場面'}：{label}
                    {generation.status === 'SUCCEEDED' && generation.outputStorageKey ? (
                      <>
                        {' '}
                        <a
                          href={`/api/workspaces/${project.workspaceId}/groups/${project.groupId}/video-projects/${project.id}/ai-scenes/${generation.id}/download`}
                        >
                          この場面を開く
                        </a>
                      </>
                    ) : null}
                    {generation.status === 'FAILED' ? ' 管理者が設定を確認します。' : null}
                  </p>
                );
              })}
            </section>
          ) : null}
          {['QUEUED', 'RENDERING'].includes(project.status) ? (
            <section className="settings-card">
              <h2>動画を作っています</h2>
              <p>完成まで少しお待ちください。あとでこの画面を開き直すと確認できます。</p>
            </section>
          ) : null}
          {project.status === 'FAILED' ? (
            <section className="settings-card">
              <h2>動画を完成できませんでした</h2>
              <p>
                写真の保存期限や台本の長さを確認してください。音声生成に失敗した場合は、自動で再生成せず停止します。動画一覧から企画を新しく作成できます。
              </p>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
