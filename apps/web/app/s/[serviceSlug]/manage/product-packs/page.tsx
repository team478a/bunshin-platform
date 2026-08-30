import { ProductPackService } from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { ProductPackAdminEditor } from '../../../../(app)/admin/product-packs/product-pack-admin-editor';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolvePublicServiceContext } from '../../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export default async function ServiceProductPacksPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const service = await resolvePublicServiceContext((await params).serviceSlug);
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/s/${service.configuration.slug}/manage/product-packs`)}`,
    );
  const db = await import('@bunshin/database');
  const manager = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      role: 'MANAGER',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (!manager) notFound();
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
