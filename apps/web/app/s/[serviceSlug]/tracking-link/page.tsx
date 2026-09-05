import { ExternalTrackingMemberLinkService } from '@bunshin/application';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';
import { PublicShell } from '../../../ui/public-shell';
import { MemberTrackingLinkForm } from './member-tracking-link-form';

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
        <Link className="button" href={`/s/${serviceSlug}/home` as Route}>
          サービスホームへ戻る
        </Link>
      </main>
    </PublicShell>
  );
}
