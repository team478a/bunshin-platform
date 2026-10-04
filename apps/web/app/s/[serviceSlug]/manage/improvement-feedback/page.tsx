import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { isRouteNotFound } from '../../../../../src/navigation/route-not-found';
import {
  feedbackPreviewWindow,
  type FeedbackPreviewQuery,
} from '../../../../../src/services/improvement-feedback-admin-preview';
import {
  hasServiceSocialFeedbackSurface,
  loadFeedbackAdminPreview,
} from '../../../../../src/services/improvement-feedback-admin-data';
import { PublicShell } from '../../../../ui/public-shell';
import { FeedbackAdminSummary } from './feedback-admin-summary';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SNSの困った報告の確認' };

export default async function FeedbackAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<FeedbackPreviewQuery>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/improvement-feedback`)}`,
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
  const window = feedbackPreviewWindow(await searchParams, new Date());
  const available = await hasServiceSocialFeedbackSurface({
    workspaceId: service.workspaceId,
    serviceId: service.serviceId,
  });
  if (!available) notFound();
  const result =
    window.outcome === 'WINDOW'
      ? await loadFeedbackAdminPreview({
          workspaceId: service.workspaceId,
          serviceId: service.serviceId,
          actorUserId: actor.userId,
          window,
        })
      : { outcome: 'INVALID_WINDOW' as const };
  if (result.outcome === 'FORBIDDEN') notFound();
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者・人手確認</p>
          <h1>SNSの困った報告を確認</h1>
          <p>本人の自己申告を整理します。確定した不具合や、解決済みの記録ではありません。</p>
        </header>
        <section className="settings-card">
          <h2>確認する週（日本時間）</h2>
          <p>完了済みの直近12週です。任意期間や利用者別の絞り込みはできません。</p>
          <nav aria-label="報告を確認する週">
            <ul>
              {window.weeks.map((week) => (
                <li key={week}>
                  <Link
                    href={
                      `/s/${service.configuration.slug}/manage/improvement-feedback?week=${week}` as Route
                    }
                    aria-current={
                      window.outcome === 'WINDOW' && window.week === week ? 'page' : undefined
                    }
                  >
                    {week}の週
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </section>
        {result.outcome === 'PREVIEW' ? (
          <FeedbackAdminSummary
            key={`${service.serviceId}:${window.outcome === 'WINDOW' ? window.week : ''}`}
            preview={result.preview}
            reviewEndpoint={`/api/services/${service.configuration.slug}/improvement-feedback/review`}
          />
        ) : (
          <section className="settings-card">
            <h2>確認を保留しています</h2>
            <p>
              {result.outcome === 'INVALID_WINDOW'
                ? '表示できる週を選び直してください。追加の絞り込み指定は受け付けません。'
                : '報告を取得できませんでした。0件とは判定していません。時間をおいて再確認してください。'}
            </p>
          </section>
        )}
        <Link href={`/s/${service.configuration.slug}/manage` as Route}>← 運営画面へ戻る</Link>
      </main>
    </PublicShell>
  );
}
