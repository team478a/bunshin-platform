import type { CSSProperties } from 'react';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { isRouteNotFound } from '../../../../src/navigation/route-not-found';
import { resolveMemberServiceContext } from '../../../../src/services/public-service';
import { readServiceOnboardingSettings } from '../../../../src/services/service-onboarding-settings';
import {
  answersForCurrentQuestions,
  nextOnboardingRefinement,
  readServiceOnboardingAnswers,
} from '../../../../src/services/service-onboarding-response';
import { PublicShell } from '../../../ui/public-shell';
import { ServiceOnboardingForm } from './service-onboarding-form';

export const dynamic = 'force-dynamic';

async function context(slug: string, actorUserId: string) {
  try {
    return await resolveMemberServiceContext(slug, actorUserId);
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }
}

export default async function ServiceOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ refine?: string; edit?: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  const returnTo = `/s/${serviceSlug}/onboarding`;
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);
  const service = await context(serviceSlug, actor.userId);
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      status: 'ACTIVE',
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: {
      id: true,
      serviceOnboardingResponse: {
        select: { id: true, answers: true },
      },
      serviceMemberBusinessProfile: {
        select: {
          primaryIndustryId: true,
          otherIndustryText: true,
          businessName: true,
          region: true,
          productService: true,
          primaryPurpose: true,
          targetAudience: true,
          websiteUrl: true,
          businessFeatures: true,
          priceInformation: true,
          preferredTone: true,
          requiredContent: true,
          forbiddenContent: true,
        },
      },
    },
  });
  if (!membership) redirect(`/s/${serviceSlug}` as Route);
  const settings = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  );
  const onboardingComplete =
    (settings.questions.length === 0 || Boolean(membership.serviceOnboardingResponse)) &&
    (!settings.businessProfileEnabled ||
      Boolean(
        membership.serviceMemberBusinessProfile?.businessFeatures &&
        membership.serviceMemberBusinessProfile.preferredTone,
      ));
  const editing =
    ['1', 'true'].includes((await searchParams).refine ?? '') ||
    ['1', 'true'].includes((await searchParams).edit ?? '');
  if (onboardingComplete && !editing) {
    redirect(`/s/${serviceSlug}/home` as Route);
  }
  const storedAnswers = readServiceOnboardingAnswers(membership.serviceOnboardingResponse?.answers);
  const initialAnswers = answersForCurrentQuestions(settings.questions, storedAnswers).map(
    (answer) => (editing && !answer ? 'まだ回答していません' : answer),
  );
  const refinement = editing ? nextOnboardingRefinement(settings.questions, storedAnswers) : null;
  const industries = settings.businessProfileEnabled
    ? await db.prisma.industry.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, key: true, name: true },
      })
    : [];
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">
            {editing ? 'あなた向けの内容をもっと正確に' : '最初のかんたん設定'}
          </p>
          <h1>
            {editing
              ? '今日は1つだけ教えてください'
              : settings.welcomeTitle || 'あなたのことを少し教えてください'}
          </h1>
          <p>
            {editing
              ? '回答は、次回以降の投稿案づくりに反映します。'
              : settings.welcomeMessage || 'あなたに合った内容を届けるための質問です。'}
          </p>
        </header>
        <section className="service-entry__card">
          <ServiceOnboardingForm
            serviceSlug={serviceSlug}
            questions={settings.questions}
            initialAnswers={initialAnswers}
            focusQuestionIndex={editing ? (refinement?.index ?? null) : null}
            editMode={editing}
            businessProfileEnabled={settings.businessProfileEnabled}
            businessProfileInputMode={settings.businessProfileInputMode}
            industries={industries}
            initialBusinessProfile={membership.serviceMemberBusinessProfile}
          />
        </section>
      </article>
    </PublicShell>
  );
}
