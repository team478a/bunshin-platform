import { ListBunshins } from '@bunshin/application';
import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

export default async function BunshinsPage() {
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  if (currentUser === null) redirect('/login');
  const { listActiveWorkspacesForUser, PrismaBunshinRepository, PrismaPlatformAdminRepository } =
    await import('@bunshin/database');
  const workspaces = await listActiveWorkspacesForUser(currentUser.userId);
  const workspace = workspaces[0];
  if (workspace === undefined)
    return (
      <main>
        <h1>BUNSHIN</h1>
        <p>ワークスペースがありません。</p>
      </main>
    );
  const bunshins = await new ListBunshins(new PrismaBunshinRepository()).execute({
    workspaceId: workspace.id,
    actorUserId: currentUser.userId,
  });
  const platformAdmin = await new PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    currentUser.userId,
  );
  return (
    <main className="app-page bunshin-home">
      <header className="app-page__heading">
        <p className="eyebrow">YOUR BUNSHIN</p>
        <h1>BUNSHIN</h1>
        <p>{workspace.name}</p>
      </header>
      {platformAdmin ? (
        <aside className="admin-shortcut">
          <strong>管理者メニュー</strong>
          <span>
            <Link href="/admin/legal">法務</Link>
            <Link href="/admin/deletions">退会要求</Link>
            <Link href="/admin/line">LINE</Link>
            <Link href={`/validation?workspaceId=${workspace.id}` as Route}>検証指標</Link>
          </span>
        </aside>
      ) : null}
      {bunshins.length === 0 ? (
        <section className="empty-state bunshin-empty-state">
          <div className="echo-motif" aria-hidden="true" />
          <h2>最初のBUNSHINを作りましょう</h2>
          <p>あなたの目的や話し方を理解して、毎日の発信を一緒に考えるパートナーです。</p>
          <Link
            className="button button--primary button--full"
            href={`/bunshins/new?workspaceId=${workspace.id}` as Route}
          >
            BUNSHINを作る
          </Link>
          <small>約3分・あとから変更できます</small>
        </section>
      ) : (
        <section>
          <div className="section-heading">
            <h2>あなたのBUNSHIN</h2>
            <Link href={`/bunshins/new?workspaceId=${workspace.id}` as Route}>新しく作る</Link>
          </div>
          <ul className="bunshin-card-list">
            {bunshins.map((bunshin) => (
              <li key={bunshin.id}>
                <Link href={`/bunshins/${bunshin.id}?workspaceId=${workspace.id}` as Route}>
                  <span className="bunshin-avatar" aria-hidden="true">
                    {bunshin.name.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{bunshin.name}</strong>
                    <small>{bunshin.status === 'ACTIVE' ? '活動中' : '停止中'}</small>
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
