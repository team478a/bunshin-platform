import { ListServiceBunshins, businessGrowthProgramStatus } from '@bunshin/application';
import { GetMissionProgress } from '@bunshin/capability-social';
import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { isRouteNotFound } from '../../../../src/navigation/route-not-found';
import { currentActivityContinuityRule } from '../../../../src/activity-continuity-rule';
import { localDateInTimezone, weekRange, weeklyCalendar } from '../../../../src/activity-progress';
import {
  resolveMemberServiceContext,
  resolvePublicServiceContext,
} from '../../../../src/services/public-service';
import {
  isServiceAnnouncementVisible,
  readServiceAnnouncement,
  readServiceOnboardingSettings,
} from '../../../../src/services/service-onboarding-settings';
import { isPromptOnlyImageService } from '../../../../src/services/service-image-policy';
import {
  nextOnboardingRefinement,
  readServiceOnboardingAnswers,
} from '../../../../src/services/service-onboarding-response';
import { PublicShell } from '../../../ui/public-shell';
import {
  BusinessRoadmapSummary,
  ProfileRefinementSection,
  ServiceAnnouncementSection,
  ServiceHomeHeader,
  WeeklyActivitySection,
} from './service-home-overview-sections';
import {
  ContentEditorLinks,
  MemberFeatureLinks,
  ServiceHomeFooter,
  ServiceOperatorLinks,
} from './service-home-navigation-sections';

export const dynamic = 'force-dynamic';

async function context(slug: string, actorUserId: string) {
  try {
    return await resolveMemberServiceContext(slug, actorUserId);
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}): Promise<Metadata> {
  const { serviceSlug } = await params;
  const service = await resolvePublicServiceContext(serviceSlug).catch(() => null);
  return { title: service ? `${service.configuration.displayName}｜ホーム` : 'サービスホーム' };
}

export default async function ServiceMemberHome({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  const returnTo = `/s/${serviceSlug}/home` as Route;
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
      role: true,
      serviceRole: true,
      user: { select: { displayName: true } },
      serviceOnboardingResponse: { select: { id: true, answers: true } },
      serviceMemberBusinessProfile: { select: { id: true, createdAt: true } },
      featureAssignments: {
        where: { status: 'ENABLED' },
        select: { featureKey: true, startsAt: true, endsAt: true },
      },
      group: {
        select: {
          name: true,
          featurePolicies: {
            where: { status: 'ENABLED' },
            select: { featureKey: true, startsAt: true, endsAt: true },
          },
        },
      },
    },
  });
  if (!membership) redirect(`/s/${service.configuration.slug}` as Route);
  const onboarding = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  );
  const isBusinessDailyService = onboarding.businessProfileEnabled;
  const promptOnlyImages = isPromptOnlyImageService(service.configuration.slug);
  const announcement = readServiceAnnouncement(service.configuration.registration.onboardingConfig);
  const onboardingRefinement = nextOnboardingRefinement(
    onboarding.questions,
    readServiceOnboardingAnswers(membership.serviceOnboardingResponse?.answers),
  );
  if (
    (onboarding.questions.length > 0 && !membership.serviceOnboardingResponse) ||
    (onboarding.businessProfileEnabled && !membership.serviceMemberBusinessProfile)
  ) {
    redirect(`/s/${service.configuration.slug}/onboarding` as Route);
  }

  const now = new Date();
  const active = (value: { startsAt: Date | null; endsAt: Date | null }) =>
    (!value.startsAt || value.startsAt <= now) && (!value.endsAt || value.endsAt > now);
  const available = (featureKey: string) =>
    membership.group.featurePolicies.some(
      (item) => item.featureKey === featureKey && active(item),
    ) &&
    membership.featureAssignments.some((item) => item.featureKey === featureKey && active(item));
  const imageAvailable =
    !isBusinessDailyService && !promptOnlyImages && available('SOCIAL.IMAGE_GENERATION');
  const videoAvailable = !isBusinessDailyService && available('VIDEO_GENERATION');
  const rewardsPilotAccess = isBusinessDailyService
    ? null
    : await db.getActiveRewardsPilotAccess(db.prisma, {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: actor.userId,
      });
  const trackingLinkAvailable =
    !isBusinessDailyService &&
    (await db.prisma.externalTrackingSystem.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'ACTIVE',
        allowedDomains: { some: { status: 'ACTIVE' } },
      },
    })) > 0;
  const bunshins = await new ListServiceBunshins(new db.PrismaBunshinRepository()).execute({
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
  });
  const localDate = localDateInTimezone(now, 'Asia/Tokyo');
  const businessProgram =
    isBusinessDailyService && membership.serviceMemberBusinessProfile
      ? businessGrowthProgramStatus({
          startedAt: membership.serviceMemberBusinessProfile.createdAt,
          currentDate: localDate,
        })
      : null;
  const currentWeek = weekRange(localDate);
  const activityRule = await currentActivityContinuityRule();
  const assignmentRepository = new db.PrismaBunshinCapabilityAssignmentRepository();
  const engagementRepository = new db.PrismaMissionEngagementRepository();
  const activities = (
    await Promise.all(
      bunshins.map(async (bunshin) => {
        const assignment = await assignmentRepository.find({
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          actorUserId: actor.userId,
          bunshinId: bunshin.id,
          capabilityType: 'SOCIAL',
        });
        if (assignment?.status !== 'ACTIVE') return null;
        const progress = await new GetMissionProgress(
          assignmentRepository,
          engagementRepository,
        ).execute({
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          actorUserId: actor.userId,
          bunshinId: bunshin.id,
          ...currentWeek,
          weeklyGoal: activityRule.weeklyGoal,
        });
        return { bunshin, progress, calendar: weeklyCalendar(progress) };
      }),
    )
  ).filter((value): value is NonNullable<typeof value> => value !== null);
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;
  const isServiceOperator = ['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(membership.serviceRole);
  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry service-member-home" style={style}>
        <ServiceHomeHeader
          displayName={service.configuration.displayName}
          logoUrl={service.configuration.brand.logoUrl}
          memberName={membership.user.displayName}
        />
        {isServiceAnnouncementVisible(announcement, now) && (
          <ServiceAnnouncementSection message={announcement.message} title={announcement.title} />
        )}
        {onboardingRefinement && (
          <ProfileRefinementSection
            question={onboardingRefinement.question}
            serviceSlug={service.configuration.slug}
          />
        )}
        {businessProgram && (
          <BusinessRoadmapSummary
            program={businessProgram}
            serviceSlug={service.configuration.slug}
          />
        )}
        <WeeklyActivitySection
          activities={activities}
          bunshinCount={bunshins.length}
          isBusinessDailyService={isBusinessDailyService}
          serviceSlug={service.configuration.slug}
        />
        <MemberFeatureLinks
          imageAvailable={imageAvailable}
          isBusinessDailyService={isBusinessDailyService}
          isServiceOperator={isServiceOperator}
          promptOnlyImages={promptOnlyImages}
          rewardsAvailable={Boolean(rewardsPilotAccess)}
          serviceSlug={service.configuration.slug}
          trackingLinkAvailable={trackingLinkAvailable}
          videoAvailable={videoAvailable}
        />
        {isServiceOperator && (
          <ServiceOperatorLinks
            isBusinessDailyService={isBusinessDailyService}
            serviceSlug={service.configuration.slug}
          />
        )}
        {membership.serviceRole === 'CONTENT_EDITOR' && (
          <ContentEditorLinks
            isBusinessDailyService={isBusinessDailyService}
            serviceSlug={service.configuration.slug}
          />
        )}
        <ServiceHomeFooter
          contactEmail={service.configuration.contactEmail}
          operatorName={service.configuration.operatorName}
          poweredByEnabled={service.configuration.poweredByEnabled}
          serviceSlug={service.configuration.slug}
        />
      </article>
    </PublicShell>
  );
}
