import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../src/auth/current-user';
import { RegistrationWizard } from './registration-wizard';
import type { Route } from 'next';
import { safeLineAuthReturnPath, serviceAuthReturnSlug } from '../../src/auth/line-return';
import { DEFAULT_SERVICE_PROFILE_QUESTIONS } from '../../src/services/service-onboarding-settings';

export const dynamic = 'force-dynamic';

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  const { returnTo: requestedReturnTo } = await searchParams;
  const returnTo = safeLineAuthReturnPath(requestedReturnTo);
  if (serviceAuthReturnSlug(returnTo)) {
    if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo!)}` as Route);
    redirect(returnTo as Route);
  }
  if (!actor) redirect('/login?returnTo=/onboarding');
  const db = await import('@bunshin/database');
  const [profile, industries] = await Promise.all([
    db.prisma.userRegistrationProfile.findUnique({ where: { userId: actor.userId } }),
    db.prisma.industry.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, key: true, name: true, description: true },
    }),
  ]);
  if (profile?.status === 'COMPLETED') redirect('/bunshins');
  return (
    <RegistrationWizard
      industries={industries}
      profileQuestions={DEFAULT_SERVICE_PROFILE_QUESTIONS}
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
