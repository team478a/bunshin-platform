import { CampaignService } from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { CampaignAdminEditor } from '../../../../(app)/admin/campaigns/campaign-admin-editor';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolvePublicServiceContext } from '../../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export default async function ServiceCampaignsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const service = await resolvePublicServiceContext((await params).serviceSlug);
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/s/${service.configuration.slug}/manage/campaigns`)}`,
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
  const [campaigns, versions] = await Promise.all([
    new CampaignService(new db.PrismaCampaignRepository()).listManaged({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
    }),
    db.prisma.productPackVersion.findMany({
      where: {
        status: 'PUBLISHED',
        productPack: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          status: 'ACTIVE',
        },
      },
      select: {
        id: true,
        version: true,
        productPack: { select: { name: true, groupId: true } },
        assets: { select: { id: true, label: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { publishedAt: 'desc' },
    }),
  ]);
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">{service.configuration.displayName}の管理</p>
        <h1>参加募集</h1>
        <p>公開済みの商品情報を使い、参加者へ案内する企画を管理します。</p>
      </header>
      <CampaignAdminEditor
        workspaceId={service.workspaceId}
        initialCampaigns={JSON.parse(JSON.stringify(campaigns)) as never[]}
        versions={versions.map((item) => ({
          id: item.id,
          groupId: item.productPack.groupId,
          label: `${item.productPack.name} 第${item.version}版`,
          assets: item.assets,
        }))}
        apiBase={`/api/services/${service.configuration.slug}/campaigns`}
      />
    </main>
  );
}
