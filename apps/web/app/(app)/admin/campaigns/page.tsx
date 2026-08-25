import { CampaignService } from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { CampaignAdminEditor } from './campaign-admin-editor';

export const dynamic = 'force-dynamic';

export default async function CampaignAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  if (!(await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(user.userId)))
    notFound();
  const memberships = await db.prisma.workspaceMembership.findMany({
    where: {
      userId: user.userId,
      status: 'ACTIVE',
      role: { in: ['OWNER', 'ADMIN'] },
      workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
    },
    select: { workspace: { select: { id: true, name: true } } },
    orderBy: { workspace: { name: 'asc' } },
  });
  const requested = (await searchParams).workspaceId;
  const workspace =
    memberships.find((item) => item.workspace.id === requested)?.workspace ??
    memberships[0]?.workspace;
  if (!workspace)
    return (
      <main className="app-page">
        <h1>参加募集</h1>
        <p>管理できる団体がありません。</p>
      </main>
    );
  const [campaigns, versions] = await Promise.all([
    new CampaignService(new db.PrismaCampaignRepository()).listManaged({
      workspaceId: workspace.id,
      actorUserId: user.userId,
    }),
    db.prisma.productPackVersion.findMany({
      where: {
        status: 'PUBLISHED',
        productPack: { workspaceId: workspace.id, status: 'ACTIVE', group: { status: 'ACTIVE' } },
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
        <p className="eyebrow">本部管理</p>
        <h1>参加募集</h1>
        <p>本人が自由に参加・保留・辞退できる募集だけを管理します。</p>
      </header>
      <form method="get" className="settings-card">
        <label>
          管理する団体
          <select name="workspaceId" defaultValue={workspace.id}>
            {memberships.map(({ workspace: item }) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">切り替える</button>
      </form>
      <CampaignAdminEditor
        workspaceId={workspace.id}
        initialCampaigns={JSON.parse(JSON.stringify(campaigns)) as never[]}
        versions={versions.map((item) => ({
          id: item.id,
          groupId: item.productPack.groupId,
          label: `${item.productPack.name} 第${item.version}版`,
          assets: item.assets,
        }))}
      />
    </main>
  );
}
