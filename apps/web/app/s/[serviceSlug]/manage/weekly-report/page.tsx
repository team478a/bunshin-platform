import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { loadServiceWeeklyProgressReports } from '../../../../../src/services/weekly-progress-report-data';
import { readWeeklyReportDeliverySetting } from '../../../../../src/services/weekly-report-line-delivery';
import { currentLineEnvironment } from '../../../../../src/line/secure-configuration';
import {
  nextWeek,
  previousWeek,
  resolveWeeklyReportWindow,
} from '../../../../../src/services/weekly-progress-report';
import { PublicShell } from '../../../../ui/public-shell';
import { WeeklyReportDeliveryEditor } from './weekly-report-delivery-editor';

export const dynamic = 'force-dynamic';

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );

const deliveryStatusLabel = {
  DRAFT: '下書き',
  SCHEDULED: '配信待ち',
  CANCELLED: '取消済み',
  COMPLETED: '配信処理完了',
} as const;

export default async function ManagedWeeklyReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const { serviceSlug } = await params;
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const window = resolveWeeklyReportWindow((await searchParams).week);
  const db = await import('@bunshin/database');
  const environment = currentLineEnvironment();
  const [reports, lineConfiguration, deliveryHistory] = await Promise.all([
    loadServiceWeeklyProgressReports({
      client: db.prisma,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      window,
    }),
    db.prisma.groupLineChannelConfiguration.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        environment,
        status: 'ACTIVE',
      },
      select: { lastVerifiedAt: true, lastErrorCategory: true, globallyPaused: true },
    }),
    db.prisma.serviceLineBroadcast.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        automationKey: { startsWith: 'weekly-report:' },
      },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        recipients: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);
  const lineReady = Boolean(
    service.configuration.registration.lineEnabled &&
    lineConfiguration?.lastVerifiedAt &&
    !lineConfiguration.lastErrorCategory &&
    !lineConfiguration.globallyPaused,
  );
  const support = reports.filter(({ needsSupport }) => needsSupport);
  const totals = reports.reduce(
    (result, report) => ({
      posted: result.posted + report.posted,
      copied: result.copied + report.copied,
      materials: result.materials + report.materials,
      rested: result.rested + report.rested,
    }),
    { posted: 0, copied: 0, materials: 0, rested: 0 },
  );
  const previous = previousWeek(window.weekStart);
  const following = nextWeek(window.weekStart);
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page weekly-report weekly-report--manager">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>週次レポート</h1>
          <p>
            {dateLabel(window.weekStart)}〜{dateLabel(window.weekEnd)}
            の利用状況です。投稿本文や本人の素材内容は表示しません。
          </p>
        </header>
        <nav className="weekly-report__navigation" aria-label="表示する週">
          <Link
            href={`/s/${service.configuration.slug}/manage/weekly-report?week=${previous}` as Route}
          >
            ← 前の週
          </Link>
          {!window.isCurrent ? (
            <Link
              href={
                `/s/${service.configuration.slug}/manage/weekly-report?week=${following}` as Route
              }
            >
              次の週 →
            </Link>
          ) : (
            <span>今週</span>
          )}
        </nav>

        <section className="settings-card">
          <h2>サービス全体</h2>
          <div className="weekly-report__metrics">
            <article>
              <strong>{reports.length}</strong>
              <span>参加者</span>
            </article>
            <article>
              <strong>{totals.posted}</strong>
              <span>投稿完了</span>
            </article>
            <article>
              <strong>{totals.copied}</strong>
              <span>コピー</span>
            </article>
            <article>
              <strong>{totals.materials}</strong>
              <span>素材追加</span>
            </article>
            <article>
              <strong>{totals.rested}</strong>
              <span>休みの記録</span>
            </article>
            <article>
              <strong>{support.length}</strong>
              <span>声かけ候補</span>
            </article>
          </div>
        </section>

        <section className="settings-card" aria-labelledby="support-heading">
          <p className="eyebrow">まず確認</p>
          <h2 id="support-heading">声かけが役立ちそうな参加者</h2>
          {support.length === 0 ? (
            <p>今週、操作途中で止まっている参加者はいません。</p>
          ) : (
            <ul className="weekly-report__support-list">
              {support.map((report) => (
                <li key={report.userId}>
                  <strong>{report.displayName}</strong>
                  <span>{report.supportReason}</span>
                  <small>おすすめの案内：{report.nextStep}</small>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="settings-card" aria-labelledby="participants-heading">
          <h2 id="participants-heading">参加者ごとの件数</h2>
          {reports.length === 0 ? (
            <p>集計できる参加者がまだいません。</p>
          ) : (
            <div className="weekly-report__participant-list">
              {reports.map((report) => (
                <article key={report.userId}>
                  <header>
                    <h3>{report.displayName}</h3>
                    <span>{report.needsSupport ? '声かけ候補' : '進行中'}</span>
                  </header>
                  <p>
                    確認 {report.confirmed}／コピー {report.copied}／投稿 {report.posted}／休み{' '}
                    {report.rested}／素材 {report.materials}／別案 {report.variantsUsed}
                  </p>
                  <small>
                    ポイント獲得 {report.pointsEarned}／バッジ {report.badges.length}
                  </small>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="settings-card">
          <p className="eyebrow">自動でお知らせ</p>
          <h2>週次レポートをLINEで届ける</h2>
          <p>
            参加者ごとに今週できたことと次の一歩をまとめ、本人だけが開けるレポート画面を案内します。
          </p>
          <WeeklyReportDeliveryEditor
            serviceSlug={service.configuration.slug}
            initialSetting={readWeeklyReportDeliverySetting(
              service.configuration.registration.onboardingConfig,
            )}
            lineReady={lineReady}
          />
          {deliveryHistory.length > 0 ? (
            <div className="weekly-report__delivery-history">
              <h3>最近の自動配信</h3>
              <ul>
                {deliveryHistory.map((delivery) => {
                  const sent = delivery.recipients.filter(({ status }) => status === 'SENT').length;
                  const failed = delivery.recipients.filter(
                    ({ status }) => status === 'FAILED',
                  ).length;
                  return (
                    <li key={delivery.id}>
                      <span>
                        {delivery.scheduledAt
                          ? new Intl.DateTimeFormat('ja-JP', {
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Asia/Tokyo',
                            }).format(delivery.scheduledAt)
                          : '日時未定'}
                      </span>
                      <strong>{deliveryStatusLabel[delivery.status]}</strong>
                      <small>
                        送信 {sent}件／失敗 {failed}件
                      </small>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p>自動配信の履歴はまだありません。</p>
          )}
        </section>

        <section className="settings-card">
          <h2>参加者へLINEで知らせる</h2>
          <p>
            LINE本文には個別の件数や本人素材を入れず、ログインが必要なレポート画面だけを案内します。
          </p>
          <Link
            className="button button--primary"
            href={
              `/s/${service.configuration.slug}/manage/line?template=weekly-report&week=${window.weekStart}` as Route
            }
          >
            安全な案内文を確認する
          </Link>
        </section>
        <Link href={`/s/${service.configuration.slug}/manage` as Route}>← 運営画面へ戻る</Link>
      </main>
    </PublicShell>
  );
}
