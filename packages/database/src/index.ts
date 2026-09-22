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
import {
  calculateAdminRetention,
  calculateFirstWeekThreePostKpi,
  PRODUCTION_GATE_REQUIRED_CHECK_KEYS,
} from '@bunshin/application';
import type {
  ValidationMetricsRepository,
  ValidationMetricsSnapshot,
  AiUsageEventRepository,
  RecordAiUsageInput,
  OrganizationAiGenerationReservationRepository,
  LineConfigurationEnvironment,
  PersonalityLearningCandidateRepository,
  TrendResearchGenerationContextRepository,
  AdminOperationsRepository,
  AdminOperationsSnapshot,
  AdminUserDetail,
  AdminUserStage,
  AdminUserSummary,
  AdminAlertRepository,
  AdminAlertSnapshot,
  AdminAuditLogRepository,
  AdminAuditLogItem,
  AdminAuditCategory,
  TrendOperationsRepository,
  TrendOperationsSnapshot,
  ProductionGateEvidence,
  ProductionGateEvidenceRepository,
  ActivityContinuityRule,
  ActivityContinuityRuleRepository,
  ActivityBadgeRule,
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

export class PrismaAdminAuditLogRepository implements AdminAuditLogRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    from: Date;
    to: Date;
    category: AdminAuditCategory | null;
    limit: number;
  }) {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    const range = { gte: input.from, lt: input.to };
    const take = input.limit + 1;
    const requested = (category: AdminAuditCategory) =>
      input.category === null || input.category === category;
    const [adminRows, userRows, aiRows, lineRows, menuRows, deletionRows] = await Promise.all([
      requested('ADMIN_ACCESS')
        ? this.client.platformAdminAudit.findMany({
            where: { occurredAt: range },
            include: {
              actor: { select: { displayName: true } },
              target: { select: { displayName: true } },
            },
            orderBy: { occurredAt: 'desc' },
            take,
          })
        : [],
      requested('USER_OPERATION')
        ? this.client.userOperationAudit.findMany({
            where: { occurredAt: range },
            include: {
              actor: { select: { displayName: true } },
              target: { select: { displayName: true } },
            },
            orderBy: { occurredAt: 'desc' },
            take,
          })
        : [],
      requested('AI_CONFIGURATION')
        ? this.client.aiProviderConfigurationAudit.findMany({
            where: { environment: input.environment, occurredAt: range },
            include: { actor: { select: { displayName: true } } },
            orderBy: { occurredAt: 'desc' },
            take,
          })
        : [],
      requested('LINE_CONFIGURATION')
        ? this.client.lineConfigurationAudit.findMany({
            where: { environment: input.environment, occurredAt: range },
            include: { actor: { select: { displayName: true } } },
            orderBy: { occurredAt: 'desc' },
            take,
          })
        : [],
      requested('LINE_RICH_MENU')
        ? this.client.lineRichMenuAudit.findMany({
            where: { environment: input.environment, occurredAt: range },
            include: {
              actor: { select: { displayName: true } },
              richMenu: { select: { name: true, version: true } },
            },
            orderBy: { occurredAt: 'desc' },
            take,
          })
        : [],
      requested('ACCOUNT_DELETION')
        ? this.client.accountDeletionOperationAudit.findMany({
            where: { occurredAt: range },
            include: { actor: { select: { displayName: true } } },
            orderBy: { occurredAt: 'desc' },
            take,
          })
        : [],
    ]);
    const items: AdminAuditLogItem[] = [
      ...adminRows.map((row) => ({
        id: row.id,
        category: 'ADMIN_ACCESS' as const,
        action: row.action,
        actorDisplayName: row.actor.displayName,
        targetLabel: row.target.displayName,
        reason: row.reason,
        occurredAt: row.occurredAt,
      })),
      ...userRows.map((row) => ({
        id: row.id,
        category: 'USER_OPERATION' as const,
        action: row.action,
        actorDisplayName: row.actor.displayName,
        targetLabel: row.target.displayName,
        reason: row.reason,
        occurredAt: row.occurredAt,
      })),
      ...aiRows.map((row) => ({
        id: row.id,
        category: 'AI_CONFIGURATION' as const,
        action: row.action,
        actorDisplayName: row.actor.displayName,
        targetLabel: `${row.provider} 設定 ${row.configurationId.slice(0, 8)}`,
        reason: row.reason,
        occurredAt: row.occurredAt,
      })),
      ...lineRows.map((row) => ({
        id: row.id,
        category: 'LINE_CONFIGURATION' as const,
        action: row.action,
        actorDisplayName: row.actor.displayName,
        targetLabel: `LINE設定 ${row.configurationId.slice(0, 8)}`,
        reason: row.reason,
        occurredAt: row.occurredAt,
      })),
      ...menuRows.map((row) => ({
        id: row.id,
        category: 'LINE_RICH_MENU' as const,
        action: row.action,
        actorDisplayName: row.actor.displayName,
        targetLabel: `${row.richMenu.name} 第${row.richMenu.version}版`,
        reason: row.reason,
        occurredAt: row.occurredAt,
      })),
      ...deletionRows.map((row) => ({
        id: row.id,
        category: 'ACCOUNT_DELETION' as const,
        action: row.action,
        actorDisplayName: row.actor.displayName,
        targetLabel: `退会要求 ${row.requestId.slice(0, 8)}`,
        reason: row.reason,
        occurredAt: row.occurredAt,
      })),
    ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
    return { items: items.slice(0, input.limit), truncated: items.length > input.limit };
  }
}

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
const uniqueCount = (values: string[]) => new Set(values).size;
const rate = (numerator: number, denominator: number) =>
  denominator === 0 ? null : numerator / denominator;
const validationCopyTypes = new Set([
  'COPIED_TEXT',
  'COPIED_SLIDE',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SCRIPT',
]);

export function summarizeAssistanceLevels(input: {
  missions: Array<{ id: string; assistanceLevel: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE' }>;
  activities: Array<{
    dailyMissionId: string;
    type: string;
    dailyMission: { assistanceLevel: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE' };
  }>;
  posts: Array<{
    dailyMissionId: string;
    dailyMission: { assistanceLevel: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE' };
  }>;
  feedback: Array<{
    dailyMissionId: string;
    rating: string;
    dailyMission: { assistanceLevel: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE' };
  }>;
}) {
  return (['IDEA_ONLY', 'GUIDED', 'READY_TO_USE'] as const).map((level) => {
    const missionIds = new Set(
      input.missions.filter(({ assistanceLevel }) => assistanceLevel === level).map(({ id }) => id),
    );
    const activities = input.activities.filter(
      ({ dailyMission }) => dailyMission.assistanceLevel === level,
    );
    const viewed = new Set(
      activities
        .filter(({ type }) => type === 'VIEWED')
        .map(({ dailyMissionId }) => dailyMissionId),
    ).size;
    const accepted = new Set(
      activities
        .filter(({ type }) => type === 'ACCEPTED')
        .map(({ dailyMissionId }) => dailyMissionId),
    ).size;
    const copied = new Set(
      activities
        .filter(({ type }) => validationCopyTypes.has(type))
        .map(({ dailyMissionId }) => dailyMissionId),
    ).size;
    const posts = input.posts.filter(({ dailyMission }) => dailyMission.assistanceLevel === level);
    const feedback = input.feedback.filter(
      ({ dailyMission }) => dailyMission.assistanceLevel === level,
    );
    const good = feedback.filter(({ rating }) => rating === 'GOOD').length;
    const posted = new Set(posts.map(({ dailyMissionId }) => dailyMissionId)).size;
    return {
      level,
      missions: missionIds.size,
      viewed,
      accepted,
      copied,
      posted,
      feedback: feedback.length,
      goodFeedback: good,
      acceptanceRate: rate(accepted, viewed),
      copyRate: rate(copied, accepted),
      postRate: rate(posted, copied),
      goodFeedbackRate: rate(good, feedback.length),
    };
  });
}

export function summarizePersonalityLearning(
  proposals: Array<{
    bunshinId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
    reason: string;
  }>,
): ValidationMetricsSnapshot['personalityLearning'] {
  const approved = proposals.filter(({ status }) => status === 'APPROVED').length;
  const rejected = proposals.filter(({ status }) => status === 'REJECTED').length;
  const revoked = proposals.filter(({ status }) => status === 'REVOKED').length;
  const decided = approved + rejected + revoked;
  const correctionKeys = new Map<string, number>();
  for (const proposal of proposals) {
    const key = `${proposal.bunshinId}:${proposal.reason.trim().toLocaleLowerCase('ja-JP')}`;
    correctionKeys.set(key, (correctionKeys.get(key) ?? 0) + 1);
  }
  return {
    proposed: proposals.length,
    approved,
    rejected,
    revoked,
    decided,
    adoptionRate: rate(approved, decided),
    repeatedCorrectionCount: [...correctionKeys.values()].reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    ),
    applications: 0,
    cohortTruncated: false,
    before: emptyPersonalityLearningOutcome(),
    after: emptyPersonalityLearningOutcome(),
  };
}

const LEARNING_OUTCOME_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

function emptyPersonalityLearningOutcome() {
  return {
    missions: 0,
    posted: 0,
    postRate: null,
    feedback: 0,
    goodFeedback: 0,
    goodFeedbackRate: null,
  };
}

export function summarizePersonalityLearningOutcomes(
  applications: Array<{ bunshinId: string; appliedAt: Date }>,
  missions: Array<{
    id: string;
    bunshinId: string;
    createdAt: Date;
    posted: boolean;
    rating: 'GOOD' | 'BAD' | 'NEUTRAL' | null;
  }>,
) {
  const beforeIds = new Set<string>();
  const afterIds = new Set<string>();
  const missionsByBunshin = new Map<string, typeof missions>();
  for (const mission of missions) {
    const values = missionsByBunshin.get(mission.bunshinId) ?? [];
    values.push(mission);
    missionsByBunshin.set(mission.bunshinId, values);
  }
  for (const application of applications) {
    const from = application.appliedAt.getTime() - LEARNING_OUTCOME_WINDOW_MS;
    const to = application.appliedAt.getTime() + LEARNING_OUTCOME_WINDOW_MS;
    for (const mission of missionsByBunshin.get(application.bunshinId) ?? []) {
      const at = mission.createdAt.getTime();
      if (at >= from && at < application.appliedAt.getTime()) beforeIds.add(mission.id);
      if (at >= application.appliedAt.getTime() && at < to) afterIds.add(mission.id);
    }
  }
  const summarize = (ids: Set<string>) => {
    const values = missions.filter(({ id }) => ids.has(id));
    const feedback = values.filter(({ rating }) => rating !== null);
    const goodFeedback = feedback.filter(({ rating }) => rating === 'GOOD').length;
    const posted = values.filter(({ posted }) => posted).length;
    return {
      missions: values.length,
      posted,
      postRate: rate(posted, values.length),
      feedback: feedback.length,
      goodFeedback,
      goodFeedbackRate: rate(goodFeedback, feedback.length),
    };
  };
  return { before: summarize(beforeIds), after: summarize(afterIds) };
}

export class PrismaValidationMetricsRepository implements ValidationMetricsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async summarize(input: {
    workspaceId: string;
    actorUserId: string;
    period: { from: Date; to: Date };
  }): Promise<ValidationMetricsSnapshot | null> {
    const authorized = await this.client.workspaceMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
        workspace: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (authorized === null) return null;

    const occurred = { gte: input.period.from, lt: input.period.to };
    const matureLearningApplication = {
      gte: input.period.from,
      lt: new Date(input.period.to.getTime() - LEARNING_OUTCOME_WINDOW_MS),
    };
    const copyTypes = [
      'COPIED_TEXT',
      'COPIED_SLIDE',
      'COPIED_IMAGE_INSTRUCTION',
      'COPIED_VIDEO_PROMPT',
      'COPIED_SCRIPT',
    ] as const;
    const [
      registrations,
      bunshins,
      activations,
      strategies,
      missions,
      activities,
      posts,
      feedback,
      aiUsage,
      learningProposals,
      learningApplications,
    ] = await Promise.all([
      this.client.workspaceMembership.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          user: { createdAt: occurred },
        },
        select: { userId: true, user: { select: { createdAt: true } } },
      }),
      this.client.bunshin.findMany({
        where: { workspaceId: input.workspaceId, createdAt: occurred },
        select: { ownerUserId: true },
      }),
      this.client.bunshinCapabilityAssignment.findMany({
        where: {
          workspaceId: input.workspaceId,
          capabilityType: 'SOCIAL',
          activatedAt: occurred,
        },
        select: { assignedByUserId: true },
      }),
      this.client.socialAccountStrategy.findMany({
        where: { workspaceId: input.workspaceId, createdAt: occurred },
        select: {
          status: true,
          approvedAt: true,
          bunshin: { select: { ownerUserId: true } },
        },
      }),
      this.client.dailyMission.findMany({
        where: { workspaceId: input.workspaceId, createdAt: occurred },
        select: { id: true, assistanceLevel: true },
      }),
      this.client.missionActivity.findMany({
        where: { workspaceId: input.workspaceId, occurredAt: occurred },
        select: {
          actorUserId: true,
          dailyMissionId: true,
          type: true,
          dailyMission: { select: { assistanceLevel: true } },
        },
      }),
      this.client.postRecord.findMany({
        where: { workspaceId: input.workspaceId, postedAt: occurred },
        select: {
          actorUserId: true,
          dailyMissionId: true,
          postedAt: true,
          dailyMission: { select: { assistanceLevel: true } },
        },
      }),
      this.client.missionFeedback.findMany({
        where: { workspaceId: input.workspaceId, createdAt: occurred },
        select: {
          actorUserId: true,
          dailyMissionId: true,
          rating: true,
          dailyMission: { select: { assistanceLevel: true } },
        },
      }),
      this.client.aiUsageEvent.findMany({
        where: { workspaceId: input.workspaceId, occurredAt: occurred },
        select: {
          status: true,
          inputTokens: true,
          outputTokens: true,
          estimatedCostUsdMicros: true,
        },
      }),
      this.client.personalityLearningProposal.findMany({
        where: { workspaceId: input.workspaceId, createdAt: occurred },
        select: { bunshinId: true, status: true, reason: true },
      }),
      this.client.personalityLearningProposal.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: { in: ['APPROVED', 'REVOKED'] },
          appliedVersion: { is: { createdAt: matureLearningApplication } },
        },
        select: { bunshinId: true, appliedVersion: { select: { createdAt: true } } },
        orderBy: { createdAt: 'asc' },
        take: 501,
      }),
    ]);

    const matureCohort = registrations.filter(
      ({ user }) => user.createdAt.getTime() + 8 * 24 * 60 * 60 * 1000 <= input.period.to.getTime(),
    );
    const cohortIds = matureCohort.map(({ userId }) => userId);
    const cohortActivity =
      cohortIds.length === 0
        ? []
        : await this.client.missionActivity.findMany({
            where: { workspaceId: input.workspaceId, actorUserId: { in: cohortIds } },
            select: { actorUserId: true, occurredAt: true },
          });
    const cohortPosts =
      cohortIds.length === 0
        ? []
        : await this.client.postRecord.findMany({
            where: { workspaceId: input.workspaceId, actorUserId: { in: cohortIds } },
            select: { actorUserId: true, postedAt: true },
          });
    const createdByUser = new Map(
      matureCohort.map((value) => [value.userId, value.user.createdAt]),
    );
    const d7Active = new Set<string>();
    const firstWeekPostCounts = new Map<string, number>();
    for (const activity of cohortActivity) {
      const createdAt = createdByUser.get(activity.actorUserId);
      if (
        createdAt &&
        activity.occurredAt >= new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000) &&
        activity.occurredAt < new Date(createdAt.getTime() + 8 * 24 * 60 * 60 * 1000)
      )
        d7Active.add(activity.actorUserId);
    }
    for (const post of cohortPosts) {
      const createdAt = createdByUser.get(post.actorUserId);
      if (!createdAt) continue;
      if (
        post.postedAt >= createdAt &&
        post.postedAt < new Date(createdAt.getTime() + 7 * 86400000)
      ) {
        firstWeekPostCounts.set(
          post.actorUserId,
          (firstWeekPostCounts.get(post.actorUserId) ?? 0) + 1,
        );
      }
      if (
        post.postedAt >= new Date(createdAt.getTime() + 7 * 86400000) &&
        post.postedAt < new Date(createdAt.getTime() + 8 * 86400000)
      )
        d7Active.add(post.actorUserId);
    }
    const threePostUsers = [...firstWeekPostCounts.values()].filter((value) => value >= 3).length;
    const goodFeedbackCount = feedback.filter(({ rating }) => rating === 'GOOD').length;
    const viewedUsers = activities
      .filter(({ type }) => type === 'VIEWED')
      .map(({ actorUserId }) => actorUserId);
    const acceptedUsers = activities
      .filter(({ type }) => type === 'ACCEPTED')
      .map(({ actorUserId }) => actorUserId);
    const copiedUsers = activities
      .filter(({ type }) => copyTypes.includes(type as (typeof copyTypes)[number]))
      .map(({ actorUserId }) => actorUserId);
    const approvedStrategyUsers = strategies
      .filter(
        ({ approvedAt }) =>
          approvedAt && approvedAt >= input.period.from && approvedAt < input.period.to,
      )
      .map(({ bunshin }) => bunshin.ownerUserId);
    const eligible = matureCohort.length;
    const pricedAiUsage = aiUsage.filter(
      ({ estimatedCostUsdMicros }) => estimatedCostUsdMicros !== null,
    );
    const assistanceLevels = summarizeAssistanceLevels({ missions, activities, posts, feedback });
    const personalityLearning = summarizePersonalityLearning(learningProposals);
    const learningCohort = learningApplications
      .slice(0, 500)
      .flatMap((application) =>
        application.appliedVersion
          ? [{ bunshinId: application.bunshinId, appliedAt: application.appliedVersion.createdAt }]
          : [],
      );
    const learningMissions =
      learningCohort.length === 0
        ? []
        : await this.client.dailyMission.findMany({
            where: {
              workspaceId: input.workspaceId,
              bunshinId: { in: [...new Set(learningCohort.map(({ bunshinId }) => bunshinId))] },
              createdAt: {
                gte: new Date(
                  Math.min(...learningCohort.map(({ appliedAt }) => appliedAt.getTime())) -
                    LEARNING_OUTCOME_WINDOW_MS,
                ),
                lt: new Date(
                  Math.max(...learningCohort.map(({ appliedAt }) => appliedAt.getTime())) +
                    LEARNING_OUTCOME_WINDOW_MS,
                ),
              },
            },
            select: {
              id: true,
              bunshinId: true,
              createdAt: true,
              postRecord: { select: { id: true } },
              feedback: { select: { rating: true } },
            },
            take: 50_001,
          });
    const learningOutcomes = summarizePersonalityLearningOutcomes(
      learningCohort,
      learningMissions.slice(0, 50_000).map((mission) => ({
        id: mission.id,
        bunshinId: mission.bunshinId,
        createdAt: mission.createdAt,
        posted: mission.postRecord !== null,
        rating: mission.feedback?.rating ?? null,
      })),
    );
    personalityLearning.applications = learningCohort.length;
    personalityLearning.cohortTruncated =
      learningApplications.length > 500 || learningMissions.length > 50_000;
    personalityLearning.before = learningOutcomes.before;
    personalityLearning.after = learningOutcomes.after;

    return {
      period: input.period,
      funnel: {
        registrations: uniqueCount(registrations.map(({ userId }) => userId)),
        bunshinCreations: uniqueCount(bunshins.map(({ ownerUserId }) => ownerUserId)),
        socialActivations: uniqueCount(activations.map(({ assignedByUserId }) => assignedByUserId)),
        strategyCompletions: uniqueCount(strategies.map(({ bunshin }) => bunshin.ownerUserId)),
        strategyApprovals: uniqueCount(approvedStrategyUsers),
        firstMissionViews: uniqueCount(viewedUsers),
        missionAcceptances: uniqueCount(acceptedUsers),
        copies: uniqueCount(copiedUsers),
        posts: uniqueCount(posts.map(({ actorUserId }) => actorUserId)),
        d7ActiveUsers: d7Active.size,
      },
      outcomes: {
        postedUsers: uniqueCount(posts.map(({ actorUserId }) => actorUserId)),
        postCount: posts.length,
        feedbackCount: feedback.length,
        goodFeedbackCount,
        goodFeedbackRate: rate(goodFeedbackCount, feedback.length),
        threePostsInFirstSevenDaysUsers: threePostUsers,
        eligibleFirstSevenDayUsers: eligible,
        threePostsInFirstSevenDaysRate: rate(threePostUsers, eligible),
        d7EligibleUsers: eligible,
        d7ActiveRate: rate(d7Active.size, eligible),
        aiCalls: aiUsage.length,
        aiSuccessfulCalls: aiUsage.filter(({ status }) => status === 'SUCCESS').length,
        aiFailedCalls: aiUsage.filter(({ status }) => status === 'FAILED').length,
        aiInputTokens: aiUsage.reduce((sum, value) => sum + (value.inputTokens ?? 0), 0),
        aiOutputTokens: aiUsage.reduce((sum, value) => sum + (value.outputTokens ?? 0), 0),
        aiPricedCalls: pricedAiUsage.length,
        aiEstimatedCostUsdMicros:
          pricedAiUsage.length === 0
            ? null
            : Number(
                pricedAiUsage.reduce(
                  (sum, value) => sum + (value.estimatedCostUsdMicros ?? 0n),
                  0n,
                ),
              ),
      },
      assistanceLevels,
      personalityLearning,
    };
  }
}

export class PrismaAiUsageEventRepository implements AiUsageEventRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async record(input: RecordAiUsageInput): Promise<void> {
    const accessible = input.bunshinId
      ? await this.client.bunshin.findFirst({
          where: {
            id: input.bunshinId,
            workspaceId: input.workspaceId,
            workspace: {
              memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
            },
          },
          select: { id: true },
        })
      : await this.client.workspaceMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
    if (accessible === null) throw new ApplicationError('NOT_FOUND', 'AI usage scope not found');
    await this.client.aiUsageEvent.upsert({
      where: {
        workspaceId_actorUserId_idempotencyKey: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
        taskType: input.taskType,
        provider: input.provider,
        model: input.model,
        promptVersion: input.promptVersion,
        status: input.status,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        latencyMs: input.latencyMs,
        idempotencyKey: input.idempotencyKey,
        estimatedCostUsdMicros:
          input.estimatedCostUsdMicros === undefined || input.estimatedCostUsdMicros === null
            ? null
            : BigInt(input.estimatedCostUsdMicros),
        pricingVersion: input.pricingVersion ?? null,
        errorCode: input.errorCode ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      },
      update: {},
    });
  }
}

export class PrismaOrganizationAiGenerationReservationRepository implements OrganizationAiGenerationReservationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async reserve(input: Parameters<OrganizationAiGenerationReservationRepository['reserve']>[0]) {
    const monthKey = `${input.now.getUTCFullYear()}-${String(input.now.getUTCMonth() + 1).padStart(2, '0')}`;
    return this.client.$transaction(
      async (tx) => {
        const entitlement = await tx.organizationEntitlement.findUnique({
          where: { workspaceId: input.workspaceId },
          select: {
            monthlyAiGenerationLimit: true,
            suspended: true,
            startsAt: true,
            endsAt: true,
          },
        });
        if (!entitlement || entitlement.monthlyAiGenerationLimit === null)
          return { status: 'UNLIMITED' as const, reservationId: null };
        if (
          entitlement.suspended ||
          (entitlement.startsAt && entitlement.startsAt > input.now) ||
          (entitlement.endsAt && entitlement.endsAt <= input.now)
        )
          return { status: 'EXHAUSTED' as const, reservationId: null };

        const existing = await tx.organizationAiGenerationReservation.findUnique({
          where: {
            workspaceId_operationKey: {
              workspaceId: input.workspaceId,
              operationKey: input.operationKey,
            },
          },
        });
        if (
          existing?.status === 'CONSUMED' ||
          (existing?.status === 'RESERVED' && existing.expiresAt > input.now)
        )
          return { status: 'ALREADY_RESERVED' as const, reservationId: existing.id };

        const used = await tx.organizationAiGenerationReservation.count({
          where: {
            workspaceId: input.workspaceId,
            monthKey,
            OR: [{ status: 'CONSUMED' }, { status: 'RESERVED', expiresAt: { gt: input.now } }],
          },
        });
        if (used >= entitlement.monthlyAiGenerationLimit)
          return { status: 'EXHAUSTED' as const, reservationId: null };

        const reserved = await tx.organizationAiGenerationReservation.upsert({
          where: {
            workspaceId_operationKey: {
              workspaceId: input.workspaceId,
              operationKey: input.operationKey,
            },
          },
          create: {
            workspaceId: input.workspaceId,
            monthKey,
            operationKey: input.operationKey,
            expiresAt: input.expiresAt,
          },
          update: {
            monthKey,
            status: 'RESERVED',
            expiresAt: input.expiresAt,
            consumedAt: null,
            releasedAt: null,
          },
          select: { id: true },
        });
        return { status: 'RESERVED' as const, reservationId: reserved.id };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async finish(input: Parameters<OrganizationAiGenerationReservationRepository['finish']>[0]) {
    const changed = await this.client.organizationAiGenerationReservation.updateMany({
      where: {
        workspaceId: input.workspaceId,
        operationKey: input.operationKey,
        status: 'RESERVED',
      },
      data:
        input.outcome === 'CONSUMED'
          ? { status: 'CONSUMED', consumedAt: input.now }
          : { status: 'RELEASED', releasedAt: input.now },
    });
    return changed.count === 1;
  }
}

function activityContinuityRule(
  row: Prisma.ActivityContinuityRuleGetPayload<object>,
): ActivityContinuityRule {
  return { ...row, badges: row.badgeRules as unknown as ActivityBadgeRule[] };
}

export class PrismaActivityContinuityRuleRepository implements ActivityContinuityRuleRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: Parameters<ActivityContinuityRuleRepository['list']>[0]) {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    return (
      await this.client.activityContinuityRule.findMany({
        where: { environment: input.environment },
        orderBy: { version: 'desc' },
      })
    ).map(activityContinuityRule);
  }

  async active(environment: Parameters<ActivityContinuityRuleRepository['active']>[0]) {
    const row = await this.client.activityContinuityRule.findFirst({
      where: { environment, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    return row ? activityContinuityRule(row) : null;
  }

  async create(input: Parameters<ActivityContinuityRuleRepository['create']>[0]) {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!admin) return null;
      const latest = await tx.activityContinuityRule.findFirst({
        where: { environment: input.environment },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const row = await tx.activityContinuityRule.create({
        data: {
          environment: input.environment,
          version: (latest?.version ?? 0) + 1,
          weeklyGoal: input.weeklyGoal,
          dormancyDays: input.dormancyDays,
          stepBuildingDays: input.stepBuildingDays,
          stepContinuingDays: input.stepContinuingDays,
          stepEstablishedDays: input.stepEstablishedDays,
          badgeRules: input.badges as unknown as Prisma.InputJsonValue,
          changeReason: input.changeReason,
          activationReason: null,
          createdByUserId: input.actorUserId,
        },
      });
      return activityContinuityRule(row);
    });
  }

  async activate(input: Parameters<ActivityContinuityRuleRepository['activate']>[0]) {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!admin) return null;
      const target = await tx.activityContinuityRule.findFirst({
        where: { id: input.ruleId, environment: input.environment, status: 'DRAFT' },
      });
      if (!target) return null;
      const now = new Date();
      await tx.activityContinuityRule.updateMany({
        where: { environment: input.environment, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED', supersededAt: now },
      });
      const row = await tx.activityContinuityRule.update({
        where: { id: target.id },
        data: {
          status: 'ACTIVE',
          activatedAt: now,
          activatedByUserId: input.actorUserId,
          activationReason: input.reason,
        },
      });
      return activityContinuityRule(row);
    });
  }
}

const adminUserSelect = {
  id: true,
  displayName: true,
  email: true,
  status: true,
  createdAt: true,
  identities: { select: { provider: true } },
  memberships: {
    select: { role: true, status: true, workspace: { select: { id: true, name: true } } },
  },
  groupMemberships: {
    where: { status: 'ACTIVE' },
    select: { groupId: true, group: { select: { name: true } } },
  },
  activityMetricExclusionsAsTarget: {
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    select: { environment: true, action: true, occurredAt: true },
  },
  bunshins: {
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      capabilityAssignments: {
        where: { capabilityType: 'SOCIAL', status: 'ACTIVE' },
        select: { id: true },
      },
      socialAccountStrategies: {
        where: { status: 'APPROVED' },
        select: { id: true },
      },
    },
  },
  missionActivities: {
    orderBy: { occurredAt: 'desc' },
    take: 50,
    select: { type: true, occurredAt: true },
  },
  postRecords: {
    orderBy: { postedAt: 'desc' },
    take: 50,
    select: { postedAt: true },
  },
  aiUsageEvents: {
    orderBy: { occurredAt: 'desc' },
    take: 50,
    select: { status: true, occurredAt: true, estimatedCostUsdMicros: true, errorCode: true },
  },
  lineConnections: {
    select: { environment: true, status: true, friendshipStatus: true, updatedAt: true },
  },
  accountDeletionRequests: {
    where: { status: { in: ['REQUESTED', 'PROCESSING', 'BLOCKED'] } },
    select: { id: true },
  },
  _count: { select: { postRecords: true, aiUsageEvents: true } },
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;
const copyActivityTypes = new Set([
  'COPIED_TEXT',
  'COPIED_SLIDE',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SCRIPT',
]);

function adminUserSummary(
  row: AdminUserRow,
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION',
  now = new Date(),
): AdminUserSummary {
  const activityTypes = new Set(row.missionActivities.map(({ type }) => type));
  let stage: AdminUserStage = 'REGISTERED';
  if (row.bunshins.length > 0) stage = 'BUNSHIN_CREATED';
  if (row.bunshins.some(({ capabilityAssignments }) => capabilityAssignments.length > 0))
    stage = 'SOCIAL_ACTIVATED';
  if (row.bunshins.some(({ socialAccountStrategies }) => socialAccountStrategies.length > 0))
    stage = 'STRATEGY_APPROVED';
  if (activityTypes.has('VIEWED')) stage = 'MISSION_VIEWED';
  if (activityTypes.has('ACCEPTED')) stage = 'MISSION_ACCEPTED';
  if ([...activityTypes].some((type) => copyActivityTypes.has(type))) stage = 'COPIED';
  if (row.postRecords.length > 0) stage = 'POSTED';

  const lineConnections = row.lineConnections.filter((item) => item.environment === environment);
  const activityDates = [
    row.createdAt,
    ...row.missionActivities.map(({ occurredAt }) => occurredAt),
    ...row.postRecords.map(({ postedAt }) => postedAt),
    ...row.aiUsageEvents.map(({ occurredAt }) => occurredAt),
    ...lineConnections.map(({ updatedAt }) => updatedAt),
  ];
  const lastActiveAt = new Date(Math.max(...activityDates.map((value) => value.getTime())));
  const deletionPending = row.accountDeletionRequests.length > 0;
  const latestMetricAction = row.activityMetricExclusionsAsTarget.find(
    (item) => item.environment === environment,
  );
  let attentionReason: string | null = null;
  if (row.status !== 'ACTIVE') attentionReason = '利用停止・退会済み';
  else if (deletionPending) attentionReason = '退会処理待ち';
  else if (row.bunshins.length === 0 && now.getTime() - row.createdAt.getTime() >= 86_400_000)
    attentionReason = '投稿パートナーが未作成';
  else if (now.getTime() - lastActiveAt.getTime() >= 7 * 86_400_000)
    attentionReason = '7日以上利用がありません';
  else if (row.aiUsageEvents.filter(({ status }) => status === 'FAILED').length >= 3)
    attentionReason = 'AI処理が繰り返し失敗';

  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    status: row.status,
    createdAt: row.createdAt,
    authProviders: [...new Set(row.identities.map(({ provider }) => provider))],
    bunshinCount: row.bunshins.length,
    postCount: row._count.postRecords,
    aiCalls: row._count.aiUsageEvents,
    aiFailedCalls: row.aiUsageEvents.filter(({ status }) => status === 'FAILED').length,
    lineConnected: lineConnections.some(({ status }) => status === 'ACTIVE'),
    lineFollowing: lineConnections.some(({ friendshipStatus }) => friendshipStatus === 'FOLLOWING'),
    deletionPending,
    lastActiveAt,
    stage,
    attentionReason,
    excludedFromMetrics: latestMetricAction?.action === 'EXCLUDED',
    periodConfirmations: 0,
    periodPosts: 0,
  };
}

export class PrismaAdminOperationsRepository implements AdminOperationsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async authorized(actorUserId: string) {
    return Boolean(
      await this.client.platformAdmin.findFirst({
        where: { userId: actorUserId, status: 'ACTIVE' },
        select: { id: true },
      }),
    );
  }

  async snapshot(
    input: Parameters<AdminOperationsRepository['snapshot']>[0],
  ): Promise<AdminOperationsSnapshot | null> {
    if (!(await this.authorized(input.actorUserId))) return null;
    const exclusionHistory = await this.client.activityMetricExclusion.findMany({
      where: { environment: input.environment },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: { targetUserId: true, action: true },
    });
    const latestExclusion = new Map<string, 'EXCLUDED' | 'INCLUDED'>();
    for (const item of exclusionHistory) {
      if (!latestExclusion.has(item.targetUserId))
        latestExclusion.set(item.targetUserId, item.action);
    }
    const excludedUserIds = [...latestExclusion]
      .filter(([, action]) => action === 'EXCLUDED')
      .map(([userId]) => userId);
    const eligibleUser = excludedUserIds.length ? { id: { notIn: excludedUserIds } } : {};
    const search = input.query
      ? {
          OR: [
            { displayName: { contains: input.query, mode: Prisma.QueryMode.insensitive } },
            { email: { contains: input.query, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {};
    const period = { gte: input.from, lt: input.to };
    const [
      rows,
      cohortRows,
      users,
      activeUsers,
      periodPosts,
      periodAi,
      lineUsers,
      deletionUsers,
      lineSent,
      lineFailed,
      supportCasesCreated,
      supportCasesResolved,
      periodConfirmations,
      groupRows,
      latestActivity,
      latestPost,
    ] = await Promise.all([
      this.client.user.findMany({
        where: search,
        select: adminUserSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
      }),
      this.client.user.findMany({
        where: { createdAt: period, ...eligibleUser },
        select: {
          ...adminUserSelect,
          missionActivities: {
            ...adminUserSelect.missionActivities,
            where: { occurredAt: { lt: input.to } },
          },
          postRecords: {
            ...adminUserSelect.postRecords,
            where: { postedAt: { lt: input.to } },
          },
          aiUsageEvents: {
            ...adminUserSelect.aiUsageEvents,
            where: { occurredAt: { lt: input.to } },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 5001,
      }),
      this.client.user.count({ where: eligibleUser }),
      this.client.user.count({ where: { status: 'ACTIVE', ...eligibleUser } }),
      this.client.postRecord.groupBy({
        by: ['actorUserId'],
        where: { postedAt: period, actorUserId: { notIn: excludedUserIds } },
        _count: { _all: true },
      }),
      this.client.aiUsageEvent.findMany({
        where: { occurredAt: period, actorUserId: { notIn: excludedUserIds } },
        select: { status: true, estimatedCostUsdMicros: true },
      }),
      this.client.lineConnection.findMany({
        where: {
          environment: input.environment,
          status: 'ACTIVE',
          userId: { notIn: excludedUserIds },
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.client.accountDeletionRequest.findMany({
        where: { status: { in: ['REQUESTED', 'PROCESSING', 'BLOCKED'] } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.client.lineMessageDelivery.count({
        where: { environment: input.environment, status: 'SENT', sentAt: period },
      }),
      this.client.lineMessageDeliveryAttempt.count({
        where: {
          delivery: { environment: input.environment },
          status: 'FAILED',
          attemptedAt: period,
        },
      }),
      this.client.supportCase.count({ where: { createdAt: period } }),
      this.client.supportCase.count({ where: { status: 'RESOLVED', resolvedAt: period } }),
      this.client.missionActivity.groupBy({
        by: ['actorUserId'],
        where: {
          occurredAt: period,
          type: 'CONFIRMED',
          actorUserId: { notIn: excludedUserIds },
        },
        _count: { _all: true },
      }),
      this.client.group.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          memberships: {
            where: { status: 'ACTIVE', userId: { notIn: excludedUserIds } },
            select: { userId: true },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 1_000,
      }),
      this.client.missionActivity.findFirst({
        where: { actorUserId: { notIn: excludedUserIds } },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      }),
      this.client.postRecord.findFirst({
        where: { actorUserId: { notIn: excludedUserIds } },
        orderBy: { postedAt: 'desc' },
        select: { postedAt: true },
      }),
    ]);
    const confirmationCount = new Map<string, number>();
    const postCount = new Map<string, number>();
    for (const item of periodConfirmations)
      confirmationCount.set(item.actorUserId, item._count._all);
    for (const item of periodPosts) postCount.set(item.actorUserId, item._count._all);
    const visible = rows.slice(0, input.limit).map((row) => ({
      ...adminUserSummary(row, input.environment),
      periodConfirmations: confirmationCount.get(row.id) ?? 0,
      periodPosts: postCount.get(row.id) ?? 0,
    }));
    const cohort = cohortRows.slice(0, 5000).map((row) => adminUserSummary(row, input.environment));
    const cohortCreatedAt = new Map(
      cohortRows.slice(0, 5000).map((row) => [row.id, row.createdAt]),
    );
    const d1EligibleIds = [...cohortCreatedAt]
      .filter(([, createdAt]) => createdAt.getTime() + 2 * 86_400_000 <= input.to.getTime())
      .map(([id]) => id);
    const d7EligibleIds = [...cohortCreatedAt]
      .filter(([, createdAt]) => createdAt.getTime() + 8 * 86_400_000 <= input.to.getTime())
      .map(([id]) => id);
    const firstWeekEligibleIds = [...cohortCreatedAt]
      .filter(([, createdAt]) => createdAt.getTime() + 7 * 86_400_000 <= input.to.getTime())
      .map(([id]) => id);
    const retentionIds = [
      ...new Set([...d1EligibleIds, ...d7EligibleIds, ...firstWeekEligibleIds]),
    ];
    const [retentionActivities, retentionPosts] = retentionIds.length
      ? await Promise.all([
          this.client.missionActivity.findMany({
            where: { actorUserId: { in: retentionIds }, occurredAt: { lt: input.to } },
            select: { actorUserId: true, occurredAt: true },
          }),
          this.client.postRecord.findMany({
            where: { actorUserId: { in: retentionIds }, postedAt: { lt: input.to } },
            select: { actorUserId: true, postedAt: true },
          }),
        ])
      : [[], []];
    const retention = calculateAdminRetention({
      cohort: [...cohortCreatedAt].map(([userId, createdAt]) => ({ userId, createdAt })),
      activities: [
        ...retentionActivities.map((item) => ({
          userId: item.actorUserId,
          occurredAt: item.occurredAt,
        })),
        ...retentionPosts.map((item) => ({ userId: item.actorUserId, occurredAt: item.postedAt })),
      ],
      periodEnd: input.to,
    });
    const firstWeekPosting = calculateFirstWeekThreePostKpi({
      cohort: [...cohortCreatedAt].map(([userId, createdAt]) => ({ userId, createdAt })),
      posts: retentionPosts.map((item) => ({
        userId: item.actorUserId,
        postedAt: item.postedAt,
      })),
      periodEnd: input.to,
    });
    const stageIndex = new Map<AdminUserStage, number>([
      ['REGISTERED', 0],
      ['BUNSHIN_CREATED', 1],
      ['SOCIAL_ACTIVATED', 2],
      ['STRATEGY_APPROVED', 3],
      ['MISSION_VIEWED', 4],
      ['MISSION_ACCEPTED', 5],
      ['COPIED', 6],
      ['POSTED', 7],
    ]);
    const stages = [...stageIndex.keys()];
    const funnel = Object.fromEntries(
      stages.map((stage) => [
        stage,
        cohort.filter((user) => stageIndex.get(user.stage)! >= stageIndex.get(stage)!).length,
      ]),
    ) as Record<AdminUserStage, number>;
    const priced = periodAi.filter(({ estimatedCostUsdMicros }) => estimatedCostUsdMicros !== null);
    return {
      period: { from: input.from, to: input.to },
      totals: {
        users,
        activeUsers,
        newUsers: cohortRows.length,
        posts: [...postCount.values()].reduce((sum, count) => sum + count, 0),
        aiCalls: periodAi.length,
        aiFailedCalls: periodAi.filter(({ status }) => status === 'FAILED').length,
        estimatedAiCostUsdMicros:
          priced.length === 0
            ? null
            : Number(priced.reduce((sum, item) => sum + (item.estimatedCostUsdMicros ?? 0n), 0n)),
        lineConnectedUsers: lineUsers.length,
        attentionUsers: visible.filter(({ attentionReason }) => attentionReason !== null).length,
        deletionPendingUsers: deletionUsers.length,
        lineSent,
        lineFailed,
        supportCasesCreated,
        supportCasesResolved,
        excludedUsers: excludedUserIds.length,
      },
      funnel,
      retention: { ...retention, ...firstWeekPosting },
      users: visible,
      groups: groupRows.map((group) => {
        const memberIds = new Set(group.memberships.map(({ userId }) => userId));
        const confirmations = periodConfirmations.filter((item) => memberIds.has(item.actorUserId));
        const posts = periodPosts.filter((item) => memberIds.has(item.actorUserId));
        return {
          id: group.id,
          name: group.name,
          activeMembers: memberIds.size,
          eligibleMembers: memberIds.size,
          activeMembersInPeriod: new Set([
            ...confirmations.map(({ actorUserId }) => actorUserId),
            ...posts.map(({ actorUserId }) => actorUserId),
          ]).size,
          confirmations: confirmations.reduce((sum, item) => sum + item._count._all, 0),
          posts: posts.reduce((sum, item) => sum + item._count._all, 0),
        };
      }),
      monitoring: {
        latestActivityAt: latestActivity?.occurredAt ?? null,
        latestPostAt: latestPost?.postedAt ?? null,
        usersInactiveForSevenDays: visible.filter(
          (user) =>
            !user.excludedFromMetrics &&
            user.status === 'ACTIVE' &&
            user.lastActiveAt !== null &&
            input.to.getTime() - user.lastActiveAt.getTime() >= 7 * 86_400_000,
        ).length,
        cohortTruncated: cohortRows.length > 5000,
      },
      truncated: rows.length > input.limit || cohortRows.length > 5000,
    };
  }

  async userDetail(
    input: Parameters<AdminOperationsRepository['userDetail']>[0],
  ): Promise<AdminUserDetail | null> {
    if (!(await this.authorized(input.actorUserId))) return null;
    const [row, operationAudits, metricExclusionAudits, supportCases] = await Promise.all([
      this.client.user.findUnique({
        where: { id: input.userId },
        select: adminUserSelect,
      }),
      this.client.userOperationAudit.findMany({
        where: { targetUserId: input.userId },
        include: { actor: { select: { displayName: true } } },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      }),
      this.client.activityMetricExclusion.findMany({
        where: { targetUserId: input.userId },
        include: { actor: { select: { displayName: true } } },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
      this.client.supportCase.findMany({
        where: { targetUserId: input.userId },
        include: {
          assignee: { select: { displayName: true } },
          notes: {
            include: { author: { select: { displayName: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        take: 50,
      }),
    ]);
    if (!row) return null;
    const timeline = [
      ...row.missionActivities.map((item) => ({
        type: item.type,
        occurredAt: item.occurredAt,
        label: `投稿案：${item.type}`,
        outcome: 'INFO' as const,
      })),
      ...row.postRecords.map((item) => ({
        type: 'POSTED',
        occurredAt: item.postedAt,
        label: '投稿完了',
        outcome: 'SUCCESS' as const,
      })),
      ...row.aiUsageEvents.map((item) => ({
        type: 'AI',
        occurredAt: item.occurredAt,
        label:
          item.status === 'SUCCESS'
            ? 'AI処理成功'
            : `AI処理失敗（${item.errorCode ?? '原因不明'}）`,
        outcome: item.status,
      })),
    ]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 50);
    return {
      user: adminUserSummary(row, input.environment),
      workspaces: row.memberships.map((item) => ({
        id: item.workspace.id,
        name: item.workspace.name,
        role: item.role,
        status: item.status,
      })),
      bunshins: row.bunshins.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        createdAt: item.createdAt,
      })),
      timeline,
      operationAudits: operationAudits.map((audit) => ({
        id: audit.id,
        action: audit.action,
        previousStatus: audit.previousStatus,
        nextStatus: audit.nextStatus,
        reason: audit.reason,
        actorDisplayName: audit.actor.displayName,
        occurredAt: audit.occurredAt,
      })),
      metricExclusionAudits: metricExclusionAudits.map((audit) => ({
        id: audit.id,
        action: audit.action,
        environment: audit.environment,
        reason: audit.reason,
        actorDisplayName: audit.actor.displayName,
        occurredAt: audit.occurredAt,
      })),
      supportCases: supportCases.map((supportCase) => ({
        id: supportCase.id,
        subject: supportCase.subject,
        status: supportCase.status,
        priority: supportCase.priority,
        assigneeUserId: supportCase.assigneeUserId,
        assigneeDisplayName: supportCase.assignee?.displayName ?? null,
        createdAt: supportCase.createdAt,
        updatedAt: supportCase.updatedAt,
        resolvedAt: supportCase.resolvedAt,
        notes: supportCase.notes.map((note) => ({
          id: note.id,
          content: note.content,
          authorDisplayName: note.author.displayName,
          createdAt: note.createdAt,
        })),
      })),
    };
  }

  async setUserStatus(
    input: Parameters<AdminOperationsRepository['setUserStatus']>[0],
  ): Promise<boolean | null> {
    return this.client.$transaction(async (tx) => {
      const actor = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!actor) return null;
      const target = await tx.user.findUnique({
        where: { id: input.userId },
        include: { platformAdmin: { select: { status: true } } },
      });
      if (!target) return null;
      if (
        target.status === 'DELETED' ||
        target.status === input.status ||
        target.platformAdmin?.status === 'ACTIVE'
      )
        return false;
      await tx.user.update({ where: { id: target.id }, data: { status: input.status } });
      if (input.status === 'SUSPENDED') {
        await tx.lineNotificationPreference.updateMany({
          where: { userId: target.id, enabled: true },
          data: { enabled: false },
        });
      }
      await tx.userOperationAudit.create({
        data: {
          targetUserId: target.id,
          actorUserId: input.actorUserId,
          action: input.status === 'SUSPENDED' ? 'SUSPENDED' : 'REACTIVATED',
          previousStatus: target.status,
          nextStatus: input.status,
          reason: input.reason,
        },
      });
      return true;
    });
  }

  async setMetricExclusion(
    input: Parameters<AdminOperationsRepository['setMetricExclusion']>[0],
  ): Promise<boolean | null> {
    return this.client.$transaction(async (tx) => {
      const actor = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!actor) return null;
      const target = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });
      if (!target) return null;
      const latest = await tx.activityMetricExclusion.findFirst({
        where: { targetUserId: target.id, environment: input.environment },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: { action: true },
      });
      const nextAction = input.excluded ? 'EXCLUDED' : 'INCLUDED';
      if ((latest?.action ?? 'INCLUDED') === nextAction) return false;
      await tx.activityMetricExclusion.create({
        data: {
          targetUserId: target.id,
          actorUserId: input.actorUserId,
          environment: input.environment,
          action: nextAction,
          reason: input.reason,
        },
      });
      return true;
    });
  }

  async createSupportCase(
    input: Parameters<AdminOperationsRepository['createSupportCase']>[0],
  ): Promise<boolean | null> {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT'] },
        },
        select: { id: true },
      });
      if (!admin) return false;
      if (!(await tx.user.findUnique({ where: { id: input.userId }, select: { id: true } })))
        return null;
      await tx.supportCase.create({
        data: {
          targetUserId: input.userId,
          createdByUserId: input.actorUserId,
          assigneeUserId: input.actorUserId,
          subject: input.subject,
          priority: input.priority,
          notes: { create: { authorUserId: input.actorUserId, content: input.note } },
        },
      });
      return true;
    });
  }

  async updateSupportCase(
    input: Parameters<AdminOperationsRepository['updateSupportCase']>[0],
  ): Promise<boolean | null> {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT'] },
        },
        select: { id: true },
      });
      if (!admin) return false;
      const supportCase = await tx.supportCase.findFirst({
        where: { id: input.supportCaseId, targetUserId: input.userId },
        select: { id: true },
      });
      if (!supportCase) return null;
      if (input.assigneeUserId) {
        const assignee = await tx.platformAdmin.findFirst({
          where: { userId: input.assigneeUserId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!assignee) return false;
      }
      await tx.supportCase.update({
        where: { id: supportCase.id },
        data: {
          status: input.status,
          priority: input.priority,
          assigneeUserId: input.assigneeUserId,
          resolvedAt: input.status === 'RESOLVED' ? new Date() : null,
          notes: { create: { authorUserId: input.actorUserId, content: input.note } },
        },
      });
      return true;
    });
  }

  async listSupportCases(input: Parameters<AdminOperationsRepository['listSupportCases']>[0]) {
    if (!(await this.authorized(input.actorUserId))) return null;
    return (
      await this.client.supportCase.findMany({
        where: input.status ? { status: input.status } : {},
        include: {
          target: { select: { displayName: true, email: true } },
          assignee: { select: { displayName: true } },
        },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: 200,
      })
    ).map((item) => ({
      id: item.id,
      targetUserId: item.targetUserId,
      targetDisplayName: item.target.displayName,
      targetEmail: item.target.email,
      subject: item.subject,
      status: item.status,
      priority: item.priority,
      assigneeDisplayName: item.assignee?.displayName ?? null,
      updatedAt: item.updatedAt,
    }));
  }
}

export class PrismaAdminAlertRepository implements AdminAlertRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async snapshot(
    input: Parameters<AdminAlertRepository['snapshot']>[0],
  ): Promise<AdminAlertSnapshot | null> {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    const [
      configurations,
      lineConfiguration,
      lineNotificationTargets,
      failedDeliveries,
      lineJobs,
      otherDeadJobs,
      failedPointProcessing,
      stalePointProcessing,
      failedBadgeProcessing,
      staleBadgeProcessing,
      stoppedPointServices,
      blockedDeletions,
      openSupportCases,
      urgentSupportCases,
    ] = await Promise.all([
      this.client.aiProviderConfiguration.findMany({
        where: { environment: input.environment, status: 'ACTIVE' },
        orderBy: { provider: 'asc' },
      }),
      this.client.lineChannelConfiguration.findFirst({
        where: { environment: input.environment, status: 'ACTIVE' },
      }),
      this.client.lineNotificationPreference.findMany({
        where: {
          enabled: true,
          notificationConsentAt: { not: null },
          workspace: { status: 'ACTIVE' },
          user: { status: 'ACTIVE', memberships: { some: { status: 'ACTIVE' } } },
          bunshin: { status: { not: 'ARCHIVED' } },
        },
        select: { bunshin: { select: { groupId: true } } },
      }),
      this.client.lineMessageDelivery.count({
        where: { environment: input.environment, status: 'FAILED' },
      }),
      this.client.job.groupBy({
        by: ['status'],
        where: {
          environment: input.environment,
          jobType: { in: ['LINE_MISSION_DELIVER', 'BADGE_LINE_DELIVER'] },
          status: { in: ['RETRY_SCHEDULED', 'DEAD'] },
        },
        _count: { _all: true },
      }),
      this.client.job.count({
        where: {
          environment: input.environment,
          jobType: { notIn: ['LINE_MISSION_DELIVER', 'BADGE_LINE_DELIVER'] },
          status: 'DEAD',
        },
      }),
      this.client.pointProcessingEvent.count({
        where: {
          status: 'FAILED',
          workspace: { status: 'ACTIVE' },
          user: { status: 'ACTIVE' },
        },
      }),
      this.client.pointProcessingEvent.count({
        where: {
          status: 'PROCESSING',
          updatedAt: { lt: new Date(input.now.getTime() - 10 * 60 * 1000) },
          workspace: { status: 'ACTIVE' },
          user: { status: 'ACTIVE' },
        },
      }),
      this.client.badgeProcessingEvent.count({
        where: {
          status: 'FAILED',
          workspace: { status: 'ACTIVE' },
          user: { status: 'ACTIVE' },
        },
      }),
      this.client.badgeProcessingEvent.count({
        where: {
          status: 'PROCESSING',
          updatedAt: { lt: new Date(input.now.getTime() - 10 * 60 * 1000) },
          workspace: { status: 'ACTIVE' },
          user: { status: 'ACTIVE' },
        },
      }),
      this.client.serviceConfiguration.count({
        where: { pointIssuanceStopped: true, group: { status: 'ACTIVE' } },
      }),
      this.client.accountDeletionRequest.count({ where: { status: 'BLOCKED' } }),
      this.client.supportCase.count({ where: { status: 'OPEN' } }),
      this.client.supportCase.count({ where: { status: 'OPEN', priority: 'URGENT' } }),
    ]);
    const targetGroupIds = [
      ...new Set(
        lineNotificationTargets.flatMap(({ bunshin }) =>
          bunshin.groupId === null ? [] : [bunshin.groupId],
        ),
      ),
    ];
    const groupRoutingPolicies =
      targetGroupIds.length === 0
        ? []
        : await this.client.groupLineRoutingPolicy.findMany({
            where: {
              environment: input.environment,
              groupId: { in: targetGroupIds },
            },
            select: { groupId: true, mode: true },
          });
    const groupRoutingModes = new Map(
      groupRoutingPolicies.map(({ groupId, mode }) => [groupId, mode]),
    );
    const sharedLineRequired = lineNotificationTargets.some(({ bunshin }) => {
      if (bunshin.groupId === null) return true;
      return (groupRoutingModes.get(bunshin.groupId) ?? 'SHARED') === 'SHARED';
    });
    const safeNumber = (value: bigint | null) =>
      value === null
        ? 0
        : Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : value);
    const ai = await Promise.all(
      configurations.map(async (configuration) => {
        const provider = configuration.provider.toLowerCase();
        const [daily, monthly, recentFailures] = await Promise.all([
          this.client.aiUsageEvent.aggregate({
            where: { provider, occurredAt: { gte: input.dailyFrom, lt: input.now } },
            _sum: { estimatedCostUsdMicros: true },
          }),
          this.client.aiUsageEvent.aggregate({
            where: { provider, occurredAt: { gte: input.monthlyFrom, lt: input.now } },
            _sum: { estimatedCostUsdMicros: true },
          }),
          this.client.aiUsageEvent.count({
            where: {
              provider,
              status: 'FAILED',
              occurredAt: { gte: input.recentFrom, lt: input.now },
            },
          }),
        ]);
        return {
          provider: configuration.provider,
          globallyPaused: configuration.globallyPaused,
          lastErrorCategory: configuration.lastErrorCategory,
          dailyBudgetUsdMicros: Number(configuration.dailyBudgetUsdMicros),
          monthlyBudgetUsdMicros: Number(configuration.monthlyBudgetUsdMicros),
          dailySpentUsdMicros: safeNumber(daily._sum.estimatedCostUsdMicros),
          monthlySpentUsdMicros: safeNumber(monthly._sum.estimatedCostUsdMicros),
          recentFailures,
        };
      }),
    );
    const lineJobCount = (status: 'RETRY_SCHEDULED' | 'DEAD') =>
      lineJobs.find((item) => item.status === status)?._count._all ?? 0;
    return {
      ai,
      line: {
        required: sharedLineRequired,
        active: Boolean(lineConfiguration),
        verified: Boolean(
          lineConfiguration?.lastVerifiedAt && !lineConfiguration.lastErrorCategory,
        ),
        globallyPaused: lineConfiguration?.globallyPaused ?? false,
        failedDeliveries,
        retryScheduledJobs: lineJobCount('RETRY_SCHEDULED'),
        deadJobs: lineJobCount('DEAD'),
      },
      otherDeadJobs,
      rewards: {
        failedPointProcessing,
        stalePointProcessing,
        failedBadgeProcessing,
        staleBadgeProcessing,
        stoppedServices: stoppedPointServices,
      },
      blockedDeletions,
      openSupportCases,
      urgentSupportCases,
    };
  }
}

function productionGateEvidence(row: {
  id: string;
  environment: string;
  checkKey: string;
  commitSha: string;
  action: string;
  reason: string;
  evidenceUrl: string | null;
  actorUserId: string;
  occurredAt: Date;
}): ProductionGateEvidence {
  return row as ProductionGateEvidence;
}

export class PrismaProductionGateEvidenceRepository implements ProductionGateEvidenceRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: {
    actorUserId: string;
    environment: 'PRODUCTION';
    commitSha: string;
  }): Promise<ProductionGateEvidence[] | null> {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    const rows = await this.client.productionGateEvidence.findMany({
      where: { environment: input.environment, commitSha: input.commitSha },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map(productionGateEvidence);
  }

  async append(
    input: Omit<ProductionGateEvidence, 'id' | 'occurredAt'>,
  ): Promise<ProductionGateEvidence | null> {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!admin) return null;
      if (input.checkKey === 'FINAL_APPROVAL' && input.action === 'RECORDED') {
        const rows = await tx.productionGateEvidence.findMany({
          where: { environment: input.environment, commitSha: input.commitSha },
          orderBy: { occurredAt: 'asc' },
          select: { checkKey: true, action: true },
        });
        const latest = new Map(rows.map((row) => [row.checkKey, row.action]));
        if (!PRODUCTION_GATE_REQUIRED_CHECK_KEYS.every((key) => latest.get(key) === 'RECORDED'))
          return null;
      }
      return productionGateEvidence(await tx.productionGateEvidence.create({ data: input }));
    });
  }
}

export class PrismaTrendOperationsRepository implements TrendOperationsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async snapshot(
    input: Parameters<TrendOperationsRepository['snapshot']>[0],
  ): Promise<TrendOperationsSnapshot | null> {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    const period = { gte: input.from, lt: input.to };
    const runPeriod = { createdAt: period };
    const missionPeriod = { createdAt: period };
    const [
      runs,
      candidates,
      evidence,
      attributed,
      decisions,
      copied,
      posted,
      benchmarkCosts,
      trendUsage,
    ] = await Promise.all([
      this.client.trendResearchRun.findMany({
        where: runPeriod,
        select: { status: true, providerKey: true, failureCategory: true },
      }),
      this.client.trendIdeaCandidate.findMany({
        where: { researchRun: { is: runPeriod } },
        select: { status: true, safetyStatus: true, freshnessScore: true },
      }),
      this.client.trendEvidence.findMany({
        where: { researchRun: { is: runPeriod } },
        select: { status: true, expiresAt: true },
      }),
      this.client.missionTrendContext.count({ where: missionPeriod }),
      this.client.missionDecision.findMany({
        where: {
          decidedAt: { lt: input.to },
          dailyMission: { is: { trendContext: { is: missionPeriod } } },
        },
        select: { decision: true },
      }),
      this.client.missionActivity.findMany({
        where: {
          occurredAt: { lt: input.to },
          type: {
            in: [
              'COPIED_TEXT',
              'COPIED_SLIDE',
              'COPIED_IMAGE_INSTRUCTION',
              'COPIED_VIDEO_PROMPT',
              'COPIED_SCRIPT',
            ],
          },
          dailyMission: { is: { trendContext: { is: missionPeriod } } },
        },
        distinct: ['dailyMissionId'],
        select: { dailyMissionId: true },
      }),
      this.client.postRecord.count({
        where: {
          postedAt: { lt: input.to },
          dailyMission: { is: { trendContext: { is: missionPeriod } } },
        },
      }),
      this.client.trendProviderBenchmarkObservation.findMany({
        where: { benchmarkCase: { is: { environment: input.environment, active: true } } },
        select: { costUsdMicros: true },
      }),
      this.client.aiUsageEvent.findMany({
        where: { taskType: 'TREND_RESEARCH', occurredAt: period },
        select: {
          status: true,
          provider: true,
          errorCode: true,
          estimatedCostUsdMicros: true,
        },
      }),
    ]);
    const providerMap = new Map<string, { runs: number; failed: number }>();
    const failureMap = new Map<string, number>();
    for (const run of runs) {
      const provider = providerMap.get(run.providerKey) ?? { runs: 0, failed: 0 };
      provider.runs += 1;
      if (run.status === 'FAILED') provider.failed += 1;
      providerMap.set(run.providerKey, provider);
      if (run.status === 'FAILED') {
        const category = run.failureCategory ?? '原因未分類';
        failureMap.set(category, (failureMap.get(category) ?? 0) + 1);
      }
    }
    for (const usage of trendUsage.filter(({ status }) => status === 'FAILED')) {
      const provider = providerMap.get(usage.provider) ?? { runs: 0, failed: 0 };
      provider.runs += 1;
      provider.failed += 1;
      providerMap.set(usage.provider, provider);
      const category = usage.errorCode ?? '原因未分類';
      failureMap.set(category, (failureMap.get(category) ?? 0) + 1);
    }
    const freshnessTotal = candidates.reduce((sum, value) => sum + value.freshnessScore, 0);
    const asOf = input.to < new Date() ? input.to : new Date();
    return {
      period: { from: input.from, to: input.to },
      research: {
        total: runs.length + trendUsage.filter(({ status }) => status === 'FAILED').length,
        completed: runs.filter(({ status }) => status === 'COMPLETED').length,
        failed:
          runs.filter(({ status }) => status === 'FAILED').length +
          trendUsage.filter(({ status }) => status === 'FAILED').length,
        expired: runs.filter(({ status }) => status === 'EXPIRED').length,
        failureCategories: [...failureMap.entries()]
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
      },
      candidates: {
        total: candidates.length,
        safe: candidates.filter(({ safetyStatus }) => safetyStatus === 'SAFE').length,
        selected: candidates.filter(({ status }) => status === 'SELECTED').length,
        averageFreshnessScore:
          candidates.length === 0 ? null : Math.round(freshnessTotal / candidates.length),
      },
      missions: {
        attributed,
        accepted: decisions.filter(({ decision }) => decision === 'ACCEPTED').length,
        rejected: decisions.filter(({ decision }) => decision === 'REJECTED').length,
        copied: copied.length,
        posted,
      },
      evidence: {
        total: evidence.length,
        available: evidence.filter(
          ({ status, expiresAt }) => status === 'ACTIVE' && expiresAt > asOf,
        ).length,
        expired: evidence.filter(
          ({ status, expiresAt }) => status === 'EXPIRED' || expiresAt <= asOf,
        ).length,
      },
      providers: [...providerMap.entries()]
        .map(([providerKey, value]) => ({ providerKey, ...value }))
        .sort((a, b) => a.providerKey.localeCompare(b.providerKey)),
      cost: {
        measuredUsdMicros: trendUsage.some(
          ({ estimatedCostUsdMicros }) => estimatedCostUsdMicros !== null,
        )
          ? Number(
              trendUsage.reduce((sum, value) => sum + (value.estimatedCostUsdMicros ?? 0n), 0n),
            )
          : null,
        unpricedRuns: trendUsage.filter(
          ({ estimatedCostUsdMicros }) => estimatedCostUsdMicros === null,
        ).length,
        benchmarkAverageUsdMicros:
          benchmarkCosts.length === 0
            ? null
            : Math.round(
                benchmarkCosts.reduce((sum, value) => sum + value.costUsdMicros, 0) /
                  benchmarkCosts.length,
              ),
      },
    };
  }
}

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
