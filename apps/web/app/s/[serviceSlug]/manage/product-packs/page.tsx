import { MemberProductActivityService, ProductPackService } from '@bunshin/application';
import { redirect } from 'next/navigation';
import { ProductPackAdminEditor } from '../../../../(app)/admin/product-packs/product-pack-admin-editor';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export default async function ServiceProductPacksPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const serviceSlug = (await params).serviceSlug;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/product-packs`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId, 'CONTENT');
  const db = await import('@bunshin/database');
  const scope = {
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
  };
  const [packs, activitySummary] = await Promise.all([
    new ProductPackService(new db.PrismaProductPackRepository()).list(scope),
    new MemberProductActivityService(
      new db.PrismaMemberProductActivityRepository(),
    ).listServiceSummary(scope),
  ]);
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">{service.configuration.displayName}の管理</p>
        <h1>公式商品情報</h1>
        <p>参加者が投稿に使う商品情報、必須表記、禁止表現、公式素材を管理します。</p>
      </header>
      <ProductPackAdminEditor
        workspaceId={service.workspaceId}
        groups={[{ id: service.serviceId, name: service.configuration.displayName }]}
        initialPacks={JSON.parse(JSON.stringify(packs)) as unknown[]}
        apiBase={`/api/services/${service.configuration.slug}/product-packs`}
      />
      <section className="settings-card">
        <h2>商品別の参加者活動</h2>
        <p>参加者個人の投稿本文を表示せず、投稿案作成から投稿完了までを集計します。</p>
        {activitySummary.length === 0 ? (
          <p>商品投稿の活動記録はまだありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>商品</th>
                  <th>参加者</th>
                  <th>作成</th>
                  <th>コピー</th>
                  <th>投稿完了</th>
                  <th>専用URL使用</th>
                </tr>
              </thead>
              <tbody>
                {activitySummary.map((item) => (
                  <tr key={item.key}>
                    <td>{item.productName}</td>
                    <td>{item.memberCount}</td>
                    <td>{item.generatedCount}</td>
                    <td>{item.copiedCount}</td>
                    <td>{item.postedCount}</td>
                    <td>{item.trackingUrlUsedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
