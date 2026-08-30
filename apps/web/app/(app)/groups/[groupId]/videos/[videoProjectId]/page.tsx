import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { GetVideoProject } from '@bunshin/application';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { VideoPlanGenerator } from '../../../../../ui/video-plan-generator';
import { VideoPlanApprover } from '../../../../../ui/video-plan-approver';
import { VideoRenderRequester } from '../../../../../ui/video-render-requester';

export const dynamic = 'force-dynamic';

const visualLabel: Record<string, string> = {
  USER_ASSET: 'あなたの写真・動画',
  APPROVED_ASSET: 'グループが用意した素材',
  STOCK_IMAGE: '素材写真',
  GENERATED_IMAGE: 'AIで作る画像',
  TEXT_MOTION: '文字の動き',
  AI_VIDEO: 'AIで作る動画',
};

function disclosureGuide(value: Record<string, unknown>) {
  return {
    text: typeof value.disclosureText === 'string' ? value.disclosureText : null,
    hashtags: Array.isArray(value.hashtags)
      ? value.hashtags.filter((item): item is string => typeof item === 'string')
      : [],
    guidance: typeof value.guidance === 'string' ? value.guidance : null,
  };
}

export default async function VideoProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string; videoProjectId: string }>;
  searchParams?: Promise<{ service?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const values = await params;
  const groupId = z.uuid().safeParse(values.groupId);
  const videoProjectId = z.uuid().safeParse(values.videoProjectId);
  if (!groupId.success || !videoProjectId.success) notFound();
  const db = await import('@bunshin/database');
  const row = await db.prisma.videoProject.findFirst({
    where: { id: videoProjectId.data, groupId: groupId.data, ownerUserId: actor.userId },
    select: {
      workspaceId: true,
      renderAttempts: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!row) notFound();
  let project;
  try {
    project = await new GetVideoProject(new db.PrismaVideoProjectRepository()).execute({
      workspaceId: row.workspaceId,
      groupId: groupId.data,
      actorUserId: actor.userId,
      videoProjectId: videoProjectId.data,
    });
  } catch {
    notFound();
  }
  const disclosure = disclosureGuide(project.disclosureSnapshot);

  const serviceSlug = (await searchParams)?.service;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">動画づくり</p>
        <h1>{project.title}</h1>
        <p>{project.durationSeconds}秒の動画です。</p>
        <Link href={serviceSlug ? `/s/${serviceSlug}/videos` : `/groups/${project.groupId}/videos`}>
          ← 動画一覧へ戻る
        </Link>
      </header>

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

      {project.scenes.length === 0 ? (
        <section className="settings-card">
          <h2>企画と台本を作る</h2>
          <p>分身の目的・届けたい相手・話し方と、使える素材をもとにAIが提案します。</p>
          <p>標準の動画ではAI動画を生成しません。画像・文字・音声を組み合わせます。</p>
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
            <p>下の順番、話す言葉、画面に出す文字を確認してください。</p>
            <p>この画面では動画本体はまだ作りません。</p>
          </section>
          {project.scenes.map((scene) => (
            <section className="settings-card" key={scene.id}>
              <h2>
                {scene.sceneNo}番目（{Math.round(scene.durationMs / 1000)}秒）
              </h2>
              <p>
                <strong>話す言葉：</strong>
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
            </section>
          ))}
          {project.status === 'WAITING_APPROVAL' ? (
            <>
              <section className="settings-card">
                <h2>この内容でよいですか？</h2>
                <p>よければ台本を確認済みにします。確認後は内容を固定します。</p>
                <VideoPlanApprover
                  workspaceId={project.workspaceId}
                  groupId={project.groupId}
                  projectId={project.id}
                  revision={project.revision}
                />
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
          {project.status === 'APPROVED' ? (
            <section className="settings-card">
              <h2>台本を確認しました</h2>
              <p>この内容から動画を作ります。受付後は画面を閉じても大丈夫です。</p>
              <VideoRenderRequester
                workspaceId={project.workspaceId}
                groupId={project.groupId}
                projectId={project.id}
                revision={project.revision}
              />
            </section>
          ) : null}
          {['QUEUED', 'RENDERING'].includes(project.status) ? (
            <section className="settings-card">
              <h2>動画を作っています</h2>
              <p>完成まで少しお待ちください。あとでこの画面を開き直すと確認できます。</p>
            </section>
          ) : null}
          {project.status === 'READY_FOR_REVIEW' &&
          row.renderAttempts[0]?.status === 'SUCCEEDED' ? (
            <section className="settings-card">
              <h2>動画ができました</h2>
              <p>内容を確認してください。動画は一般公開されていません。</p>
              <a
                className="button button--primary"
                href={`/api/workspaces/${project.workspaceId}/groups/${project.groupId}/video-projects/${project.id}/render/download`}
              >
                動画を確認する
              </a>
            </section>
          ) : null}
          {project.status === 'FAILED' ? (
            <section className="settings-card">
              <h2>動画を完成できませんでした</h2>
              <p>設定または外部サービスの状態を管理者が確認します。</p>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
