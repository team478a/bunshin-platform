import { ExternalTrackingLinkService } from '@bunshin/application';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { ExternalTrackingOperations } from './external-tracking-operations';

export const dynamic = 'force-dynamic';

export default async function ExternalTrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; groupId?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
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
  const requested = await searchParams;
  const workspace =
    memberships.find(({ workspace: item }) => item.id === requested.workspaceId)?.workspace ??
    memberships[0]?.workspace;
  if (!workspace)
    return (
      <main className="app-page">
        <h1>専用URL管理</h1>
        <p>管理できる団体がありません。</p>
        <p>専用URLを管理する前に、運営団体を作成してください。</p>
        <Link className="button" href="/admin/organizations">
          運営団体を作成する
        </Link>
      </main>
    );
  const groups = await db.prisma.group.findMany({
    where: { workspaceId: workspace.id, status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const group = groups.find((item) => item.id === requested.groupId) ?? groups[0];
  const configuration = group
    ? await new ExternalTrackingLinkService(
        new db.PrismaExternalTrackingLinkRepository(),
      ).listConfiguration({
        workspaceId: workspace.id,
        actorUserId: user.userId,
        groupId: group.id,
      })
    : null;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">本部管理</p>
        <h1>専用URL管理</h1>
        <p>参加者へ渡す紹介URLの登録、停止、期限、設定漏れ、使用履歴を管理します。</p>
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
        <label>
          管理するグループ
          <select name="groupId" defaultValue={group?.id ?? ''}>
            {groups.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>{' '}
        <button type="submit">切り替える</button>
      </form>
      {group && configuration ? (
        <ExternalTrackingOperations
          workspaceId={workspace.id}
          groupId={group.id}
          initialConfiguration={JSON.parse(JSON.stringify(configuration)) as never}
        />
      ) : (
        <section className="settings-card">
          <p>先にグループを作成してください。</p>
          <Link className="button" href="/admin/groups">
            グループを作成する
          </Link>
        </section>
      )}
    </main>
  );
}
