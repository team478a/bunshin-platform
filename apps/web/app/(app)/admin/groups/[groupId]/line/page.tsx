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
        <h2>設定する順番</h2>
        <ol>
          <li>このグループ専用の公式LINEを使うか、ワタシワークス共通LINEを使うかを選びます。</li>
          <li>
            専用LINEを使う場合は、LINE Developersで同じProvider内に「LINEログイン用」と「Messaging
            API（通知用）」の2つのチャネルを用意します。
          </li>
          <li>
            下のURLをLINE Developersへ登録し、発行された番号・秘密の値をこの画面へ入力します。
          </li>
          <li>「停止中の設定として保存」を押し、「接続できるか確認」で確認します。</li>
          <li>
            確認に成功したら「使用を開始」を押します。最後に自分のLINEアカウントで受信を確認します。
          </li>
        </ol>
        <p>
          保存だけでは通知は送信されません。確認に成功してから、明示的に使用を開始する仕組みです。
        </p>
      </section>
      <section className="settings-card">
        <h2>LINE Developersへ登録するURL</h2>
        <p>
          URLはサーバーが作ります。変更せず、LINE Developersの該当する入力欄へコピーしてください。
        </p>
        <dl>
          <dt>LINEログインのコールバックURL</dt>
          <dd>
            <code>{base.callbackUrl}</code>
          </dd>
          <dt>Messaging APIのWebhook URL</dt>
          <dd>専用設定を保存すると、下の「保存した設定」に個別URLが表示されます。</dd>
          <dt>LIFFのエンドポイントURL（LIFFを使う場合のみ）</dt>
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
