import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const roleLabel = {
  MANAGER: 'グループ管理者',
  PARTICIPANT: '参加者',
} as const;

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; declined?: string; error?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const memberships = await db.prisma.groupMembership.findMany({
    where: {
      userId: actor.userId,
      status: 'ACTIVE',
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: {
      id: true,
      role: true,
      group: {
        select: {
          id: true,
          name: true,
          workspace: { select: { name: true } },
          _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
        },
      },
    },
    orderBy: { group: { name: 'asc' } },
  });
  const query = await searchParams;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">グループ</p>
        <h1>参加しているグループ</h1>
        <p>参加中のグループと、自分の役割を確認できます。</p>
      </header>

      {query.joined === '1' ? (
        <p className="notice notice--success" role="status">
          グループに参加しました。
        </p>
      ) : null}
      {query.declined === '1' ? (
        <p className="notice" role="status">
          今回は参加しませんでした。
        </p>
      ) : null}
      {query.error === 'invitation' ? (
        <p className="notice notice--danger" role="alert">
          招待リンクを使用できませんでした。期限切れまたは使用済みの可能性があります。
        </p>
      ) : null}

      {memberships.length === 0 ? (
        <section className="settings-card">
          <h2>参加中のグループはありません</h2>
          <p>グループから招待されると、ここに表示されます。</p>
        </section>
      ) : null}

      {memberships.map((membership) => (
        <section className="settings-card" key={membership.id}>
          <h2>{membership.group.name}</h2>
          <p>団体：{membership.group.workspace.name}</p>
          <p>
            あなたの役割：{roleLabel[membership.role]} ／ 参加者：
            {membership.group._count.memberships}人
          </p>
          {membership.role === 'MANAGER' ? (
            <Link className="button" href={`/groups/${membership.group.id}/members`}>
              参加者が使える機能を設定
            </Link>
          ) : (
            <p>使える機能はグループ管理者が設定します。</p>
          )}
        </section>
      ))}
    </main>
  );
}
