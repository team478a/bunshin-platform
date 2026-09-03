import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';

export const dynamic = 'force-dynamic';

const renderStatusText: Record<string, string> = {
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

function countByStatus<T extends { status: string }>(items: T[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});
}

export default async function ServiceVideoOperationsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/video-operations`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();

  const db = await import('@bunshin/database');
  const scope = { workspaceId: service.workspaceId, groupId: service.serviceId };
  const now = new Date();
  const warningUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [renders, scenes, expiring] = await Promise.all([
    db.prisma.videoRender.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        status: true,
        errorCode: true,
        createdAt: true,
        project: { select: { title: true } },
      },
    }),
    db.prisma.videoSceneGeneration.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        status: true,
        errorCode: true,
        createdAt: true,
        project: { select: { title: true } },
        scene: { select: { sceneNo: true } },
      },
    }),
    Promise.all([
      db.prisma.videoAsset.count({
        where: { ...scope, status: { not: 'DELETED' }, expiresAt: { gt: now, lte: warningUntil } },
      }),
      db.prisma.videoSceneGeneration.count({
        where: { ...scope, status: 'SUCCEEDED', expiresAt: { gt: now, lte: warningUntil } },
      }),
      db.prisma.videoRender.count({
        where: { ...scope, status: 'SUCCEEDED', expiresAt: { gt: now, lte: warningUntil } },
      }),
      db.prisma.socialImageGeneratedMedia.count({
        where: {
          ...scope,
          status: { in: ['READY', 'ADOPTED', 'REJECTED'] },
          expiresAt: { gt: now, lte: warningUntil },
        },
      }),
    ]),
  ]);
  const renderCounts = countByStatus(renders);
  const sceneCounts = countByStatus(scenes);

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>動画生成の状況</h1>
          <p>このサービス内の動画づくりが、止まらず進んでいるかを確認できます。</p>
        </header>
        <section className="settings-card">
          <h2>現在の件数</h2>
          <p>
            最終動画：待機 {(renderCounts.QUEUED ?? 0) + (renderCounts.SUBMITTED ?? 0)}件 ／ 作成中{' '}
            {renderCounts.RENDERING ?? 0}件 ／ 完成 {renderCounts.SUCCEEDED ?? 0}件 ／ 失敗{' '}
            {renderCounts.FAILED ?? 0}件
          </p>
          <p>
            AIで作る場面：待機 {(sceneCounts.QUEUED ?? 0) + (sceneCounts.SUBMITTED ?? 0)}件 ／
            作成中 {sceneCounts.GENERATING ?? 0}件 ／ 完成 {sceneCounts.SUCCEEDED ?? 0}件 ／ 失敗{' '}
            {sceneCounts.FAILED ?? 0}件
          </p>
          <p>動画本文、生成指示、完成ファイルのURLはこの画面に表示しません。</p>
        </section>
        <section className="settings-card">
          <h2>保存期限のお知らせ</h2>
          {expiring[0] + expiring[1] + expiring[2] + expiring[3] === 0 ? (
            <p>7日以内に保存期限を迎える画像・動画はありません。</p>
          ) : (
            <p>
              7日以内に、素材 {expiring[0]}件・AI場面 {expiring[1]}件・最終動画 {expiring[2]}
              件・SNS画像 {expiring[3]}
              件の保存期限が来ます。必要なファイルは期限前に利用者自身で保存してください。
            </p>
          )}
          <p>作成・アップロードから90日後に、非公開の保存先から自動で削除されます。</p>
        </section>
        <section className="settings-card">
          <h2>最近のAI場面</h2>
          {scenes.length === 0 ? (
            <p>まだAI場面の作成はありません。</p>
          ) : (
            <ul className="settings-status-list">
              {scenes.map((scene) => (
                <li className="settings-status-item" key={scene.id}>
                  <h3>
                    {scene.project.title}：{scene.scene.sceneNo}場面目
                  </h3>
                  <p>状態：{sceneStatusText[scene.status] ?? scene.status}</p>
                  <p>受付日時：{scene.createdAt.toLocaleString('ja-JP')}</p>
                  {scene.errorCode ? <p>停止理由：{scene.errorCode}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="settings-card">
          <h2>最近の最終動画</h2>
          {renders.length === 0 ? (
            <p>まだ最終動画の作成はありません。</p>
          ) : (
            <ul className="settings-status-list">
              {renders.map((render) => (
                <li className="settings-status-item" key={render.id}>
                  <h3>{render.project.title}</h3>
                  <p>状態：{renderStatusText[render.status] ?? render.status}</p>
                  <p>受付日時：{render.createdAt.toLocaleString('ja-JP')}</p>
                  {render.errorCode ? <p>停止理由：{render.errorCode}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
