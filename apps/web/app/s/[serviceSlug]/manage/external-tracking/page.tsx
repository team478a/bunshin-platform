import { ExternalTrackingLinkService } from '@bunshin/application';
import { redirect } from 'next/navigation';
import { ExternalTrackingOperations } from '../../../../(app)/admin/external-tracking/external-tracking-operations';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export default async function ServiceExternalTrackingPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const serviceSlug = (await params).serviceSlug;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/external-tracking`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
  const db = await import('@bunshin/database');
  const configuration = await new ExternalTrackingLinkService(
    new db.PrismaExternalTrackingLinkRepository(undefined, service.serviceId),
  ).listConfiguration({
    workspaceId: service.workspaceId,
    actorUserId: actor.userId,
    groupId: service.serviceId,
  });
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">{service.configuration.displayName}の管理</p>
        <h1>参加者の専用URL</h1>
        <p>外部システムで発行した紹介URLを登録し、投稿案へ安全に差し込みます。</p>
      </header>
      <ExternalTrackingOperations
        workspaceId={service.workspaceId}
        groupId={service.serviceId}
        initialConfiguration={JSON.parse(JSON.stringify(configuration)) as never}
        apiBase={`/api/services/${service.configuration.slug}/external-tracking`}
      />
    </main>
  );
}
