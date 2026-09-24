import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../src/services/public-service';
import { buildServiceLaunchReadiness } from '../../../../src/services/service-launch-readiness';
import { readServiceOnboardingSettings } from '../../../../src/services/service-onboarding-settings';
import { isFortuneServicePackage } from '../../../../src/services/service-creation-templates';
import { isPromptOnlyImageService } from '../../../../src/services/service-image-policy';
import { selectServiceManagementSections } from '../../../../src/services/service-management-navigation';
import { buildSideHustleContentFunnel } from '../../../../src/services/side-hustle-content-funnel';
import { buildPerformanceFeedbackSummary } from '../../../../src/services/performance-feedback-summary';
import { buildBusinessPilotMetrics } from '../../../../src/services/business-pilot-metrics';
import { sumBusinessOutcomes } from '../../../../src/services/business-outcomes';
import {
  buildServiceOperationActions,
  serviceManagementSections,
} from './service-management-view-model';
import {
  readServiceBusinessActivity,
  readServiceManagementHomeRecords,
} from './service-management-home-repository';

export async function loadServiceManagementHome(serviceSlug: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const configuration = service.configuration;
  const onboarding = readServiceOnboardingSettings(
    configuration.registration.onboardingConfig,
    configuration.registration.surveyConfig,
  );
  const isBusinessDailyService = onboarding.businessProfileEnabled;
  const records = await readServiceManagementHomeRecords({
    workspaceId: service.workspaceId,
    serviceId: service.serviceId,
  });
  if (!records) notFound();
  const {
    group,
    line,
    linePolicy,
    now,
    sevenDaysAgo,
    activeProductPackCount,
    activeCampaignCount,
    activeTrackingLinkCount,
    trendProviderReadyCount,
    productMissions,
    linkedProductMissions,
    copiedProductMissions,
    postedProductMissions,
    recentPostedForFeedback,
    recentFeedback,
    pendingPostApprovalCount,
    missionsCreated,
    acceptedMissions,
    rejectedMissions,
    copiedMissions,
    postedMissions,
    trendMissions,
    successfulAiCalls,
    failedAiCalls,
    knowledgeReviewCount,
    knowledgeFailedCount,
    failedVideoRenders,
    sentLineDeliveries,
    failedLineDeliveries,
    overdueLineDeliveries,
    generationProviderReadyCount,
    sharedLineReadyCount,
    dedicatedRichMenuPublishCount,
  } = records;
  const isFortuneService =
    isFortuneServicePackage(configuration.registration.onboardingConfig) ||
    group.fortuneServiceSetting !== null;
  const participantIds = group.memberships.map(({ userId }) => userId);
  const { businessActivityRows, businessLineOpenRows, businessOutcomePosts } =
    await readServiceBusinessActivity({
      workspaceId: service.workspaceId,
      serviceId: service.serviceId,
      participantIds,
      enabled: isBusinessDailyService,
      now,
    });
  const businessEvents = [
    ...businessActivityRows.map((row) => ({ userId: row.actorUserId, occurredAt: row.occurredAt })),
    ...businessLineOpenRows.flatMap((row) =>
      row.consumedAt ? [{ userId: row.userId, occurredAt: row.consumedAt }] : [],
    ),
  ];
  const openedMissionCount = new Set(
    businessLineOpenRows
      .filter((row) => row.consumedAt && row.consumedAt >= sevenDaysAgo)
      .map((row) => row.dailyMissionId),
  ).size;
  const viewedMissionCount = new Set(
    businessActivityRows
      .filter((row) => row.type === 'VIEWED' && row.occurredAt >= sevenDaysAgo)
      .map((row) => row.dailyMissionId),
  ).size;
  const businessMetrics = buildBusinessPilotMetrics({
    participants: group.memberships.map(({ userId, createdAt }) => ({
      userId,
      joinedAt: createdAt,
    })),
    events: businessEvents,
    now,
    missions: missionsCreated,
    viewed: viewedMissionCount,
    accepted: acceptedMissions,
    copied: copiedMissions,
    posted: postedMissions,
    lineSent: sentLineDeliveries,
    lineOpened: openedMissionCount,
  });
  const businessOutcomes = sumBusinessOutcomes(
    businessOutcomePosts.map(({ manualMetrics }) => manualMetrics),
  );
  const lineMode = linePolicy?.mode ?? 'SHARED';
  const dedicatedLineReady = Boolean(
    linePolicy?.pilotEnabled &&
    line?.lastVerifiedAt &&
    !line.lastErrorCategory &&
    !line.globallyPaused,
  );
  const lineConfigurationReady =
    lineMode === 'SHARED'
      ? sharedLineReadyCount > 0
      : lineMode === 'DEDICATED'
        ? dedicatedLineReady
        : false;
  const readiness = buildServiceLaunchReadiness({
    serviceSlug: configuration.slug,
    operatorName: configuration.operatorName,
    contactEmail: configuration.contactEmail,
    registrationMode: configuration.registration.mode,
    emailEnabled: configuration.registration.emailEnabled,
    lineEnabled: configuration.registration.lineEnabled,
    onboardingQuestionCount: onboarding.questions.length,
    publishedLegalTypes: group.serviceLegalDocuments.map((item) => item.type),
    activeFeatureCount: group.featurePolicies.length,
    activeParticipantCount: group.memberships.length,
    activeKnowledgeCount: group.knowledgeSources.length,
    lineConfigurationReady,
    lineMode,
    linePilotEnabled: linePolicy?.pilotEnabled ?? false,
    lineRichMenuReady: dedicatedRichMenuPublishCount > 0,
    generationProviderReady: generationProviderReadyCount > 0,
    commercialContentRequired: configuration.registration.referralEnabled,
    trendResearchEnabled: configuration.trendResearchEnabled ?? true,
    trendProviderReady: trendProviderReadyCount > 0,
    activeProductPackCount,
    activeCampaignCount,
    activeTrackingLinkCount,
    ...(isBusinessDailyService
      ? {
          businessDailyIdeas: {
            businessProfileEnabled: onboarding.businessProfileEnabled,
            deliveryEnabled: onboarding.dailyIdeaDelivery.enabled,
            cadence: onboarding.dailyIdeaDelivery.cadence,
            contentMode: onboarding.dailyIdeaDelivery.contentMode,
            mediaMode: onboarding.dailyIdeaDelivery.mediaMode,
          },
        }
      : {}),
  });
  const readyCount = readiness.filter((item) => item.ready).length;
  const sideHustleFunnel = buildSideHustleContentFunnel({
    productMissions,
    linkedMissions: linkedProductMissions,
    copiedMissions: copiedProductMissions,
    postedMissions: postedProductMissions,
  });
  const feedbackSummary = buildPerformanceFeedbackSummary({
    posted: recentPostedForFeedback,
    good: recentFeedback.filter(({ rating }) => rating === 'GOOD').length,
    neutral: recentFeedback.filter(({ rating }) => rating === 'NEUTRAL').length,
    bad: recentFeedback.filter(({ rating }) => rating === 'BAD').length,
  });
  const operationActions = buildServiceOperationActions({
    serviceSlug: configuration.slug,
    lineEnabled: configuration.registration.lineEnabled,
    lineMode,
    sharedLineReadyCount,
    dedicatedLinePilotEnabled: linePolicy?.pilotEnabled ?? false,
    dedicatedLine: line,
    dedicatedLineReady,
    dedicatedRichMenuPublishCount,
    failedLineDeliveries,
    overdueLineDeliveries,
    businessDailyService: isBusinessDailyService,
    pendingPostApprovalCount,
    missingLinkWarning: sideHustleFunnel.missingLinkWarning,
    feedbackSummary,
    knowledgeReviewCount,
    knowledgeFailedCount,
    failedVideoRenders,
    failedAiCalls,
  });
  const visibleSections = selectServiceManagementSections(serviceManagementSections, {
    businessDaily: isBusinessDailyService,
    fortune: isFortuneService,
    promptOnlyImages: isPromptOnlyImageService(configuration.slug),
  });

  return {
    configuration,
    isBusinessDailyService,
    participantCount: group.memberships.length,
    readyCount,
    readiness,
    sentLineDeliveries,
    postedMissions,
    missionsCreated,
    acceptedMissions,
    rejectedMissions,
    copiedMissions,
    trendMissions,
    successfulAiCalls,
    failedAiCalls,
    failedLineDeliveries,
    businessMetrics,
    businessOutcomes,
    sideHustleFunnel,
    feedbackSummary,
    operationActions,
    visibleSections,
  };
}

export type ServiceManagementHomeModel = Awaited<ReturnType<typeof loadServiceManagementHome>>;
