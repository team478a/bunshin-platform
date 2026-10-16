import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { readServiceOnboardingSettings } from '../../../../../src/services/service-onboarding-settings';
import {
  listBusinessProgramParticipants,
  loadBusinessProgramReport,
} from '../../../../../src/services/business-program-report-data';
import { BusinessProgramReportView } from '../../../../ui/business-program-report';
import { PublicShell } from '../../../../ui/public-shell';

export const dynamic = 'force-dynamic';

export default async function ManagedBusinessProgramReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ user?: string; cycle?: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/90-day-report`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const settings = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  );
  if (!settings.businessProfileEnabled) notFound();
  const db = await import('@bunshin/database');
  const participants = await listBusinessProgramParticipants({
    client: db.prisma,
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
  });
  const query = await searchParams;
  const selected = participants.find(({ userId }) => userId === query.user) ?? participants[0];
  const requestedCycle = Number.parseInt(query.cycle ?? '', 10);
  const report = selected
    ? await loadBusinessProgramReport({
        client: db.prisma,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: selected.userId,
        ...(Number.isFinite(requestedCycle) ? { cycleNumber: requestedCycle } : {}),
      })
    : null;
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page weekly-report weekly-report--manager">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>参加者の90日集客レポート</h1>
          <p>本人が記録した件数だけを集計し、投稿本文や素材の内容は表示しません。</p>
        </header>
        {participants.length ? (
          <nav className="business-program-report__participants" aria-label="確認する参加者">
            {participants.map((participant) => (
              <Link
                key={participant.userId}
                className={
                  participant.userId === selected?.userId
                    ? 'button button--primary'
                    : 'button button--secondary'
                }
                href={
                  `/s/${service.configuration.slug}/manage/90-day-report?user=${participant.userId}` as Route
                }
              >
                {participant.user.displayName?.trim() || '参加者'}
              </Link>
            ))}
          </nav>
        ) : (
          <section className="settings-card">
            <p>90日プログラムを始めた参加者はまだいません。</p>
          </section>
        )}
        {report ? (
          <>
            <header className="app-page__heading business-program-report__person">
              <p className="eyebrow">{report.displayName?.trim() || '参加者'}</p>
              <h2>{report.businessName}</h2>
            </header>
            {report.latestCycleNumber > 1 ? (
              <nav className="weekly-report__navigation" aria-label="表示する90日間">
                {report.cycleNumber > 1 ? (
                  <Link
                    href={
                      `/s/${service.configuration.slug}/manage/90-day-report?user=${report.userId}&cycle=${report.cycleNumber - 1}` as Route
                    }
                  >
                    ← 前の90日
                  </Link>
                ) : (
                  <span />
                )}
                {report.cycleNumber < report.latestCycleNumber ? (
                  <Link
                    href={
                      `/s/${service.configuration.slug}/manage/90-day-report?user=${report.userId}&cycle=${report.cycleNumber + 1}` as Route
                    }
                  >
                    次の90日 →
                  </Link>
                ) : (
                  <span>現在</span>
                )}
              </nav>
            ) : null}
            <BusinessProgramReportView report={report} />
          </>
        ) : null}
        <Link href={`/s/${service.configuration.slug}/manage` as Route}>← 運営画面へ戻る</Link>
      </main>
    </PublicShell>
  );
}
