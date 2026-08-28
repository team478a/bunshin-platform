import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ListGroupLineConfigurations } from '@bunshin/application';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import {
  currentLineEnvironment,
  lineEndpointUrls,
} from '../../../../../../src/line/secure-configuration';
import { GroupLineEditor } from './group-line-editor';

export const dynamic = 'force-dynamic';

export default async function GroupLinePage({ params }: { params: Promise<{ groupId: string }> }) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const { groupId } = await params;
  const db = await import('@bunshin/database');
  const group = await db.prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, workspaceId: true, name: true },
  });
  if (!group) notFound();
  const result = await new ListGroupLineConfigurations(
    new db.PrismaGroupLineConfigurationRepository(),
  )
    .execute({
      actorUserId: user.userId,
      workspaceId: group.workspaceId,
      groupId,
      environment: currentLineEnvironment(),
    })
    .catch(() => null);
  if (!result) notFound();
  const base = lineEndpointUrls();
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">テストグループ限定</p>
        <h1>{group.name}の公式LINE</h1>
        <p>
          このグループ専用の公式LINEを使うかを設定します。設定に問題があるとき、共通LINEから勝手に送信することはありません。
        </p>
      </header>
      <section className="settings-card">
        <h2>LINE Developersへ登録するURL</h2>
        <p>URLはサーバーが作ります。変更せずコピーして登録してください。</p>
        <dl>
          <dt>ログイン後の戻り先</dt>
          <dd>
            <code>{base.callbackUrl}</code>
          </dd>
          <dt>グループ用Webhook</dt>
          <dd>専用設定を保存すると個別URLが表示されます。</dd>
          <dt>LINE内で開く画面</dt>
          <dd>
            <code>{base.liffEndpointUrl}</code>
          </dd>
        </dl>
      </section>
      <GroupLineEditor
        workspaceId={group.workspaceId}
        groupId={group.id}
        environment={currentLineEnvironment()}
        webhookOrigin={new URL(base.webhookUrl).origin}
        initialMode={result.mode}
        initialConfigurations={result.configurations.map((item) => ({
          ...item,
          lastVerifiedAt: item.lastVerifiedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        }))}
      />
      <p>
        <Link href={`/admin/groups?workspaceId=${group.workspaceId}`}>← グループ一覧へ戻る</Link>
      </p>
    </main>
  );
}
