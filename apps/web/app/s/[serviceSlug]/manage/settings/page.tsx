import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { ServiceSettingsEditor } from './service-settings-editor';

export const dynamic = 'force-dynamic';

export default async function ServiceSettingsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const { serviceSlug } = await params;
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const value = service.configuration;
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>サービスの見た目・登録設定</h1>
          <p>
            利用者に見える名前、ロゴ、色、参加方法を設定します。秘密のAPIキーはこの画面では扱いません。
          </p>
        </header>
        <section className="settings-card">
          <p>
            <strong>専用URL：</strong> /s/{value.slug}
          </p>
          <p>専用URL、公開状態、利用期間、「Powered by」の表示はシステム管理者が管理します。</p>
        </section>
        <section className="settings-card">
          <ServiceSettingsEditor serviceSlug={value.slug} value={value} />
        </section>
        <a href={`/s/${value.slug}/home`}>サービスホームへ戻る</a>
      </main>
    </PublicShell>
  );
}
