import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../src/auth/current-user';
import { RegistrationWizard } from './registration-wizard';
import { safeLineAuthReturnPath } from '../../src/auth/line-return';
import {
  DEFAULT_SERVICE_PROFILE_QUESTIONS,
  readServiceOnboardingSettings,
} from '../../src/services/service-onboarding-settings';

export const dynamic = 'force-dynamic';

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login?returnTo=/onboarding');
  const { returnTo: requestedReturnTo } = await searchParams;
  const returnTo = safeLineAuthReturnPath(requestedReturnTo);
  const serviceSlug = returnTo?.match(/^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)/)?.[1] ?? null;
  const db = await import('@bunshin/database');
  const [profile, industries, serviceConfiguration] = await Promise.all([
    db.prisma.userRegistrationProfile.findUnique({ where: { userId: actor.userId } }),
    db.prisma.industry.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, key: true, name: true, description: true },
    }),
    serviceSlug
      ? db.prisma.serviceConfiguration.findFirst({
          where: { slug: serviceSlug, visibility: 'PUBLIC', group: { status: 'ACTIVE' } },
          select: { registration: { select: { onboardingConfig: true, surveyConfig: true } } },
        })
      : null,
  ]);
  if (profile?.status === 'COMPLETED') redirect('/bunshins');
  const profileQuestions = serviceConfiguration?.registration
    ? readServiceOnboardingSettings(
        serviceConfiguration.registration.onboardingConfig,
        serviceConfiguration.registration.surveyConfig,
      ).profileQuestions
    : DEFAULT_SERVICE_PROFILE_QUESTIONS;
  return (
    <RegistrationWizard
      industries={industries}
      profileQuestions={profileQuestions}
      initial={
        profile
          ? {
              currentStep: profile.currentStep,
              primaryIndustryId: profile.primaryIndustryId,
              otherIndustryText: profile.otherIndustryText,
              primaryPurpose: profile.primaryPurpose,
              activityName: profile.activityName,
              businessName: profile.businessName,
              region: profile.region,
              productService: profile.productService,
              socialProfiles: profile.socialProfiles,
            }
          : null
      }
      returnTo={returnTo}
    />
  );
}
