import { ListGroupLineConfigurations } from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { GroupLineEditor } from '../../../../(app)/admin/groups/[groupId]/line/group-line-editor';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import {
  currentLineEnvironment,
  lineEndpointUrls,
} from '../../../../../src/line/secure-configuration';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';

export const dynamic = 'force-dynamic';

export default async function ServiceLinePage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const { serviceSlug } = await params;
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const result = await new ListGroupLineConfigurations(
    new db.PrismaGroupLineConfigurationRepository(),
  ).execute({
    actorUserId: actor.userId,
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    environment: currentLineEnvironment(),
  });
  const urls = lineEndpointUrls();
  const endpoint = `/api/services/${encodeURIComponent(service.configuration.slug)}/line-configurations`;
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>{service.configuration.displayName}の公式LINE</h1>
          <p>このサービス専用の公式LINEを登録し、接続確認後に利用を開始できます。</p>
        </header>
        <section className="settings-card">
          <h2>LINE Developersへ登録するURL</h2>
          <p>次のURLは自動生成されています。内容を変更せずにコピーしてください。</p>
          <dl>
            <dt>ログイン後の戻り先</dt>
            <dd>
              <code>{urls.callbackUrl}</code>
            </dd>
            <dt>LINE内で開く画面</dt>
            <dd>
              <code>{urls.liffEndpointUrl}</code>
            </dd>
            <dt>メッセージ受信用URL</dt>
            <dd>設定を保存すると、その設定専用のURLが下に表示されます。</dd>
          </dl>
        </section>
        <GroupLineEditor
          workspaceId={service.workspaceId}
          groupId={service.serviceId}
          environment={currentLineEnvironment()}
          webhookOrigin={new URL(urls.webhookUrl).origin}
          initialMode={result.mode}
          initialConfigurations={result.configurations.map((item) => ({
            ...item,
            lastVerifiedAt: item.lastVerifiedAt?.toISOString() ?? null,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          }))}
          endpoint={endpoint}
          scopeLabel="サービス"
        />
        <a href={`/s/${service.configuration.slug}/home`}>サービスホームへ戻る</a>
      </main>
    </PublicShell>
  );
}
