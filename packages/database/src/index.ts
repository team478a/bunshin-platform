export { PrismaBunshinRepository } from './bunshin-core';
export {
  checkDatabaseReadiness,
  PrismaPersonalityLearningProposalRepository,
  PrismaPersonalityVersionRepository,
} from './bunshin-personality';
export {
  PrismaKnowledgeGrantRepository,
  PrismaOwnerKnowledgeRepository,
} from './bunshin-knowledge';
export {
  PrismaBunshinMemoryRepository,
  PrismaOwnerBunshinMemoryRepository,
} from './bunshin-memory';
export { PrismaBunshinCapabilityAssignmentRepository } from './bunshin-capability';
export {
  PrismaSocialAccountStrategyRepository,
  PrismaSocialProfileRepository,
} from './social-profile-strategy';
export {
  PrismaTrendResearchExpiryRepository,
  PrismaTrendResearchRepository,
} from './trend-research';
export {
  applyPointCreditToAccount,
  cancelPointRecovery,
  registerPointRecovery,
} from './point-account';
export { PrismaBadgeCoreRepository } from './badge-core';
export { PrismaPointLedgerRepository } from './point-ledger';
export { PrismaPointRedemptionRepository } from './point-redemption';
export { PrismaPointActivityProcessorRepository } from './point-activity';
export { PrismaGroupFeatureEntitlementRepository } from './group-feature-entitlement';
export {
  PrismaVideoDeliveryRepository,
  PrismaVideoProjectRepository,
} from './video-project-delivery';
export {
  PrismaVideoMediaQuotaRepository,
  PrismaVideoRenderRepository,
  PrismaVideoSceneGenerationRepository,
} from './video-generation-render';
export {
  PrismaVideoPlanningContextRepository,
  PrismaVideoRenderCompletionRepository,
  PrismaVideoRenderOperationsRepository,
} from './video-operations-planning';
export { PrismaVideoDisclosurePolicyRepository } from './video-disclosure-policy';
export {
  PrismaSocialImageGenerationAuthorizationRepository,
  PrismaSocialImageGenerationExecutionRepository,
  PrismaSocialImageGenerationRequestRepository,
  PrismaSocialImagePilotEvidenceRepository,
} from './social-image-generation';
export { PrismaVideoAssetRepository } from './video-assets';
export { PrismaExternalTrackingLinkRepository } from './external-tracking';
export {
  PrismaExternalLinkPlacementRepository,
  PrismaProductPackRepository,
} from './product-catalog';
export { PrismaGroupKnowledgeRepository } from './group-knowledge';
export {
  PrismaAdvertisingSafetyRepository,
  PrismaCampaignRepository,
  PrismaCampaignSafetyRepository,
} from './campaign-advertising';
export {
  PrismaMemberProductActivityRepository,
  PrismaMemberProductProfileRepository,
} from './member-product';
export { PrismaPointExpirationRepository } from './point-expiration';
export { PrismaFortuneRepository, purgeExpiredFortuneReadings } from './fortune';
export { PrismaResaleItemRepository } from './resale';
export { addProgramCalendarDays, PrismaAiResaleRuntimeRepository } from './resale-runtime';
export { PrismaAiResaleParticipantRepository } from './resale-participant';
export { PrismaTrainingAnswerRepository } from './training-answer';
export { PrismaTrainingInteractionRepository } from './training-interaction';
export { PrismaTrainingToolkitRepository } from './training-toolkit';
export type { SaveTrainingToolkitItemResult, TrainingToolkitItemView } from './training-toolkit';
export { PrismaTrainingGrowthRepository } from './training-growth';
export { PrismaAiTrainingRuntimeRepository } from './training-runtime';
export { PrismaTrainingParticipantProfileRepository } from './training-profile';
export { PrismaAiResaleOfferRepository } from './resale-offer';
export { PrismaServiceNotificationPreferenceRepository } from './service-notification-preference';
export { PrismaCommercialUsageService } from './commercial-usage';
export { PrismaCommercialBillingService } from './commercial-billing';
export type {
  SaveOrganizationCommercialContractInput,
  PrepareCustomQuoteInvoiceInput,
  TransitionTenantInvoiceInput,
} from './commercial-billing';
export type {
  CommercialUsageDashboard,
  CommercialUsageSummary,
  RecordCommercialUsageInput,
  RecordCommercialUsageResult,
} from './commercial-usage';
export { PrismaPointBalanceReconciliationRepository } from './point-balance-reconciliation';
import { Prisma, type PrismaClient, prisma } from './client';
export { Prisma, prisma };
export type { PrismaClient };
export {
  PrismaAdminEmailConfigurationRepository,
  PrismaAiProviderConfigurationRepository,
  PrismaVideoAiProviderCostPolicyRepository,
} from './provider-configurations';
export { PrismaLineConnectionRepository } from './line-connections';
export {
  PrismaLineDeliveryPreferenceRepository,
  PrismaLineDeliveryRetryRepository,
  PrismaLineMessageDeliveryRepository,
  PrismaLineReturnReminderRepository,
  PrismaMissionDeepLinkStateRepository,
} from './line-delivery';
export { PrismaLineNotificationPreferenceRepository } from './line-notification-preferences';
export {
  PrismaLineAdminFunnelRepository,
  PrismaLineAdminMetricsRepository,
  PrismaLineOperationalSnapshotRepository,
} from './line-admin-observability';
export {
  PrismaLineConfigurationRepository,
  PrismaLineRichMenuRepository,
} from './line-platform-configuration';
export {
  PrismaGroupLineConfigurationRepository,
  PrismaGroupLineConnectionRepository,
} from './oem-line-configuration';
import type {
  PersonalityLearningCandidateRepository,
  TrendResearchGenerationContextRepository,
} from '@bunshin/application';
import { parsePreferredFormats } from '@bunshin/capability-social';
export { PrismaCommonBadgeProcessorRepository } from './badge-common-processor';
export { PrismaBadgeUserExperienceRepository } from './badge-user-experience';
export { PrismaBadgeLineNotificationPreparationRepository } from './badge-line-notification';
export { PrismaBadgeLineDeliveryRepository } from './badge-line-notification';
export { PrismaBadgeLineJobCandidateRepository } from './badge-line-notification';
export { PrismaBadgeLineDeliveryRetryRepository } from './badge-line-notification';
export { PrismaBadgeLineReconciliationRepository } from './badge-line-notification';
export { PrismaBadgeGroupWorkflowRepository } from './badge-group-workflow';
export {
  PrismaBadgeEntitlementConsumptionRepository,
  PrismaBadgeRewardRepository,
} from './badge-reward';
export { PrismaBadgeRewardOperationsRepository } from './badge-reward-operations';
import { ApplicationError } from '@bunshin/shared';
import { stringArray } from './bunshin-records';
export { LATEST_DATABASE_MIGRATION } from './schema-readiness';
export {
  getActiveRewardsPilotAccess,
  hasActiveRewardsPilotAccess,
  listActiveRewardsPilotServiceAccesses,
  replaceRewardsPilotMemberAssignments,
  startFourWeekRewardsPilot,
  REWARDS_PILOT_FEATURE_KEY,
  type RewardsPilotAccess,
  type RewardsPilotServiceAccess,
} from './rewards-pilot-access';

export {
  PrismaJobRepository,
  PrismaMissionAutomationCandidateRepository,
  PrismaMissionAutomationScopeRepository,
  PrismaTrendResearchAutomationCandidateRepository,
} from './automation-jobs';
export class PrismaPersonalityLearningCandidateRepository implements PersonalityLearningCandidateRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listEligible(input: { limit: number; evidenceLimit: number }) {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100 ||
      !Number.isInteger(input.evidenceLimit) ||
      input.evidenceLimit < 3 ||
      input.evidenceLimit > 100
    )
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'invalid personality learning candidate limit',
      );

    const scanLimit = Math.min(1_000, (input.limit + 1) * 10);
    const rows = await this.client.bunshin.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        workspace: { status: 'ACTIVE' },
        ownerUser: { status: 'ACTIVE' },
        personality: { isNot: null },
        personalityVersions: { some: {} },
        missionFeedback: { some: { rating: 'BAD' } },
        personalityLearningProposals: { none: { status: 'PENDING' } },
      },
      select: {
        workspaceId: true,
        id: true,
        ownerUserId: true,
        workspace: {
          select: { memberships: { where: { status: 'ACTIVE' }, select: { userId: true } } },
        },
        personalityVersions: { orderBy: { version: 'desc' }, take: 1 },
        missionFeedback: {
          where: { rating: 'BAD' },
          orderBy: { updatedAt: 'desc' },
          take: input.evidenceLimit,
          select: {
            id: true,
            rating: true,
            updatedAt: true,
            dailyMission: { select: { format: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: scanLimit,
    });
    const candidates = rows.flatMap((row) => {
      const version = row.personalityVersions[0];
      if (!version || !row.workspace.memberships.some(({ userId }) => userId === row.ownerUserId))
        return [];
      const evidence = row.missionFeedback
        .filter(({ updatedAt }) => updatedAt > version.createdAt)
        .map((feedback) => ({
          feedbackId: feedback.id,
          rating: 'BAD' as const,
          missionFormat: feedback.dailyMission.format,
          occurredAt: feedback.updatedAt,
        }));
      if (evidence.length < 3) return [];
      return [
        {
          workspaceId: row.workspaceId,
          bunshinId: row.id,
          actorUserId: row.ownerUserId,
          basedOnVersionId: version.id,
          currentContent: {
            tone: version.tone,
            formality: version.formality,
            energyLevel: version.energyLevel,
            expertiseLevel: version.expertiseLevel,
            sentenceStyle: version.sentenceStyle,
            firstPerson: version.firstPerson,
            forbiddenExpressions: stringArray(version.forbiddenExpressions, 'forbiddenExpressions'),
            preferredExpressions: stringArray(version.preferredExpressions, 'preferredExpressions'),
            visualDirection: version.visualDirection,
            facePolicy: version.facePolicy,
          },
          evidence,
        },
      ];
    });
    return {
      candidates: candidates.slice(0, input.limit),
      truncated: candidates.length > input.limit || rows.length === scanLimit,
    };
  }
}

export class PrismaTrendResearchGenerationContextRepository implements TrendResearchGenerationContextRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async get(input: Parameters<TrendResearchGenerationContextRepository['get']>[0]) {
    const profile = await this.client.socialProfile.findFirst({
      where: {
        id: input.socialProfileId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
        bunshin: {
          status: { not: 'ARCHIVED' },
          ownerUserId: input.actorUserId,
          ownerUser: { status: 'ACTIVE' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
          capabilityAssignments: { some: { capabilityType: 'SOCIAL', status: 'ACTIVE' } },
        },
      },
      include: {
        accountStrategies: {
          where: { status: 'APPROVED' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { concept: true, targetSummary: true },
        },
        bunshin: {
          select: {
            contentPillars: {
              where: { active: true, deletedAt: null },
              orderBy: [{ weight: 'desc' }, { id: 'asc' }],
              take: 5,
              select: { title: true },
            },
          },
        },
      },
    });
    const strategy = profile?.accountStrategies[0];
    if (!profile || !strategy) return null;
    return {
      workspaceId: profile.workspaceId,
      bunshinId: profile.bunshinId,
      actorUserId: input.actorUserId,
      socialProfileId: profile.id,
      platform: profile.platform,
      purpose: profile.purpose,
      preferredFormats: parsePreferredFormats(profile.preferredFormats),
      concept: strategy.concept,
      targetSummary: strategy.targetSummary,
      contentPillars: profile.bunshin.contentPillars.map(({ title }) => title),
    };
  }
}

export { PrismaAdminAuditLogRepository } from './admin-audit-log';
export {
  PrismaAccountUnitOfWork,
  PrismaCurrentUserAccountRepository,
  PrismaPlatformAdminRepository,
  PrismaWorkspaceAccessRepository,
  listActiveWorkspacesForUser,
} from './account-access';
export { PrismaLegalConsentRepository, PrismaLegalDocumentRepository } from './legal-consent';
export {
  PrismaAccountDeletionAdminOperationsRepository,
  PrismaAccountDeletionExecutionRepository,
  PrismaAccountDeletionOrchestrationRepository,
  PrismaAccountDeletionPurgeRepository,
  PrismaAccountDeletionRequestRepository,
} from './account-deletion';
export { PrismaContentPillarRepository, PrismaWeeklyPlanRepository } from './mission-planning';
export { PrismaDailyMissionRepository } from './daily-missions';
export {
  PrismaDailyMissionGenerationRepository,
  PrismaGenerationContextSnapshotRepository,
  PrismaLineMissionNotificationSummaryRepository,
  PrismaMissionContentVariantRepository,
} from './mission-generation';
export {
  PrismaAchievementBadgeRepository,
  PrismaMissionEngagementRepository,
  PrismaMissionOutcomeRepository,
} from './mission-progress';
export {
  PrismaValidationMetricsRepository,
  summarizeAssistanceLevels,
  summarizePersonalityLearning,
  summarizePersonalityLearningOutcomes,
} from './validation-metrics';
export {
  PrismaAiUsageEventRepository,
  PrismaOrganizationAiGenerationReservationRepository,
} from './ai-usage';
export { PrismaActivityContinuityRuleRepository } from './activity-continuity-rules';
export { PrismaAdminOperationsRepository } from './admin-operations';
export { PrismaAdminAlertRepository } from './admin-alerts';
export { PrismaProductionGateEvidenceRepository } from './production-gate-evidence';
export { PrismaTrendOperationsRepository } from './trend-operations';
export { PrismaProgramCoreRepository, PrismaProgramRuntimeRepository } from './program-runtime';
export {
  PrismaServiceFoundationRepository,
  PrismaServiceStaffRoleRepository,
} from './service-foundation';
export { PrismaGroupParticipationRepository } from './group-participation';
export { PrismaServiceParticipationRepository } from './service-participation';
export {
  PrismaServiceCreditAdjustmentRepository,
  PrismaServiceCreditConsumptionRepository,
  PrismaServiceCreditExpirationRepository,
  PrismaServiceReferralRewardRepository,
  PrismaServiceReferralRewardRuleRepository,
} from './service-commercial-credit';
