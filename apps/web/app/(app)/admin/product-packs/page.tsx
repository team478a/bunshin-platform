import { ProductPackService } from '@bunshin/application';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { ProductPackAdminEditor } from './product-pack-admin-editor';

export const dynamic = 'force-dynamic';

export default async function ProductPackAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const platformAdmin =
    await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(user.userId);
  if (!platformAdmin) notFound();

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

  if (!workspace) {
    return (
      <main className="app-page">
        <h1>公式商品パック</h1>
        <p>管理できる団体の作業場所がありません。</p>
        <p>商品情報を登録する前に、運営団体を作成してください。</p>
        <Link className="button" href="/admin/organizations">
          運営団体を作成する
        </Link>
      </main>
    );
  }

  const [groups, packs] = await Promise.all([
    db.prisma.group.findMany({
      where: { workspaceId: workspace.id, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    new ProductPackService(new db.PrismaProductPackRepository()).list({
      workspaceId: workspace.id,
      actorUserId: user.userId,
    }),
  ]);

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">本部管理</p>
        <h1>公式商品パック</h1>
        <p>公式情報を版として保存し、公開中の内容と利用状況を安全に管理します。</p>
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
        </label>{' '}
        <button type="submit">切り替える</button>
      </form>
      <ProductPackAdminEditor
        workspaceId={workspace.id}
        groups={groups}
        initialPacks={JSON.parse(JSON.stringify(packs)) as unknown[]}
      />
    </main>
  );
}
