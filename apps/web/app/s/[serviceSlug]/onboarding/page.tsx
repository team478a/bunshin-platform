import type { CSSProperties } from 'react';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';
import { readServiceOnboardingSettings } from '../../../../src/services/service-onboarding-settings';
import { PublicShell } from '../../../ui/public-shell';
import { ServiceOnboardingForm } from './service-onboarding-form';

export const dynamic = 'force-dynamic';

export default async function ServiceOnboardingPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const service = await resolvePublicServiceContext(serviceSlug).catch(() => null);
  if (!service) notFound();
  const actor = await (await currentUserProvider()).getCurrentUser();
  const returnTo = `/s/${serviceSlug}/onboarding`;
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      status: 'ACTIVE',
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { id: true, serviceOnboardingResponse: { select: { id: true } } },
  });
  if (!membership) redirect(`/s/${serviceSlug}` as Route);
  const settings = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  );
  if (settings.questions.length === 0 || membership.serviceOnboardingResponse) {
    redirect(`/s/${serviceSlug}/home` as Route);
  }
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">最初のかんたん設定</p>
          <h1>{settings.welcomeTitle || 'あなたのことを少し教えてください'}</h1>
          <p>{settings.welcomeMessage || 'あなたに合った内容を届けるための質問です。'}</p>
        </header>
        <section className="service-entry__card">
          <ServiceOnboardingForm serviceSlug={serviceSlug} questions={settings.questions} />
        </section>
      </article>
    </PublicShell>
  );
}
