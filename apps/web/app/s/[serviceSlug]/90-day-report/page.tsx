import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveAuthenticatedMemberServicePage } from '../../../../src/services/member-service-page';
import { memberServiceMetadata } from '../../../../src/services/member-service-metadata';
import { readServiceOnboardingSettings } from '../../../../src/services/service-onboarding-settings';
import { loadBusinessProgramReport } from '../../../../src/services/business-program-report-data';
import { BusinessProgramReportView } from '../../../ui/business-program-report';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}): Promise<Metadata> {
  return memberServiceMetadata((await params).serviceSlug, '90日集客レポート');
}

export default async function BusinessProgramReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { serviceSlug } = await params;
  const { actor, service } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/90-day-report`,
  );
  const settings = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  );
  if (!settings.businessProfileEnabled) notFound();
  const requestedCycle = Number.parseInt((await searchParams).cycle ?? '', 10);
  const db = await import('@bunshin/database');
  const report = await loadBusinessProgramReport({
    client: db.prisma,
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    userId: actor.userId,
    ...(Number.isFinite(requestedCycle) ? { cycleNumber: requestedCycle } : {}),
  });
  if (!report) notFound();
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="service-entry" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">{report.businessName}</p>
          <h1>90日集客レポート</h1>
          <p>投稿、ポイント、お客様の反応、SNSの変化を一つの画面で確認できます。</p>
        </header>
        {report.latestCycleNumber > 1 ? (
          <nav className="weekly-report__navigation" aria-label="表示する90日間">
            {report.cycleNumber > 1 ? (
              <Link
                href={
                  `/s/${service.configuration.slug}/90-day-report?cycle=${report.cycleNumber - 1}` as Route
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
                  `/s/${service.configuration.slug}/90-day-report?cycle=${report.cycleNumber + 1}` as Route
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
        <Link href={`/s/${service.configuration.slug}/home` as Route}>← サービスホームへ戻る</Link>
      </main>
    </PublicShell>
  );
}
