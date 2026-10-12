import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { isRouteNotFound } from '../../../../../src/navigation/route-not-found';
import { availableOverviewPackages } from '../../../../../src/services/service-improvement-admin-data';
import { feedbackPreviewWindow } from '../../../../../src/services/improvement-feedback-admin-preview';
import { PublicShell } from '../../../../ui/public-shell';
import { ServiceOverviewCard } from './card';
export const dynamic = 'force-dynamic';
export const metadata = { title: '利用記録と改善の確認' };
export default async function ServiceOverviewPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/improvement-overview`)}`,
    );
  const service = await resolveManagedServiceContext(
    serviceSlug,
    actor.userId,
    'ADMINISTRATION',
  ).catch((error: unknown) => {
    if (isRouteNotFound(error) || (error instanceof Error && error.message === 'SERVICE_NOT_FOUND'))
      notFound();
    throw error;
  });
  if (!['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(service.serviceRole)) notFound();
  const packages = await availableOverviewPackages({
    workspaceId: service.workspaceId,
    serviceId: service.serviceId,
  });
  if (!packages.length) notFound();
  const window = feedbackPreviewWindow({}, new Date());
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者・読取専用</p>
          <h1>利用記録と改善の確認</h1>
          <p>
            このサービスの保存済み記録を確認します。利用者の個別最適化や、システムの自動修正は実行しません。
          </p>
        </header>
        <ServiceOverviewCard
          endpoint={`/api/services/${encodeURIComponent(service.configuration.slug)}/improvement-overview`}
          packages={packages}
          weeks={window.weeks}
        />
        {packages.includes('SOCIAL') && (
          <p>
            <Link href={`/s/${service.configuration.slug}/manage/improvement-feedback` as Route}>
              SNSの困った報告を人手で確認する
            </Link>
          </p>
        )}
        <Link href={`/s/${service.configuration.slug}/manage` as Route}>← 運営画面へ戻る</Link>
      </main>
    </PublicShell>
  );
}
