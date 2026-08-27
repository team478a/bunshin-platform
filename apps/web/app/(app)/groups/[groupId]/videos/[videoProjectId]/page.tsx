import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { GetVideoProject } from '@bunshin/application';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { VideoPlanGenerator } from '../../../../../ui/video-plan-generator';

export const dynamic = 'force-dynamic';

const visualLabel: Record<string, string> = {
  USER_ASSET: 'あなたの写真・動画',
  APPROVED_ASSET: 'グループが用意した素材',
  STOCK_IMAGE: '素材写真',
  GENERATED_IMAGE: 'AIで作る画像',
  TEXT_MOTION: '文字の動き',
  AI_VIDEO: 'AIで作る動画',
};

export default async function VideoProjectPage({
  params,
}: {
  params: Promise<{ groupId: string; videoProjectId: string }>;
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
    select: { workspaceId: true },
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

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">動画づくり</p>
        <h1>{project.title}</h1>
        <p>{project.durationSeconds}秒の動画です。</p>
        <Link href={`/groups/${project.groupId}/videos`}>← 動画一覧へ戻る</Link>
      </header>

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
          ) : null}
        </>
      )}
    </main>
  );
}
