import {
  ExternalTrackingMemberLinkService,
  ListServiceBunshins,
  MemberProductProfileService,
} from '@bunshin/application';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';
import { PublicShell } from '../../../ui/public-shell';
import { MemberTrackingLinkForm } from './member-tracking-link-form';
import { MemberProductContentForm } from './member-product-content-form';

export const dynamic = 'force-dynamic';

export default async function ServiceMemberTrackingLinkPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const service = await resolvePublicServiceContext(serviceSlug).catch(() => null);
  if (!service) notFound();
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/tracking-link`)}` as Route);
  const db = await import('@bunshin/database');
  const settings = await new ExternalTrackingMemberLinkService(
    new db.PrismaExternalTrackingLinkRepository(undefined, service.serviceId),
  )
    .list({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
    })
    .catch(() => null);
  if (!settings) redirect(`/s/${serviceSlug}` as Route);
  const scope = {
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
  };
  const profileService = new MemberProductProfileService(
    new db.PrismaMemberProductProfileRepository(),
  );
  const [profiles, productMasters, bunshins] = await Promise.all([
    profileService.list(scope),
    profileService.listProductMasters(scope),
    new ListServiceBunshins(new db.PrismaBunshinRepository()).execute(scope),
  ]);

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">{service.configuration.displayName}</p>
          <h1>あなたの代理店URL</h1>
          <p>投稿案に入れる、あなた専用の代理店URLを登録します。</p>
        </header>
        <section className="settings-card">
          <MemberTrackingLinkForm
            serviceSlug={serviceSlug}
            settings={JSON.parse(JSON.stringify(settings)) as never}
          />
        </section>
        <section className="settings-card">
          <div>
            <p className="eyebrow">投稿を作る</p>
            <h2>登録したURLで商品紹介文を作る</h2>
            <p>
              運営者が確認したURLだけを使用します。通常の投稿へ勝手に追加されることはありません。
            </p>
          </div>
          <MemberProductContentForm
            serviceSlug={serviceSlug}
            settings={JSON.parse(JSON.stringify(settings)) as never}
            profiles={JSON.parse(JSON.stringify(profiles)) as never}
            productMasters={productMasters}
            bunshins={bunshins.map(({ id, name }) => ({ id, name }))}
          />
        </section>
        <Link className="button" href={`/s/${serviceSlug}/home` as Route}>
          サービスホームへ戻る
        </Link>
      </main>
    </PublicShell>
  );
}
