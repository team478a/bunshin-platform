import { BUSINESS_GROWTH_PROGRAM_PHASES, businessGrowthProgramStatus } from '@bunshin/application';
import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { localDateInTimezone } from '../../../../src/activity-progress';
import { resolveAuthenticatedMemberServicePage } from '../../../../src/services/member-service-page';
import { memberServiceMetadata } from '../../../../src/services/member-service-metadata';
import { readServiceOnboardingSettings } from '../../../../src/services/service-onboarding-settings';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}): Promise<Metadata> {
  return memberServiceMetadata((await params).serviceSlug, '90日計画');
}

const phaseState = (day: number, phase: (typeof BUSINESS_GROWTH_PROGRAM_PHASES)[number]) =>
  day > phase.endDay ? '完了' : day >= phase.startDay ? '現在地' : 'これから';

export default async function BusinessGrowthRoadmapPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const { actor, service } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/roadmap`,
  );
  const settings = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  );
  if (!settings.businessProfileEnabled) notFound();
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      status: 'ACTIVE',
    },
    select: {
      serviceMemberBusinessProfile: {
        select: { businessName: true, createdAt: true },
      },
    },
  });
  if (!membership?.serviceMemberBusinessProfile) {
    redirect(`/s/${service.configuration.slug}/onboarding` as Route);
  }
  const firstBunshin = await db.prisma.bunshin.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      ownerUserId: actor.userId,
      status: { not: 'ARCHIVED' },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const currentDate = localDateInTimezone(new Date(), 'Asia/Tokyo');
  const program = businessGrowthProgramStatus({
    startedAt: membership.serviceMemberBusinessProfile.createdAt,
    currentDate,
  });
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="service-entry business-roadmap" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">{membership.serviceMemberBusinessProfile.businessName}の計画</p>
          <h1>90日で、続けられる集客の型を作ります</h1>
          <p>今日やることを一つずつ進めます。すべてを一度に覚える必要はありません。</p>
        </header>

        <section className="service-entry__card business-roadmap__current">
          <p className="eyebrow">第{program.cycleNumber}期の現在地</p>
          <h2>{program.day}日目／90日</h2>
          <div
            className="business-roadmap__progress"
            role="progressbar"
            aria-label="90日計画の進み具合"
            aria-valuemin={1}
            aria-valuemax={90}
            aria-valuenow={program.day}
          >
            <span style={{ width: `${program.progressPercent}%` }} />
          </div>
          <strong>{program.phase.title}</strong>
          <p>{program.phase.description}</p>
          <p>この90日は、あと{program.daysRemaining}日です。</p>
        </section>

        <section aria-labelledby="roadmap-phases">
          <h2 id="roadmap-phases">4つの段階</h2>
          <div className="business-roadmap__phases">
            {BUSINESS_GROWTH_PROGRAM_PHASES.map((phase) => {
              const state = phaseState(program.day, phase);
              return (
                <article
                  className={`service-entry__card business-roadmap__phase${state === '現在地' ? ' business-roadmap__phase--current' : ''}`}
                  key={phase.key}
                >
                  <div className="business-roadmap__phase-heading">
                    <span>
                      {phase.startDay}〜{phase.endDay}日目
                    </span>
                    <strong>{state}</strong>
                  </div>
                  <h3>{phase.title}</h3>
                  <p>{phase.description}</p>
                  <ul>
                    {phase.goals.map((goal) => (
                      <li key={goal}>{goal}</li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        <section className="service-entry__card business-roadmap__next">
          <p className="eyebrow">今日すること</p>
          <h2>現在の段階に合う一つの行動を確認します</h2>
          {firstBunshin ? (
            <Link
              className="button button--primary button--full"
              href={`/s/${service.configuration.slug}/bunshins/${firstBunshin.id}` as Route}
            >
              今日やることを見る
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
