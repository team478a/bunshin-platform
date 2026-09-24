import {
  GetBunshin,
  ListBunshinCapabilityAssignments,
  ListPointRewardCatalog,
  businessGrowthActionForMission,
  businessGrowthProgramStatus,
} from '@bunshin/application';
import {
  ListContentPillars,
  ListDailyMissions,
  ListMissionContentVariants,
  AuthorizeDailyMissionCopy,
  GetMissionDecision,
  ListMissionActivities,
  ListSocialAccountStrategies,
  ListSocialProfiles,
  ListWeeklyPlans,
  type SocialProfile,
} from '@bunshin/capability-social';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { isRouteNotFound } from '../../../../../src/navigation/route-not-found';
import { resolveAuthenticatedMemberServicePage } from '../../../../../src/services/member-service-page';
import { readServiceOnboardingSettings } from '../../../../../src/services/service-onboarding-settings';
import { isPromptOnlyImageService } from '../../../../../src/services/service-image-policy';
import type { DailyMissionView } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import type { DailyActionView } from './daily-action-section';
import { buildBusinessResponseInsight } from './business-response-insights';
import { dailyVideoProjectId } from '../../../../../src/services/automatic-daily-video';
import { localDateInTimezone } from '../../../../../src/activity-progress';
import { resolveDeliveryScheduleStatus } from '../../../../../src/services/delivery-schedule-status';
import { currentLineEnvironment } from '../../../../../src/line/secure-configuration';
import { missionDecisionOrPending } from '../../../../../src/mission-decision-fallback';
import { readBusinessOutcomes } from '../../../../../src/services/business-outcomes';
import {
  readPostPerformance,
  type PostPerformanceView,
} from '../../../../../src/services/post-performance';
import { recordCommercialUsageSafely } from '../../../../../src/services/commercial-usage';
import {
  applyServiceContentTerminology,
  serviceContentTerminologyPolicy,
} from '../../../../../src/services/service-content-terminology';

export async function loadServiceBunshinDetail({
  serviceSlug,
  bunshinId,
  lineResult,
}: {
  serviceSlug: string;
  bunshinId: string;
  lineResult?: string | undefined;
}) {
  const { actor, service } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/bunshins/${bunshinId}`,
  );
  const onboarding = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  );
  const isBusinessDailyService = onboarding.businessProfileEnabled;
  const db = await import('@bunshin/database');
  let bunshin;
  let capabilities;
  let socialProfiles: SocialProfile[];
  let contentPillars;
  let accountStrategies;
  let weeklyPlans;
  let dailyMissions: DailyMissionView[];
  let variantPointCost: number | null = null;
  let rewardsPilotActive = false;
  let businessProgramStartedAt: Date | null = null;
  let postPerformances: PostPerformanceView[] = [];
  const videos: Record<string, { href: string; status: string }> = {};
  try {
    const scope = {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      bunshinId,
      actorUserId: actor.userId,
    };
    const businessProgramProfile = isBusinessDailyService
      ? await db.prisma.serviceMemberBusinessProfile.findFirst({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            userId: actor.userId,
            groupMembership: { status: 'ACTIVE' },
          },
          select: { createdAt: true },
        })
      : null;
    businessProgramStartedAt = businessProgramProfile?.createdAt ?? null;
    bunshin = await new GetBunshin(new db.PrismaBunshinRepository()).execute(scope);
    capabilities = await new ListBunshinCapabilityAssignments(
      new db.PrismaBunshinCapabilityAssignmentRepository(),
    ).execute(scope);
    socialProfiles = await new ListSocialProfiles(new db.PrismaSocialProfileRepository()).execute(
      scope,
    );
    contentPillars = await new ListContentPillars(new db.PrismaContentPillarRepository()).execute(
      scope,
    );
    const strategyRepository = new db.PrismaSocialAccountStrategyRepository();
    accountStrategies = (
      await Promise.all(
        socialProfiles.map((profile) =>
          new ListSocialAccountStrategies(strategyRepository).execute({
            ...scope,
            socialProfileId: profile.id,
          }),
        ),
      )
    ).flat();
    weeklyPlans = await new ListWeeklyPlans(new db.PrismaWeeklyPlanRepository()).execute(scope);
    if (weeklyPlans.length > 0) {
      const viewedOn = localDateInTimezone(new Date(), 'Asia/Tokyo');
      await recordCommercialUsageSafely({
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: actor.userId,
        eventType: 'WEEKLY_PLAN_VIEW',
        source: 'service_member_home',
        idempotencyKey: `WEEKLY_PLAN_VIEW:${actor.userId}:${viewedOn}`,
        metadata: { bunshinId },
      });
    }
    const missionRepository = new db.PrismaDailyMissionRepository();
    const missionRecords = await new ListDailyMissions(missionRepository).execute(scope);
    const contentTerminologyPolicy = serviceContentTerminologyPolicy(service.configuration.slug);
    const engagementRepository = new db.PrismaMissionEngagementRepository();
    const videoProjects = isBusinessDailyService
      ? []
      : await db.prisma.videoProject.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            ownerUserId: actor.userId,
            bunshinId,
            id: {
              in: missionRecords.map((mission) =>
                dailyVideoProjectId(service.workspaceId, bunshinId, mission.id),
              ),
            },
          },
          select: { id: true, status: true },
        });
    for (const mission of missionRecords) {
      const video = videoProjects.find(
        (item) => item.id === dailyVideoProjectId(service.workspaceId, bunshinId, mission.id),
      );
      if (video)
        videos[mission.id] = { href: `/s/${serviceSlug}/videos/${video.id}`, status: video.status };
    }
    const outcomeRepository = new db.PrismaMissionOutcomeRepository();
    const missionStates = await Promise.all(
      missionRecords.map(async (mission) => ({
        decision: await missionDecisionOrPending(() =>
          new GetMissionDecision(engagementRepository).execute({
            ...scope,
            dailyMissionId: mission.id,
          }),
        ),
        post: await outcomeRepository.getPost({ ...scope, dailyMissionId: mission.id }),
        feedback: await outcomeRepository.getFeedback({ ...scope, dailyMissionId: mission.id }),
        activities: await new ListMissionActivities(engagementRepository).execute({
          ...scope,
          dailyMissionId: mission.id,
        }),
        copyAuthorization: await new AuthorizeDailyMissionCopy(missionRepository).execute({
          ...scope,
          dailyMissionId: mission.id,
        }),
      })),
    );
    postPerformances = missionRecords.flatMap((mission, index) => {
      const post = missionStates[index]?.post;
      const performance = readPostPerformance(post?.manualMetrics);
      return post && performance
        ? [
            {
              dailyMissionId: mission.id,
              topic: applyServiceContentTerminology(mission.topic, contentTerminologyPolicy),
              postedAt: post.postedAt.toISOString(),
              ...performance,
            },
          ]
        : [];
    });
    const missionVariants = await Promise.all(
      missionRecords.map((mission) =>
        new ListMissionContentVariants(new db.PrismaMissionContentVariantRepository()).execute({
          ...scope,
          dailyMissionId: mission.id,
        }),
      ),
    );
    variantPointCost = isBusinessDailyService
      ? null
      : await new ListPointRewardCatalog(new db.PrismaPointRedemptionRepository())
          .execute({
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            actorUserId: actor.userId,
          })
          .then(
            (catalog) =>
              catalog.find(({ rewardType }) => rewardType === 'ALTERNATIVE_PLAN_GENERATION')
                ?.pointCost ?? null,
          )
          .catch(() => null);
    rewardsPilotActive =
      !isBusinessDailyService &&
      Boolean(
        await db
          .getActiveRewardsPilotAccess(db.prisma, {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            userId: actor.userId,
          })
          .catch(() => null),
      );
    dailyMissions = missionRecords.map((mission, index) => ({
      id: mission.id,
      missionDate: mission.missionDate,
      status: mission.status,
      format: mission.format,
      assistanceLevel: mission.assistanceLevel,
      estimatedMinutes: mission.estimatedMinutes,
      topic: applyServiceContentTerminology(mission.topic, contentTerminologyPolicy),
      angle: applyServiceContentTerminology(mission.angle, contentTerminologyPolicy),
      reason: applyServiceContentTerminology(mission.reason, contentTerminologyPolicy),
      campaignId: mission.campaignId,
      classification: mission.classification,
      qualityScore: mission.qualityScore,
      content: applyServiceContentTerminology(mission.content, contentTerminologyPolicy),
      decision: missionStates[index]!.decision.decision,
      rejectionReason: missionStates[index]!.decision.rejectionReason,
      platform: socialProfiles.find(({ id }) => id === mission.socialProfileId)?.platform ?? null,
      postedAt: missionStates[index]!.post?.postedAt.toISOString() ?? null,
      feedback: missionStates[index]!.feedback?.rating ?? null,
      executionResult: ([...missionStates[index]!.activities]
        .reverse()
        .find(({ type }) =>
          [
            'EXECUTION_COMPLETED',
            'EXECUTION_PARTIAL',
            'EXECUTION_NOT_COMPLETED',
            'EXECUTION_HELP_NEEDED',
          ].includes(type),
        )?.type ?? (missionStates[index]!.post ? 'EXECUTION_COMPLETED' : null)) as Exclude<
        DailyMissionView['executionResult'],
        undefined
      >,
      ...(isBusinessDailyService
        ? {
            businessAction: businessGrowthActionForMission({
              missionDate: mission.missionDate,
              topic: applyServiceContentTerminology(mission.topic, contentTerminologyPolicy),
              ...(businessProgramProfile
                ? { programStartedAt: businessProgramProfile.createdAt }
                : {}),
            }),
          }
        : {}),
      ...(isBusinessDailyService
        ? { businessOutcomes: readBusinessOutcomes(missionStates[index]!.post?.manualMetrics) }
        : {}),
      copyAuthorization: missionStates[index]!.copyAuthorization,
      trendContext: mission.trendContext
        ? {
            whyNow: mission.trendContext.snapshot.candidate.whyNow,
            fitReason: mission.trendContext.snapshot.candidate.fitReason,
          }
        : null,
      externalLinkUsage:
        !isBusinessDailyService && mission.linkUsage
          ? {
              linkName: mission.linkUsage.linkName,
              insertedUrl: mission.linkUsage.insertedUrl,
              expiresAt: mission.linkUsage.expiresAt?.toISOString() ?? null,
              productName: mission.linkUsage.productName,
              campaignName: mission.linkUsage.campaignName,
              advertisingClassification: mission.linkUsage.advertisingClassification,
            }
          : null,
      variants: isBusinessDailyService
        ? []
        : missionVariants[index]!.map(({ id, sequence, content, qualityScore, selectedAt }) => ({
            id,
            sequence,
            content: applyServiceContentTerminology(content, contentTerminologyPolicy),
            qualityScore,
            selectedAt: selectedAt?.toISOString() ?? null,
          })),
    }));
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;
  const notification = await new db.PrismaLineNotificationPreferenceRepository().getScoped({
    workspaceId: service.workspaceId,
    bunshinId,
    actorUserId: actor.userId,
  });
  const deliveryEnabled = Boolean(
    notification.preference?.enabled && notification.preference.notificationConsentAt,
  );
  const deliveryPolicy = onboarding.dailyIdeaDelivery;
  const deliveryTime = notification.preference?.localTime ?? deliveryPolicy.defaultNotificationTime;
  const deliveryTimezone = notification.preference?.timezone ?? 'Asia/Tokyo';
  const today = localDateInTimezone(new Date(), deliveryTimezone);
  const deliverySchedule = resolveDeliveryScheduleStatus({
    today,
    scheduledDates: weeklyPlans
      .filter(({ status }) => status === 'CONFIRMED')
      .flatMap(({ items }) => items.map(({ scheduledDate }) => scheduledDate)),
    missionDates: dailyMissions.map(({ missionDate }) => missionDate),
  });
  const generationProfile = socialProfiles.find(({ status }) => status === 'ACTIVE');
  const promptOnlyImages = isPromptOnlyImageService(service.configuration.slug);
  const imageMembership =
    isBusinessDailyService || promptOnlyImages
      ? null
      : await db.prisma.groupMembership.findFirst({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            userId: actor.userId,
            status: 'ACTIVE',
            consentedAt: { not: null },
            group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
          },
          select: {
            featureAssignments: {
              where: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' },
              select: { startsAt: true, endsAt: true },
            },
            group: {
              select: {
                featurePolicies: {
                  where: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' },
                  select: { startsAt: true, endsAt: true },
                },
              },
            },
          },
        });
  const entitlementNow = new Date();
  const isCurrent = (value: { startsAt: Date | null; endsAt: Date | null }) =>
    (!value.startsAt || value.startsAt <= entitlementNow) &&
    (!value.endsAt || value.endsAt > entitlementNow);
  const imageCreationAvailable = Boolean(
    !promptOnlyImages &&
    imageMembership?.featureAssignments.some(isCurrent) &&
    imageMembership.group.featurePolicies.some(isCurrent),
  );
  const approvedBusinessStrategy = isBusinessDailyService
    ? accountStrategies
        .filter(({ status }) => status === 'APPROVED')
        .sort((left, right) => right.version - left.version)[0]
    : undefined;

  const dedicatedLine = await db.prisma.groupLineChannelConfiguration.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      environment: currentLineEnvironment(),
      status: 'ACTIVE',
      lastVerifiedAt: { not: null },
      lastErrorCategory: null,
      group: {
        lineRoutingPolicies: {
          some: { environment: currentLineEnvironment(), mode: 'DEDICATED', pilotEnabled: true },
        },
      },
    },
    select: { id: true },
  });
  const dedicatedLineConnection = dedicatedLine
    ? await db.prisma.groupLineConnection.findFirst({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          configurationId: dedicatedLine.id,
          userId: actor.userId,
          status: 'ACTIVE',
          friendshipStatus: 'FOLLOWING',
          notificationConsentAt: { not: null },
          groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
        },
        select: { id: true },
      })
    : null;
  const dailyActions: DailyActionView[] = (
    await db.prisma.bunshinMemory.findMany({
      where: {
        workspaceId: service.workspaceId,
        bunshinId,
        bunshin: { ownerUserId: actor.userId, groupId: service.serviceId },
        sourceType: 'USER_INPUT',
        sourceId: { startsWith: 'daily-action:' },
        active: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
  ).flatMap((memory) => {
    const type = memory.sourceId?.split(':')[1];
    const labels: Record<string, string> = {
      PHOTO: '今日撮った写真',
      CUSTOMER_QUESTION: 'お客様から聞かれた質問',
      VOICE_MEMO: '30秒メモ',
      COMMENT_REPLY: 'コメントへの返信',
      POST_IMPROVEMENT: '過去投稿の改善案',
      REST_REASON: '今日は投稿しない理由',
    };
    if (!type || !labels[type]) return [];
    return [
      {
        id: memory.id,
        type: type as DailyActionView['type'],
        text: memory.content,
        label: labels[type],
        hasPhoto: memory.attachmentStatus === 'READY',
        attachmentStatus: memory.attachmentStatus,
        useForAutomaticImages: memory.automaticImageReference,
        createdAt: memory.createdAt.toISOString(),
      },
    ];
  });
  const socialInsightSnapshots = isBusinessDailyService
    ? await db.prisma.socialInsightSnapshot.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          userId: actor.userId,
          bunshinId,
        },
        orderBy: [{ observedOn: 'desc' }, { updatedAt: 'desc' }],
        take: 12,
      })
    : [];
  const successfulBusinessTopic = isBusinessDailyService
    ? buildBusinessResponseInsight(dailyMissions).bestTopic
    : null;
  const businessProgram = businessProgramStartedAt
    ? businessGrowthProgramStatus({ startedAt: businessProgramStartedAt, currentDate: today })
    : null;
  return {
    actor,
    service,
    lineResult,
    bunshin,
    capabilities,
    socialProfiles,
    contentPillars,
    accountStrategies,
    weeklyPlans,
    dailyMissions,
    variantPointCost,
    rewardsPilotActive,
    postPerformances,
    videos,
    style,
    deliveryEnabled,
    deliveryPolicy,
    deliveryTime,
    deliveryTimezone,
    today,
    deliverySchedule,
    generationProfile,
    imageCreationAvailable,
    dedicatedLine,
    dedicatedLineConnection,
    dailyActions,
    socialInsightSnapshots,
    successfulBusinessTopic,
    businessProgram,
    isBusinessDailyService,
    approvedBusinessStrategy,
  };
}

export type ServiceBunshinDetailModel = Awaited<ReturnType<typeof loadServiceBunshinDetail>>;
