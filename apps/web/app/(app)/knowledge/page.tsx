import { ListOwnerKnowledge } from '@bunshin/application';
import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';
export const dynamic = 'force-dynamic';
export default async function KnowledgePage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const { listActiveWorkspacesForUser, PrismaOwnerKnowledgeRepository } =
    await import('@bunshin/database');
  const workspace = (await listActiveWorkspacesForUser(user.userId))[0];
  if (!workspace)
    return (
      <main>
        <h1>Knowledge</h1>
        <p>ワークスペースがありません。</p>
      </main>
    );
  const items = await new ListOwnerKnowledge(new PrismaOwnerKnowledgeRepository()).execute({
    workspaceId: workspace.id,
    actorUserId: user.userId,
  });
  return (
    <main>
      <h1>Knowledge</h1>
      <p>
        <Link href={`/knowledge/new?workspaceId=${workspace.id}` as Route}>新規作成</Link>
      </p>
      {items.length === 0 ? (
        <p>Knowledgeはまだありません。</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/knowledge/${item.id}?workspaceId=${workspace.id}` as Route}>
                {item.title}
              </Link>
              （{item.type}）
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
