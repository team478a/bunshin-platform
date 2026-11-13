import { createLogger } from '@bunshin/observability';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../src/services/public-service';
import { buildServiceLaunchReadiness } from '../../../../src/services/service-launch-readiness';
import { readServiceOnboardingSettings } from '../../../../src/services/service-onboarding-settings';
import { isFortuneServicePackage } from '../../../../src/services/service-creation-templates';
import { isPromptOnlyImageService } from '../../../../src/services/service-image-policy';
import { hasAiTrainingServiceProgram } from '../../../../src/services/service-ai-training-mode';
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
  readServiceCampaignOverview,
  readServiceManagementHomeRecords,
  type ServiceCampaignOverview,
} from './service-management-home-repository';

export class ServiceManagementAccessError extends Error {
  constructor() {
    super('SERVICE_MANAGEMENT_ACCESS_REQUIRED');
    this.name = 'ServiceManagementAccessError';
  }
}

export async function loadServiceManagementHome(serviceSlug: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch((error) => {
    if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND') return null;
    throw error;
  });
  if (!service) throw new ServiceManagementAccessError();
  const configuration = service.configuration;
  const onboarding = readServiceOnboardingSettings(
    configuration.registration.onboardingConfig,
    configuration.registration.surveyConfig,
  );
  const isAiTrainingService = await hasAiTrainingServiceProgram({
    workspaceId: service.workspaceId,
    serviceId: service.serviceId,
  });
  const records = await readServiceManagementHomeRecords({
    workspaceId: service.workspaceId,
    serviceId: service.serviceId,
    aiTraining: isAiTrainingService,
    fortunePackage: isFortuneServicePackage(configuration.registration.onboardingConfig),
    commercialContent: configuration.registration.referralEnabled,
    trendResearch: configuration.trendResearchEnabled ?? true,
  });
  if (!records) notFound();
  const {
    group,
    socialFeedback,
    trainingOverview,
    line,
    linePolicy,
    now,
    sevenDaysAgo,
    socialOperations,
  } = records;
  const isBusinessDailyService = onboarding.businessProfileEnabled && socialOperations;
  const isFortuneService =
    isFortuneServicePackage(configuration.registration.onboardingConfig) ||
    group.fortuneServiceSetting !== null;
  const visibleSections = selectServiceManagementSections(serviceManagementSections, {
    businessDaily: isBusinessDailyService,
    fortune: isFortuneService,
    aiTraining: isAiTrainingService,
    socialOperations,
    trainingOverview,
    promptOnlyImages: isPromptOnlyImageService(configuration.slug),
    socialFeedback,
    improvementOverview: socialFeedback || trainingOverview,
  });
  const campaignOverview = await loadCampaignOverview({
    enabled:
      socialOperations &&
      !isBusinessDailyService &&
      visibleSections.some(({ href }) => href === 'product-packs'),
    workspaceId: service.workspaceId,
    serviceId: service.serviceId,
    now,
  });
  const common = {
    configuration,
    isBusinessDailyService,
    isAiTrainingService,
    socialOperations,
    participantCount: group.memberships.length,
    visibleSections,
    campaignOverview,
  };
  // Unavailable aggregates must not turn into zero counts or successful readiness.
  if (!records.summary) return { ...common, summary: null };
  const {
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
  } = records.summary;
  try {
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
      ...businessActivityRows.map((row) => ({
        userId: row.actorUserId,
        occurredAt: row.occurredAt,
      })),
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
      isAiTrainingService,
      socialOperations,
      publishedLegalTypes: group.serviceLegalDocuments.map((item) => item.type),
      activeFeatureCount: group.featurePolicies.length,
      activeParticipantCount: group.memberships.length,
      activeKnowledgeCount: group.knowledgeSources.length,
      lineConfigurationReady,
      lineMode,
      linePilotEnabled: linePolicy?.pilotEnabled ?? false,
      lineRichMenuReady: dedicatedRichMenuPublishCount > 0,
      generationProviderReady: generationProviderReadyCount > 0,
      commercialContentRequired: socialOperations && configuration.registration.referralEnabled,
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
    return {
      ...common,
      summary: {
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
      },
    };
  } catch {
    createLogger().error('Service management summary assembly unavailable', {
      errorCode: 'SUMMARY_UNAVAILABLE',
      workspaceId: service.workspaceId,
      serviceId: service.serviceId,
    });
    return { ...common, summary: null };
  }
}

export type ServiceCampaignOverviewState =
  | { state: 'HIDDEN' }
  | { state: 'UNAVAILABLE' }
  | { state: 'READY'; overview: ServiceCampaignOverview };

/** 商品情報か発信企画があるServiceだけ、管理トップに日常の4業務を出す。 */
async function loadCampaignOverview(input: {
  enabled: boolean;
  workspaceId: string;
  serviceId: string;
  now: Date;
}): Promise<ServiceCampaignOverviewState> {
  if (!input.enabled) return { state: 'HIDDEN' };
  try {
    const overview = await readServiceCampaignOverview(input);
    return overview.inUse ? { state: 'READY', overview } : { state: 'HIDDEN' };
  } catch {
    // 件数を取得できない時に0件と表示しない。運営メニューは引き続き利用できる。
    createLogger().error('Service campaign overview unavailable', {
      errorCode: 'CAMPAIGN_OVERVIEW_UNAVAILABLE',
      workspaceId: input.workspaceId,
      serviceId: input.serviceId,
    });
    return { state: 'UNAVAILABLE' };
  }
}

export type ServiceManagementHomeModel = Awaited<ReturnType<typeof loadServiceManagementHome>>;
