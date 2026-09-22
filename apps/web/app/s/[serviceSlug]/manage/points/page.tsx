import { notFound, redirect } from 'next/navigation';

import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { loadPointSettingsData } from './points-data';
import { PointSettingsNotices } from './points-notices';
import { PointsOperationsSections } from './points-operations-sections';
import type { PointSettingsQuery } from './points-page-types';
import { PointsPilotSections } from './points-pilot-sections';

export const dynamic = 'force-dynamic';

export default async function ServicePointSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<PointSettingsQuery>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/points`)}`);

  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();

  const [data, query] = await Promise.all([
    loadPointSettingsData({
      workspaceId: service.workspaceId,
      serviceId: service.serviceId,
      actorUserId: actor.userId,
    }),
    searchParams,
  ]);

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>ポイントとバッジ</h1>
          <p>このサービスで使うポイント数とバッジを、運営者が設定できます。</p>
          <a href={`/s/${serviceSlug}/manage`}>← 管理メニューへ戻る</a>
        </header>
        <PointSettingsNotices query={query} />
        <PointsPilotSections data={data} serviceId={service.serviceId} serviceSlug={serviceSlug} />
        <PointsOperationsSections data={data} serviceSlug={serviceSlug} />
      </main>
    </PublicShell>
  );
}
