import 'server-only';
import { GroupKnowledgeService } from '@bunshin/application';
import type { SocialDecisionObservation } from '@bunshin/capability-social';
import { businessContentMixKnowledge } from './business-content-mix';
import { summarizeMissionLearningHistory } from './daily-mission-learning-history';
import { readPostPerformance } from './post-performance';
import { resolveServiceContentAssistanceLevel } from './service-content-assistance-level';
import {
  businessProfileKnowledgeForPrompt,
  executionResultKnowledgeForPrompt,
  serviceKnowledgeForPrompt,
} from './service-generation-knowledge-prompt';
import {
  MISSION_EXECUTION_RESULT_TYPES,
  type MissionExecutionResultType,
  type ServiceGenerationKnowledgeScope,
} from './service-generation-knowledge-types';
import { readServiceOnboardingSettings } from './service-onboarding-settings';
import {
  readServiceOnboardingAnswers,
  serviceOnboardingProposalContext,
} from './service-onboarding-response';
import { readSnapshotStrategyGoal } from './social-goal-outcomes';
import {
  serviceContentTerminologyKnowledge,
  serviceContentTerminologyPolicy,
} from './service-content-terminology';

export async function loadServiceGenerationKnowledge(scope: ServiceGenerationKnowledgeScope) {
  const db = await import('@bunshin/database');
  const [
    chunks,
    businessProfile,
    contentAssistanceLevel,
    registrationPolicy,
    serviceConfiguration,
    executionResults,
    onboardingResponse,
    recentActivities,
    recentVariants,
    recentFeedback,
    recentDecisions,
    recentPostRecords,
    recentSocialInsights,
  ] = await Promise.all([
    new GroupKnowledgeService(
      new db.PrismaGroupKnowledgeRepository(),
    ).listApprovedChunksForGeneration({
      ...scope,
      productPackVersionId: null,
    }),
    db.prisma.serviceMemberBusinessProfile.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        userId: scope.actorUserId,
        groupMembership: { status: 'ACTIVE' },
      },
      select: {
        id: true,
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
        primaryIndustry: { select: { key: true, name: true } },
      },
    }),
    resolveServiceContentAssistanceLevel(scope),
    db.prisma.serviceRegistrationPolicy.findFirst({
      where: { workspaceId: scope.workspaceId, groupId: scope.groupId },
      select: { onboardingConfig: true, surveyConfig: true },
    }),
    db.prisma.serviceConfiguration.findFirst({
      where: { workspaceId: scope.workspaceId, groupId: scope.groupId },
      select: { slug: true },
    }),
    scope.bunshinId
      ? db.prisma.missionActivity.findMany({
          where: {
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            actorUserId: scope.actorUserId,
            type: { in: [...MISSION_EXECUTION_RESULT_TYPES, 'POSTED'] },
            dailyMission: { bunshin: { groupId: scope.groupId } },
          },
          select: {
            type: true,
            dailyMission: { select: { missionDate: true, topic: true } },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 5,
        })
      : Promise.resolve([]),
    db.prisma.serviceOnboardingResponse.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        userId: scope.actorUserId,
        groupMembership: { status: 'ACTIVE' },
      },
      select: { id: true, answers: true },
    }),
    scope.bunshinId
      ? db.prisma.missionActivity.findMany({
          where: {
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            actorUserId: scope.actorUserId,
            dailyMission: { bunshin: { groupId: scope.groupId } },
          },
          select: {
            id: true,
            workspaceId: true,
            bunshinId: true,
            actorUserId: true,
            type: true,
            dailyMissionId: true,
            occurredAt: true,
            dailyMission: { select: { missionDate: true, topic: true, angle: true } },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 12,
        })
      : Promise.resolve([]),
    scope.bunshinId
      ? db.prisma.missionContentVariantSelection.findMany({
          where: {
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            actorUserId: scope.actorUserId,
            dailyMission: { bunshin: { groupId: scope.groupId } },
          },
          select: {
            id: true,
            variantId: true,
            dailyMissionId: true,
            selectedAt: true,
            variant: { select: { sequence: true } },
            dailyMission: { select: { missionDate: true, topic: true, angle: true } },
          },
          orderBy: [{ selectedAt: 'desc' }, { id: 'desc' }],
          take: 5,
        })
      : Promise.resolve([]),
    scope.bunshinId
      ? db.prisma.missionFeedback.findMany({
          where: {
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            actorUserId: scope.actorUserId,
            dailyMission: { bunshin: { groupId: scope.groupId } },
          },
          select: {
            id: true,
            workspaceId: true,
            bunshinId: true,
            actorUserId: true,
            rating: true,
            dailyMissionId: true,
            updatedAt: true,
            dailyMission: { select: { missionDate: true, topic: true, angle: true } },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 12,
        })
      : Promise.resolve([]),
    scope.bunshinId
      ? db.prisma.missionDecision.findMany({
          where: {
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            decision: { in: ['ACCEPTED', 'REJECTED'] },
            dailyMission: {
              bunshin: { groupId: scope.groupId, ownerUserId: scope.actorUserId },
            },
          },
          select: {
            id: true,
            workspaceId: true,
            bunshinId: true,
            dailyMissionId: true,
            decision: true,
            rejectionReason: true,
            rejectionDetail: true,
            decidedAt: true,
            dailyMission: { select: { missionDate: true, topic: true, angle: true } },
          },
          orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
          take: 12,
        })
      : Promise.resolve([]),
    scope.bunshinId
      ? db.prisma.postRecord.findMany({
          where: {
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            actorUserId: scope.actorUserId,
            dailyMission: { bunshin: { groupId: scope.groupId } },
          },
          select: {
            id: true,
            workspaceId: true,
            bunshinId: true,
            actorUserId: true,
            dailyMissionId: true,
            platform: true,
            postedAt: true,
            manualMetrics: true,
            dailyMission: {
              select: {
                missionDate: true,
                topic: true,
                angle: true,
                generationContext: { select: { payload: true } },
              },
            },
          },
          orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
          take: 5,
        })
      : Promise.resolve([]),
    scope.bunshinId
      ? db.prisma.socialInsightSnapshot.findMany({
          where: {
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            userId: scope.actorUserId,
            bunshinId: scope.bunshinId,
          },
          select: {
            id: true,
            observedOn: true,
            followers: true,
            reach: true,
            impressions: true,
            profileViews: true,
            interactions: true,
          },
          orderBy: [{ observedOn: 'desc' }, { id: 'desc' }],
          take: 3,
        })
      : Promise.resolve([]),
  ]);
  const serviceSettings = readServiceOnboardingSettings(
    registrationPolicy?.onboardingConfig,
    registrationPolicy?.surveyConfig,
  );
  const dailyIdeaDelivery = serviceSettings.dailyIdeaDelivery;
  const businessContentMixEnabled = Boolean(businessProfile && dailyIdeaDelivery.enabled);
  const contentTerminologyPolicy = serviceConfiguration
    ? serviceContentTerminologyPolicy(serviceConfiguration.slug)
    : null;
  const knowledge = serviceKnowledgeForPrompt(chunks);
  const executionKnowledge = executionResultKnowledgeForPrompt(
    executionResults.map((result) => ({
      type: (result.type === 'POSTED'
        ? 'EXECUTION_COMPLETED'
        : result.type) as MissionExecutionResultType,
      missionDate: result.dailyMission.missionDate.toISOString().slice(0, 10),
      topic: result.dailyMission.topic,
    })),
  );
  const normalizedBusinessProfile = businessProfile?.primaryIndustry
    ? {
        industry:
          businessProfile.primaryIndustry.name === 'その他' && businessProfile.otherIndustryText
            ? businessProfile.otherIndustryText
            : businessProfile.primaryIndustry.name,
        businessName: businessProfile.businessName,
        region: businessProfile.region,
        productService: businessProfile.productService,
        primaryPurpose: businessProfile.primaryPurpose,
        targetAudience: businessProfile.targetAudience,
        websiteUrl: businessProfile.websiteUrl,
        businessFeatures: businessProfile.businessFeatures,
        priceInformation: businessProfile.priceInformation,
        preferredTone: businessProfile.preferredTone,
        requiredContent: businessProfile.requiredContent,
        forbiddenContent: businessProfile.forbiddenContent,
      }
    : null;
  const onboardingAnswers = readServiceOnboardingAnswers(onboardingResponse?.answers);
  const decisionContextEnabled =
    serviceSettings.businessProfileEnabled && serviceSettings.dailyIdeaDelivery.enabled;
  const legalConsent =
    decisionContextEnabled && serviceConfiguration
      ? await new db.PrismaServiceParticipationRepository().findLegalConsentView({
          slug: serviceConfiguration.slug,
          actorUserId: scope.actorUserId,
          now: new Date(),
        })
      : null;
  const acceptedLegalDocumentIds = new Set(legalConsent?.acceptedDocumentIds ?? []);
  const safetyLegal =
    legalConsent && legalConsent.legalDocuments.every(({ id }) => acceptedLegalDocumentIds.has(id))
      ? ('PASSED' as const)
      : ('UNKNOWN' as const);
  const decisionObservations: SocialDecisionObservation[] = [
    ...recentDecisions.map((decision) => ({
      id: `decision:${decision.id}`,
      type: 'DECISION' as const,
      data: {
        id: decision.id,
        workspaceId: decision.workspaceId,
        bunshinId: decision.bunshinId,
        dailyMissionId: decision.dailyMissionId,
        decision: decision.decision,
        rejectionReason: decision.rejectionReason,
        rejectionDetail: decision.rejectionDetail,
        decidedAt: decision.decidedAt,
      },
    })),
    ...recentActivities.map((activity) => ({
      id: `activity:${activity.id}`,
      type: 'ACTIVITY' as const,
      data: {
        id: activity.id,
        workspaceId: activity.workspaceId,
        bunshinId: activity.bunshinId,
        dailyMissionId: activity.dailyMissionId,
        actorUserId: activity.actorUserId,
        type: activity.type,
        occurredAt: activity.occurredAt,
      },
    })),
    ...recentFeedback.map((feedback) => ({
      id: `feedback:${feedback.id}`,
      type: 'FEEDBACK' as const,
      data: {
        id: feedback.id,
        workspaceId: feedback.workspaceId,
        bunshinId: feedback.bunshinId,
        dailyMissionId: feedback.dailyMissionId,
        actorUserId: feedback.actorUserId,
        rating: feedback.rating,
        updatedAt: feedback.updatedAt,
      },
    })),
    ...recentPostRecords.flatMap((post): SocialDecisionObservation[] => {
      const performance = readPostPerformance(post.manualMetrics);
      const goalAtObservation = readSnapshotStrategyGoal(
        post.dailyMission.generationContext?.payload,
      );
      return [
        {
          id: `post:${post.id}`,
          type: 'POST',
          data: {
            id: post.id,
            workspaceId: post.workspaceId,
            bunshinId: post.bunshinId,
            dailyMissionId: post.dailyMissionId,
            actorUserId: post.actorUserId,
            platform: post.platform,
            postedAt: post.postedAt,
          },
        },
        ...(performance
          ? [
              {
                id: `performance:${post.id}`,
                type: 'PERFORMANCE' as const,
                goalAtObservation,
                data: {
                  topic: post.dailyMission.topic,
                  metrics: {
                    engagementScore: null,
                    saves: performance.saves,
                    shares: performance.shares,
                    comments: performance.comments,
                    follows: performance.follows,
                  },
                },
              },
            ]
          : []),
      ];
    }),
  ];
  const learningHistory = summarizeMissionLearningHistory({
    activities: recentActivities,
    variants: recentVariants,
    feedback: recentFeedback,
    decisions: recentDecisions.flatMap((decision) =>
      decision.decision === 'PENDING'
        ? []
        : [
            {
              ...decision,
              decision: decision.decision,
            },
          ],
    ),
    posts: recentPostRecords,
    socialInsights: recentSocialInsights,
  });
  return {
    ...knowledge,
    contentAssistanceLevel,
    dailyIdeaDelivery,
    businessContentMixEnabled,
    contentTerminologyPolicy,
    businessProfile: normalizedBusinessProfile,
    decisionContext: {
      enabled: decisionContextEnabled,
      safetyLegal,
      observations: decisionObservations,
      outcomeRecords: recentPostRecords.map((post) => ({
        topic: post.dailyMission.topic,
        manualMetrics: post.manualMetrics,
        strategyGoal: readSnapshotStrategyGoal(post.dailyMission.generationContext?.payload),
      })),
    },
    personalization: {
      onboardingContext: serviceOnboardingProposalContext(onboardingAnswers),
      behaviorSummary: learningHistory.behaviorSummary,
      feedbackSummary: learningHistory.feedbackSummary,
      performanceSummary: learningHistory.performanceSummary,
      fallbackPreference: learningHistory.fallbackPreference,
      references: {
        onboardingResponseId: onboardingResponse?.id ?? null,
        businessProfileId: businessProfile?.id ?? null,
        recentActivityIds: recentActivities.map(({ id }) => id),
        recentVariantSelectionIds: recentVariants.map(({ id }) => id),
        recentFeedbackIds: recentFeedback.map(({ id }) => id),
        recentDecisionIds: recentDecisions.map(({ id }) => id),
        recentPostRecordIds: recentPostRecords.map(({ id }) => id),
        recentSocialInsightIds: recentSocialInsights.map(({ id }) => id),
      },
    },
    officialKnowledge: [
      ...serviceContentTerminologyKnowledge(contentTerminologyPolicy),
      ...businessProfileKnowledgeForPrompt(
        businessProfile?.primaryIndustry
          ? {
              industryKey: businessProfile.primaryIndustry.key,
              industryName: businessProfile.primaryIndustry.name,
              otherIndustryText: businessProfile.otherIndustryText,
              businessName: businessProfile.businessName,
              region: businessProfile.region,
              productService: businessProfile.productService,
              primaryPurpose: businessProfile.primaryPurpose,
              targetAudience: businessProfile.targetAudience,
              websiteUrl: businessProfile.websiteUrl,
              businessFeatures: businessProfile.businessFeatures,
              priceInformation: businessProfile.priceInformation,
              preferredTone: businessProfile.preferredTone,
              requiredContent: businessProfile.requiredContent,
              forbiddenContent: businessProfile.forbiddenContent,
            }
          : null,
      ),
      ...(businessContentMixEnabled ? [businessContentMixKnowledge()] : []),
      ...(executionKnowledge ? [executionKnowledge] : []),
      ...knowledge.officialKnowledge,
    ],
  };
}
