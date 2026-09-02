import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const roleLabel = {
  OWNER: '団体所有者',
  ADMIN: '運営管理者',
  MEMBER: '参加者',
} as const;

export default async function OrganizationsPage() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const memberships = await db.prisma.workspaceMembership.findMany({
    where: {
      userId: actor.userId,
      status: 'ACTIVE',
      role: { in: ['OWNER', 'ADMIN'] },
      workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
    },
    select: {
      id: true,
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          description: true,
          groups: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              name: true,
              serviceConfiguration: { select: { slug: true, displayName: true } },
            },
            orderBy: { name: 'asc' },
          },
        },
      },
    },
    orderBy: { workspace: { name: 'asc' } },
  });

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">運営者メニュー</p>
        <h1>管理できる運営団体</h1>
        <p>運営団体やサービスを選んで、参加者・公式情報・LINEなどを設定できます。</p>
      </header>

      {memberships.length === 0 ? (
        <section className="settings-card">
          <h2>管理できる運営団体はありません</h2>
          <p>運営団体の所有者または運営管理者から、招待を送ってもらってください。</p>
          <Link className="button button--secondary" href="/groups">
            参加中の活動プログラムを見る
          </Link>
        </section>
      ) : (
        memberships.map((membership) => (
          <section className="settings-card" key={membership.id}>
            <div className="management-section__heading">
              <div>
                <p className="management-section__eyebrow">{roleLabel[membership.role]}</p>
                <h2>{membership.workspace.name}</h2>
              </div>
              <span>{membership.workspace.groups.length}件を運用中</span>
            </div>
            {membership.workspace.description ? <p>{membership.workspace.description}</p> : null}
            <div className="button-row">
              <Link className="button" href={`/organizations/${membership.workspace.id}/manage`}>
                団体情報・運営者を管理
              </Link>
            </div>

            <h3>この団体のグループ・サービス</h3>
            {membership.workspace.groups.length === 0 ? (
              <p>まだグループはありません。上の管理画面から作成できます。</p>
            ) : (
              <ul className="organization-group-list">
                {membership.workspace.groups.map((group) => (
                  <li key={group.id}>
                    <div>
                      <strong>{group.serviceConfiguration?.displayName ?? group.name}</strong>
                      <span>{group.name}</span>
                    </div>
                    <div className="button-row">
                      {group.serviceConfiguration ? (
                        <Link
                          className="button button--secondary"
                          href={`/s/${group.serviceConfiguration.slug}/manage`}
                        >
                          サービスを管理
                        </Link>
                      ) : null}
                      <Link
                        className="button button--secondary"
                        href={`/groups/${group.id}/members`}
                      >
                        参加者・機能を管理
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </main>
  );
}
