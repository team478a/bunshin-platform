import { ListBunshins } from '@bunshin/application';
import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

export default async function BunshinsPage() {
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  if (currentUser === null) redirect('/login');
  const { listActiveWorkspacesForUser, PrismaBunshinRepository } =
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
  return (
    <main>
      <h1>BUNSHIN</h1>
      <p>{workspace.name}</p>
      <p>
        <Link href={`/bunshins/new?workspaceId=${workspace.id}` as Route}>新しい分身を作る</Link>
      </p>
      <p>
        <Link href="/knowledge">Knowledgeを管理</Link>
      </p>
      {bunshins.length === 0 ? (
        <p>まだ分身はありません。</p>
      ) : (
        <ul>
          {bunshins.map((bunshin) => (
            <li key={bunshin.id}>
              <Link href={`/bunshins/${bunshin.id}?workspaceId=${workspace.id}` as Route}>
                {bunshin.name}
              </Link>{' '}
              — {bunshin.status}
            </li>
          ))}
        </ul>
      )}
      <form action="/auth/logout" method="post">
        <button type="submit">ログアウト</button>
      </form>
    </main>
  );
}
