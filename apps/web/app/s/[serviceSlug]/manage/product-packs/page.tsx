import { ProductPackService } from '@bunshin/application';
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
  const packs = await new ProductPackService(new db.PrismaProductPackRepository()).list({
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
  });
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
    </main>
  );
}
