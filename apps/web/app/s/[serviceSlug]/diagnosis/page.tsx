import { diagnoseBusinessSnsReadiness } from '@bunshin/application';
import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
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
  return memberServiceMetadata((await params).serviceSlug, 'SNS集客診断');
}

const platformLabels: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  X: 'X',
  THREADS: 'Threads',
  YOUTUBE_SHORTS: 'YouTubeショート',
  OTHER: 'その他のSNS',
};

export default async function BusinessSnsDiagnosisPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const { actor, service } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/diagnosis`,
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
        select: {
          businessName: true,
          productService: true,
          targetAudience: true,
          businessFeatures: true,
        },
      },
    },
  });
  const profile = membership?.serviceMemberBusinessProfile;
  if (!profile) redirect(`/s/${service.configuration.slug}/onboarding` as Route);

  const bunshin = await db.prisma.bunshin.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      ownerUserId: actor.userId,
      status: { not: 'ARCHIVED' },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      socialProfiles: {
        where: { status: 'ACTIVE' },
        select: {
          platform: true,
          accountStrategies: {
            where: { status: 'APPROVED' },
            select: { destinationType: true },
          },
        },
      },
      lineNotificationPreferences: {
        where: { userId: actor.userId, enabled: true },
        select: { id: true },
      },
    },
  });
  const diagnosis = diagnoseBusinessSnsReadiness({
    productService: profile.productService,
    targetAudience: profile.targetAudience,
    businessFeatures: profile.businessFeatures,
    activeSocialProfileCount: bunshin?.socialProfiles.length ?? 0,
    hasApprovedDestination:
      bunshin?.socialProfiles.some((social) =>
        social.accountStrategies.some(({ destinationType }) => destinationType !== 'NONE'),
      ) ?? false,
    automaticDeliveryEnabled: Boolean(bunshin?.lineNotificationPreferences.length),
  });
  const setupHref = bunshin
    ? (`/s/${service.configuration.slug}/bunshins/${bunshin.id}?setup=1` as Route)
    : (`/s/${service.configuration.slug}/bunshins/new` as Route);
  const nextHref =
    diagnosis.nextAction.itemKey === null && bunshin
      ? (`/s/${service.configuration.slug}/bunshins/${bunshin.id}#today-post` as Route)
      : setupHref;
  const selectedPlatform = bunshin?.socialProfiles[0]?.platform;
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="service-entry business-diagnosis" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">{profile.businessName}の現在地</p>
          <h1>SNS集客の準備を確認しました</h1>
          <p>むずかしい分析はありません。できていることと、次にすることを確認できます。</p>
        </header>

        <section className="service-entry__card business-diagnosis__result">
          <p className="eyebrow">診断結果</p>
          <div className="business-diagnosis__score" aria-label={`準備度${diagnosis.score}点`}>
            <strong>{diagnosis.score}</strong>
            <span>点／100点</span>
          </div>
          <h2>{diagnosis.headline}</h2>
          <p>{diagnosis.summary}</p>
          {selectedPlatform ? (
            <p className="business-diagnosis__platform">
              使うSNS：{platformLabels[selectedPlatform] ?? selectedPlatform}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="diagnosis-details">
          <h2 id="diagnosis-details">5つの確認</h2>
          <ol className="business-diagnosis__items">
            {diagnosis.items.map((item) => (
              <li
                className={`service-entry__card business-diagnosis__item business-diagnosis__item--${item.status.toLowerCase()}`}
                key={item.key}
              >
                <span aria-hidden="true">{item.status === 'READY' ? '✓' : '→'}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="service-entry__card business-diagnosis__next">
          <p className="eyebrow">次にすることは一つです</p>
          <h2>{diagnosis.nextAction.title}</h2>
          <p>{diagnosis.nextAction.description}</p>
          <Link className="button button--primary button--full" href={nextHref}>
            {diagnosis.nextAction.itemKey === null ? '今日やることを見る' : 'この準備を進める'}
          </Link>
        </section>

        <Link href={`/s/${service.configuration.slug}/home` as Route}>← サービスホームへ戻る</Link>
      </main>
    </PublicShell>
  );
}
