import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { GroupAdminEditor } from './group-admin-editor';

export const dynamic = 'force-dynamic';

export default async function GroupAdminPage({
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

  const workspaces = await db.prisma.workspace.findMany({
    where: {
      status: 'ACTIVE',
      type: 'ORGANIZATION',
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const requested = (await searchParams).workspaceId;
  const workspace = workspaces.find((item) => item.id === requested) ?? workspaces[0];

  if (!workspace)
    return (
      <main className="app-page">
        <h1>グループ管理</h1>
        <p>管理できる団体がありません。</p>
      </main>
    );

  const groups = await db.prisma.group.findMany({
    where: { workspaceId: workspace.id },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      _count: { select: { memberships: true, productPacks: true, campaigns: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">本部管理</p>
        <h1>グループ管理</h1>
        <p>テストや共同運用に使うグループを、管理画面から作成・確認できます。</p>
      </header>
      <form method="get" className="settings-card">
        <label>
          管理する団体
          <select name="workspaceId" defaultValue={workspace.id}>
            {workspaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>{' '}
        <button type="submit">切り替える</button>
      </form>
      <GroupAdminEditor workspaceId={workspace.id} />
      <section className="settings-card" aria-labelledby="saved-groups-title">
        <h2 id="saved-groups-title">作成済みのグループ</h2>
        {groups.length === 0 ? (
          <p>まだグループはありません。上の入力欄から最初のグループを作成してください。</p>
        ) : (
          <ul>
            {groups.map((group) => (
              <li key={group.id}>
                <strong>{group.name}</strong> — 状態：{group.status}／参加者：
                {group._count.memberships}人／商品：{group._count.productPacks}件／募集：
                {group._count.campaigns}件<br />
                <Link href={`/admin/groups/${group.id}/features`}>
                  このグループで使える機能を設定
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
