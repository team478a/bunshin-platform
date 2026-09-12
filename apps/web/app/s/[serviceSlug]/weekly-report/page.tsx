import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';
import { loadServiceWeeklyProgressReports } from '../../../../src/services/weekly-progress-report-data';
import {
  nextWeek,
  previousWeek,
  resolveWeeklyReportWindow,
} from '../../../../src/services/weekly-progress-report';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}): Promise<Metadata> {
  const service = await resolvePublicServiceContext((await params).serviceSlug);
  return { title: `${service.configuration.displayName}｜今週のふり返り` };
}

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );

export default async function ServiceWeeklyReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { serviceSlug } = await params;
  const service = await resolvePublicServiceContext(serviceSlug).catch(() => null);
  if (!service) notFound();
  const window = resolveWeeklyReportWindow((await searchParams).week);
  const actor = await (await currentUserProvider()).getCurrentUser();
  const returnTo =
    `/s/${service.configuration.slug}/weekly-report?week=${window.weekStart}` as Route;
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);
  const db = await import('@bunshin/database');
  const report = (
    await loadServiceWeeklyProgressReports({
      client: db.prisma,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      window,
      userId: actor.userId,
    })
  )[0];
  if (!report) notFound();
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;
  const firstBunshin = report.bunshins[0];
  const previous = previousWeek(window.weekStart);
  const following = nextWeek(window.weekStart);
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="service-entry weekly-report" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">今週のふり返り</p>
          <h1>{report.displayName}さんのできたこと</h1>
          <p>
            {dateLabel(window.weekStart)}〜{dateLabel(window.weekEnd)}
          </p>
        </header>

        <nav className="weekly-report__navigation" aria-label="表示する週">
          <Link href={`/s/${service.configuration.slug}/weekly-report?week=${previous}` as Route}>
            ← 前の週
          </Link>
          {!window.isCurrent ? (
            <Link
              href={`/s/${service.configuration.slug}/weekly-report?week=${following}` as Route}
            >
              次の週 →
            </Link>
          ) : (
            <span>今週</span>
          )}
        </nav>

        <section
          className="service-entry__card weekly-report__hero"
          aria-labelledby="weekly-result"
        >
          <p className="weekly-report__check" aria-hidden="true">
            ✓
          </p>
          <h2 id="weekly-result">{report.headline}</h2>
          <p>小さな操作も、続けるための大切な一歩として数えています。</p>
        </section>

        <section className="service-entry__card" aria-labelledby="weekly-details">
          <h2 id="weekly-details">今週できたこと</h2>
          <div className="weekly-report__metrics">
            <article>
              <strong>{report.confirmed}</strong>
              <span>投稿案を確認</span>
            </article>
            <article>
              <strong>{report.copied}</strong>
              <span>文章などをコピー</span>
            </article>
            <article>
              <strong>{report.posted}</strong>
              <span>投稿できた</span>
            </article>
            <article>
              <strong>{report.rested}</strong>
              <span>休むと記録</span>
            </article>
            <article>
              <strong>{report.materials}</strong>
              <span>自分の素材を追加</span>
            </article>
            <article>
              <strong>{report.variantsUsed}</strong>
              <span>別の投稿案を選択</span>
            </article>
          </div>
        </section>

        {(report.pointsEarned > 0 ||
          report.pointsUsed > 0 ||
          report.expiringPoints > 0 ||
          report.badges.length > 0) && (
          <section className="service-entry__card" aria-labelledby="weekly-rewards">
            <h2 id="weekly-rewards">ポイント・バッジ</h2>
            {(report.pointsEarned > 0 || report.pointsUsed > 0) && (
              <p>
                獲得 <strong>{report.pointsEarned}ポイント</strong>
                {report.pointsUsed > 0 ? `／利用 ${report.pointsUsed}ポイント` : ''}
              </p>
            )}
            {report.expiringPoints > 0 && report.nextPointExpiryAt && (
              <div className="notice notice--warning" role="status">
                <strong>期限が近いポイントがあります</strong>
                <p>
                  今後30日以内に {report.expiringPoints} WPが期限を迎えます。最も近い期限は
                  {new Intl.DateTimeFormat('ja-JP', {
                    timeZone: 'Asia/Tokyo',
                    month: 'long',
                    day: 'numeric',
                  }).format(report.nextPointExpiryAt)}
                  です。
                </p>
                <Link
                  className="button button--secondary"
                  href={`/points?workspaceId=${encodeURIComponent(service.workspaceId)}` as Route}
                >
                  ポイントの期限と履歴を見る
                </Link>
              </div>
            )}
            {report.badges.length > 0 && (
              <ul className="weekly-report__badges">
                {report.badges.map((badge) => (
                  <li key={badge}>🏅 {badge}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="service-entry__card weekly-report__next" aria-labelledby="weekly-next">
          <p className="eyebrow">次にやることは一つだけ</p>
          <h2 id="weekly-next">{report.nextStep}</h2>
          {firstBunshin ? (
            <Link
              className="button button--primary button--full"
              href={`/s/${service.configuration.slug}/bunshins/${firstBunshin.id}` as Route}
            >
              この一歩を始める
            </Link>
          ) : (
            <Link
              className="button button--primary button--full"
              href={`/s/${service.configuration.slug}/bunshins/new` as Route}
            >
              投稿パートナーを作る
            </Link>
          )}
        </section>
        <Link href={`/s/${service.configuration.slug}/home` as Route}>← サービスホームへ戻る</Link>
      </main>
    </PublicShell>
  );
}
