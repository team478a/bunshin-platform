import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../src/auth/current-user';
import { RegistrationWizard } from './registration-wizard';

export const dynamic = 'force-dynamic';

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
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
  const { returnTo } = await searchParams;
  return (
    <RegistrationWizard
      industries={industries}
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
      returnTo={returnTo ?? null}
    />
  );
}
