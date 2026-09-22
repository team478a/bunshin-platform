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
import { hasActiveRewardsPilotAccess } from './rewards-pilot-access';
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
  normalizePersonalityVersionContent,
  PRODUCTION_GATE_REQUIRED_CHECK_KEYS,
  applyPointRewardSettings,
} from '@bunshin/application';
import type {
  BunshinRepository,
  CreateBunshinInput,
  ScopedBunshinReference,
  UpdateBunshinInput,
  OwnerKnowledgeRepository,
  KnowledgeGrantRepository,
  BunshinMemoryRepository,
  BunshinCapabilityAssignmentRepository,
  BunshinCapabilityAssignment,
  ValidationMetricsRepository,
  ValidationMetricsSnapshot,
  AiUsageEventRepository,
  RecordAiUsageInput,
  OrganizationAiGenerationReservationRepository,
  LineConfigurationEnvironment,
  PersonalityLearningCandidateRepository,
  TrendResearchExpiryRepository,
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
  BunshinPersonalityVersion,
  PersonalityVersionContent,
  PersonalityVersionRepository,
  PersonalityVersionScope,
  PersonalityLearningProposal,
  PersonalityLearningProposalRepository,
  ActivityContinuityRule,
  ActivityContinuityRuleRepository,
  ActivityBadgeRule,
  PointLedgerRepository,
  PointAccountSnapshot,
  PointTransactionRecord,
  PointUserDashboard,
  PointActivityCandidate,
  PointActivityProcessorRepository,
  PointActivityProcessResult,
  PointRedemptionRepository,
  PointRedemptionRecord,
  PointRewardCatalogItemRecord,
  BadgeCoreRepository,
  BadgeDefinitionRecord,
  BadgeVersionRecord,
  BadgeProgressRecord,
  BadgeAwardRecord,
  BadgeProcessingEventRecord,
} from '@bunshin/application';
import {
  parsePreferredFormats,
  type SocialProfile,
  type SocialProfileRepository,
  type SocialAccountStrategy,
  type SocialAccountStrategyRepository,
  type TrendResearchRepository,
  type TrendResearchRun,
  type TrendIdeaCandidate,
} from '@bunshin/capability-social';
import type {
  BunshinAggregate,
  OwnerKnowledge,
  BunshinKnowledgeGrant,
  BunshinMemory,
} from '@bunshin/platform-domain';
import { canManageBunshin } from '@bunshin/platform-domain';
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
import { LATEST_DATABASE_MIGRATION } from './schema-readiness';
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
const bunshinRelations = {
  objectives: { orderBy: { priority: 'asc' as const } },
  audiences: { orderBy: { createdAt: 'asc' as const } },
  personality: true,
} satisfies Prisma.BunshinInclude;

type BunshinRow = Prisma.BunshinGetPayload<{ include: typeof bunshinRelations }>;

function stringArray(value: Prisma.JsonValue, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new ApplicationError('DATABASE_UNAVAILABLE', `${field} contains invalid persisted data`);
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new ApplicationError(
        'DATABASE_UNAVAILABLE',
        `${field} contains invalid persisted data`,
      );
    }
    result.push(item);
  }
  return result;
}

function bunshinAggregate(row: BunshinRow): BunshinAggregate {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    groupId: row.groupId,
    ownerUserId: row.ownerUserId,
    name: row.name,
    slug: row.slug,
    type: row.type,
    status: row.status,
    objectiveSummary: row.objectiveSummary,
    audienceSummary: row.audienceSummary,
    personalitySummary: row.personalitySummary,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    objectives: row.objectives.map((item) => ({ ...item, status: item.status })),
    audiences: row.audiences.map((item) => ({
      ...item,
      painPoints: stringArray(item.painPoints, 'painPoints'),
      desires: stringArray(item.desires, 'desires'),
      excludedAudience: stringArray(item.excludedAudience, 'excludedAudience'),
    })),
    personality:
      row.personality === null
        ? null
        : {
            ...row.personality,
            forbiddenExpressions: stringArray(
              row.personality.forbiddenExpressions,
              'forbiddenExpressions',
            ),
            preferredExpressions: stringArray(
              row.personality.preferredExpressions,
              'preferredExpressions',
            ),
            facePolicy: row.personality.facePolicy,
          },
  };
}

export class PrismaBunshinRepository implements BunshinRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async create(input: CreateBunshinInput & { slug: string }): Promise<BunshinAggregate> {
    return this.client.$transaction(async (tx) => {
      const ownerUserId = input.ownerUserId ?? input.actorUserId;
      const [actorMembership, ownerMembership] = await Promise.all([
        tx.workspaceMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            status: 'ACTIVE',
            workspace: { status: 'ACTIVE' },
          },
          select: { id: true },
        }),
        tx.workspaceMembership.findFirst({
          where: { workspaceId: input.workspaceId, userId: ownerUserId, status: 'ACTIVE' },
          select: { id: true },
        }),
      ]);
      if (actorMembership === null || ownerMembership === null) {
        throw new ApplicationError('NOT_FOUND', 'workspace not found');
      }
      if (input.groupId) {
        const [actorGroupMembership, ownerGroupMembership] = await Promise.all([
          tx.groupMembership.findFirst({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              userId: input.actorUserId,
              status: 'ACTIVE',
              group: { status: 'ACTIVE' },
            },
            select: { id: true },
          }),
          tx.groupMembership.findFirst({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              userId: ownerUserId,
              status: 'ACTIVE',
            },
            select: { id: true },
          }),
        ]);
        if (!actorGroupMembership || !ownerGroupMembership) {
          throw new ApplicationError('NOT_FOUND', 'service not found');
        }
      }

      const data: Prisma.BunshinCreateInput = {
        workspace: { connect: { id: input.workspaceId } },
        ...(input.groupId
          ? {
              group: {
                connect: { workspaceId_id: { workspaceId: input.workspaceId, id: input.groupId } },
              },
            }
          : {}),
        ownerUser: { connect: { id: ownerUserId } },
        name: input.name,
        slug: input.slug,
        type: input.type,
        objectiveSummary: input.objectiveSummary,
        audienceSummary: input.audienceSummary,
        personalitySummary: input.personalitySummary,
        avatarUrl: input.avatarUrl ?? null,
        ...(input.objectives === undefined ? {} : { objectives: { create: input.objectives } }),
        ...(input.audiences === undefined ? {} : { audiences: { create: input.audiences } }),
        ...(input.personality === undefined ? {} : { personality: { create: input.personality } }),
      };
      const row = await tx.bunshin.create({
        data,
        include: bunshinRelations,
      });
      if (row.personality) {
        await tx.bunshinPersonalityVersion.create({
          data: {
            workspaceId: row.workspaceId,
            bunshinId: row.id,
            personalityId: row.personality.id,
            version: 1,
            source: 'INITIAL',
            changeReason: '投稿パートナー作成時の初期設定',
            tone: row.personality.tone,
            formality: row.personality.formality,
            energyLevel: row.personality.energyLevel,
            expertiseLevel: row.personality.expertiseLevel,
            sentenceStyle: row.personality.sentenceStyle,
            firstPerson: row.personality.firstPerson,
            forbiddenExpressions: row.personality.forbiddenExpressions as Prisma.InputJsonValue,
            preferredExpressions: row.personality.preferredExpressions as Prisma.InputJsonValue,
            visualDirection: row.personality.visualDirection,
            facePolicy: row.personality.facePolicy,
            createdByUserId: input.actorUserId,
          },
        });
      }
      return bunshinAggregate(row);
    });
  }

  async list(input: { workspaceId: string; actorUserId: string }): Promise<BunshinAggregate[]> {
    const rows = await this.client.bunshin.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: null,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
        OR: [
          { ownerUserId: input.actorUserId },
          {
            workspace: {
              memberships: {
                some: {
                  userId: input.actorUserId,
                  status: 'ACTIVE',
                  role: { in: ['OWNER', 'ADMIN'] },
                },
              },
            },
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      include: bunshinRelations,
    });
    return rows.map(bunshinAggregate);
  }

  async listForService(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  }): Promise<BunshinAggregate[]> {
    const rows = await this.client.bunshin.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        status: { not: 'ARCHIVED' },
        group: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      orderBy: { updatedAt: 'desc' },
      include: bunshinRelations,
    });
    return rows.map(bunshinAggregate);
  }

  async find(input: ScopedBunshinReference): Promise<BunshinAggregate | null> {
    const row = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
        OR: [
          { ownerUserId: input.actorUserId },
          {
            workspace: {
              memberships: {
                some: {
                  userId: input.actorUserId,
                  status: 'ACTIVE',
                  role: { in: ['OWNER', 'ADMIN'] },
                },
              },
            },
          },
        ],
        AND: {
          OR: [
            { groupId: null },
            {
              group: {
                status: 'ACTIVE',
                memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
              },
            },
          ],
        },
      },
      include: bunshinRelations,
    });
    return row === null ? null : bunshinAggregate(row);
  }

  async update(input: UpdateBunshinInput): Promise<BunshinAggregate | null> {
    return this.updateManaged(input, {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.objectiveSummary === undefined ? {} : { objectiveSummary: input.objectiveSummary }),
      ...(input.audienceSummary === undefined ? {} : { audienceSummary: input.audienceSummary }),
      ...(input.personalitySummary === undefined
        ? {}
        : { personalitySummary: input.personalitySummary }),
      ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
    });
  }

  async archive(input: ScopedBunshinReference): Promise<BunshinAggregate | null> {
    return this.updateManaged(input, { status: 'ARCHIVED', archivedAt: new Date() });
  }

  private async updateManaged(
    input: ScopedBunshinReference,
    data: Prisma.BunshinUpdateInput,
  ): Promise<BunshinAggregate | null> {
    return this.client.$transaction(async (tx) => {
      const authorized = await tx.bunshin.findFirst({
        where: {
          id: input.bunshinId,
          workspaceId: input.workspaceId,
          groupId: input.groupId ?? null,
          status: { not: 'ARCHIVED' },
          workspace: { status: 'ACTIVE' },
          AND: [
            {
              workspace: {
                memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
              },
            },
            {
              OR: [
                { groupId: null },
                {
                  group: {
                    status: 'ACTIVE',
                    memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          ownerUserId: true,
          workspace: {
            select: {
              memberships: {
                where: { userId: input.actorUserId, status: 'ACTIVE' },
                select: { role: true },
                take: 1,
              },
            },
          },
        },
      });
      const membership = authorized?.workspace.memberships[0];
      if (
        authorized === null ||
        membership === undefined ||
        !canManageBunshin(membership.role, input.actorUserId, authorized.ownerUserId)
      ) {
        return null;
      }
      return bunshinAggregate(
        await tx.bunshin.update({ where: { id: authorized.id }, data, include: bunshinRelations }),
      );
    });
  }
}

function personalityVersion(
  row: Prisma.BunshinPersonalityVersionGetPayload<object>,
): BunshinPersonalityVersion {
  if (!['INITIAL', 'MANUAL', 'LEARNING', 'RESTORE'].includes(row.source))
    throw new ApplicationError('DATABASE_UNAVAILABLE', 'invalid personality version source');
  return {
    ...row,
    source: row.source as BunshinPersonalityVersion['source'],
    forbiddenExpressions: stringArray(row.forbiddenExpressions, 'forbiddenExpressions'),
    preferredExpressions: stringArray(row.preferredExpressions, 'preferredExpressions'),
  };
}

export class PrismaPersonalityVersionRepository implements PersonalityVersionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async managedPersonality(tx: Prisma.TransactionClient, input: PersonalityVersionScope) {
    const row = await tx.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        ownerUserId: true,
        personality: { select: { id: true } },
        workspace: {
          select: {
            memberships: {
              where: { userId: input.actorUserId, status: 'ACTIVE' },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    const membership = row?.workspace.memberships[0];
    if (
      !row ||
      !membership ||
      !canManageBunshin(membership.role, input.actorUserId, row.ownerUserId)
    )
      return null;
    return { personality: row.personality };
  }

  private async write(
    tx: Prisma.TransactionClient,
    input: PersonalityVersionScope & {
      content: PersonalityVersionContent;
      source: BunshinPersonalityVersion['source'];
      changeReason: string;
      basedOnVersionId: string | null;
    },
  ) {
    const access = await this.managedPersonality(tx, input);
    const personality = access?.personality;
    if (!personality) return null;
    if (input.basedOnVersionId) {
      const base = await tx.bunshinPersonalityVersion.findFirst({
        where: {
          id: input.basedOnVersionId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          personalityId: personality.id,
        },
        select: { id: true },
      });
      if (!base) return null;
    }
    const latest = await tx.bunshinPersonalityVersion.aggregate({
      where: { personalityId: personality.id },
      _max: { version: true },
    });
    await tx.bunshinPersonality.update({
      where: { id: personality.id },
      data: {
        ...input.content,
        forbiddenExpressions: input.content.forbiddenExpressions,
        preferredExpressions: input.content.preferredExpressions,
      },
    });
    const row = await tx.bunshinPersonalityVersion.create({
      data: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        personalityId: personality.id,
        version: (latest._max.version ?? 0) + 1,
        source: input.source,
        changeReason: input.changeReason,
        basedOnVersionId: input.basedOnVersionId,
        ...input.content,
        forbiddenExpressions: input.content.forbiddenExpressions,
        preferredExpressions: input.content.preferredExpressions,
        createdByUserId: input.actorUserId,
      },
    });
    return personalityVersion(row);
  }

  async create(input: Parameters<PersonalityVersionRepository['create']>[0]) {
    try {
      return await this.client.$transaction((tx) =>
        this.write(tx, { ...input, basedOnVersionId: input.basedOnVersionId ?? null }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'personality version changed concurrently');
      throw error;
    }
  }

  async restore(input: Parameters<PersonalityVersionRepository['restore']>[0]) {
    return this.client.$transaction(async (tx) => {
      const access = await this.managedPersonality(tx, input);
      const personality = access?.personality;
      if (!personality) return null;
      const target = await tx.bunshinPersonalityVersion.findFirst({
        where: {
          id: input.versionId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          personalityId: personality.id,
        },
      });
      if (!target) return null;
      return this.write(tx, {
        ...input,
        source: 'RESTORE',
        basedOnVersionId: target.id,
        content: {
          tone: target.tone,
          formality: target.formality,
          energyLevel: target.energyLevel,
          expertiseLevel: target.expertiseLevel,
          sentenceStyle: target.sentenceStyle,
          firstPerson: target.firstPerson,
          forbiddenExpressions: stringArray(target.forbiddenExpressions, 'forbiddenExpressions'),
          preferredExpressions: stringArray(target.preferredExpressions, 'preferredExpressions'),
          visualDirection: target.visualDirection,
          facePolicy: target.facePolicy,
        },
      });
    });
  }

  async list(input: Parameters<PersonalityVersionRepository['list']>[0]) {
    return this.client.$transaction(async (tx) => {
      const access = await this.managedPersonality(tx, input);
      if (!access) return null;
      const personality = access.personality;
      if (!personality) return [];
      const rows = await tx.bunshinPersonalityVersion.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          personalityId: personality.id,
        },
        orderBy: { version: 'desc' },
      });
      return rows.map(personalityVersion);
    });
  }
}

function personalityLearningProposal(
  row: Prisma.PersonalityLearningProposalGetPayload<object>,
): PersonalityLearningProposal {
  const proposedContent = normalizePersonalityVersionContent(
    row.proposedContent as unknown as PersonalityVersionContent,
  );
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    bunshinId: row.bunshinId,
    status: row.status,
    proposedContent,
    reason: row.reason,
    evidenceIds: stringArray(row.evidenceIds, 'evidenceIds'),
    basedOnVersionId: row.basedOnVersionId,
    appliedVersionId: row.appliedVersionId,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    revokedAt: row.revokedAt,
  };
}

export class PrismaPersonalityLearningProposalRepository implements PersonalityLearningProposalRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async access(tx: Prisma.TransactionClient, input: PersonalityVersionScope) {
    const row = await tx.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: { status: 'ACTIVE' },
      },
      select: {
        ownerUserId: true,
        personality: { select: { id: true } },
        workspace: {
          select: {
            memberships: {
              where: { userId: input.actorUserId, status: 'ACTIVE' },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    const membership = row?.workspace.memberships[0];
    if (
      !row ||
      !membership ||
      !canManageBunshin(membership.role, input.actorUserId, row.ownerUserId)
    )
      return null;
    return { personality: row.personality };
  }

  async create(input: Parameters<PersonalityLearningProposalRepository['create']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const personality = (await this.access(tx, input))?.personality;
        if (!personality) return null;
        const base = await tx.bunshinPersonalityVersion.findFirst({
          where: {
            id: input.basedOnVersionId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            personalityId: personality.id,
          },
          select: { id: true },
        });
        if (!base) return null;
        const row = await tx.personalityLearningProposal.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            proposedContent: input.proposedContent as unknown as Prisma.InputJsonValue,
            reason: input.reason,
            evidenceIds: input.evidenceIds,
            basedOnVersionId: input.basedOnVersionId,
            createdByUserId: input.actorUserId,
          },
        });
        return personalityLearningProposal(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'pending learning proposal already exists');
      throw error;
    }
  }

  async list(input: Parameters<PersonalityLearningProposalRepository['list']>[0]) {
    return this.client.$transaction(async (tx) => {
      const access = await this.access(tx, input);
      if (!access) return null;
      if (!access.personality) return [];
      const rows = await tx.personalityLearningProposal.findMany({
        where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(personalityLearningProposal);
    });
  }

  async reject(input: Parameters<PersonalityLearningProposalRepository['reject']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.access(tx, input))) return null;
      const current = await tx.personalityLearningProposal.findFirst({
        where: {
          id: input.proposalId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'PENDING',
        },
      });
      if (!current) return null;
      const row = await tx.personalityLearningProposal.update({
        where: { id: current.id },
        data: { status: 'REJECTED', decidedAt: new Date() },
      });
      return personalityLearningProposal(row);
    });
  }

  async approve(input: Parameters<PersonalityLearningProposalRepository['approve']>[0]) {
    return this.client.$transaction(async (tx) => {
      const personality = (await this.access(tx, input))?.personality;
      if (!personality) return null;
      const proposal = await tx.personalityLearningProposal.findFirst({
        where: {
          id: input.proposalId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'PENDING',
        },
      });
      if (!proposal) return null;
      const content = normalizePersonalityVersionContent(
        proposal.proposedContent as unknown as PersonalityVersionContent,
      );
      const latest = await tx.bunshinPersonalityVersion.aggregate({
        where: { personalityId: personality.id },
        _max: { version: true },
      });
      await tx.bunshinPersonality.update({
        where: { id: personality.id },
        data: {
          ...content,
          forbiddenExpressions: content.forbiddenExpressions,
          preferredExpressions: content.preferredExpressions,
        },
      });
      const versionRow = await tx.bunshinPersonalityVersion.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          personalityId: personality.id,
          version: (latest._max.version ?? 0) + 1,
          source: 'LEARNING',
          changeReason: proposal.reason,
          basedOnVersionId: proposal.basedOnVersionId,
          ...content,
          forbiddenExpressions: content.forbiddenExpressions,
          preferredExpressions: content.preferredExpressions,
          createdByUserId: input.actorUserId,
        },
      });
      const updated = await tx.personalityLearningProposal.update({
        where: { id: proposal.id },
        data: { status: 'APPROVED', appliedVersionId: versionRow.id, decidedAt: new Date() },
      });
      return {
        proposal: personalityLearningProposal(updated),
        personalityVersion: personalityVersion(versionRow),
      };
    });
  }

  async revoke(input: Parameters<PersonalityLearningProposalRepository['revoke']>[0]) {
    return this.client.$transaction(async (tx) => {
      const personality = (await this.access(tx, input))?.personality;
      if (!personality) return null;
      const proposal = await tx.personalityLearningProposal.findFirst({
        where: {
          id: input.proposalId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'APPROVED',
        },
      });
      if (!proposal) return null;
      const base = await tx.bunshinPersonalityVersion.findFirst({
        where: { id: proposal.basedOnVersionId, personalityId: personality.id },
      });
      if (!base) return null;
      const content: PersonalityVersionContent = {
        tone: base.tone,
        formality: base.formality,
        energyLevel: base.energyLevel,
        expertiseLevel: base.expertiseLevel,
        sentenceStyle: base.sentenceStyle,
        firstPerson: base.firstPerson,
        forbiddenExpressions: stringArray(base.forbiddenExpressions, 'forbiddenExpressions'),
        preferredExpressions: stringArray(base.preferredExpressions, 'preferredExpressions'),
        visualDirection: base.visualDirection,
        facePolicy: base.facePolicy,
      };
      const latest = await tx.bunshinPersonalityVersion.aggregate({
        where: { personalityId: personality.id },
        _max: { version: true },
      });
      await tx.bunshinPersonality.update({
        where: { id: personality.id },
        data: {
          ...content,
          forbiddenExpressions: content.forbiddenExpressions,
          preferredExpressions: content.preferredExpressions,
        },
      });
      const versionRow = await tx.bunshinPersonalityVersion.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          personalityId: personality.id,
          version: (latest._max.version ?? 0) + 1,
          source: 'RESTORE',
          changeReason: `学習提案の取消: ${proposal.reason}`,
          basedOnVersionId: base.id,
          ...content,
          forbiddenExpressions: content.forbiddenExpressions,
          preferredExpressions: content.preferredExpressions,
          createdByUserId: input.actorUserId,
        },
      });
      const updated = await tx.personalityLearningProposal.update({
        where: { id: proposal.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      return {
        proposal: personalityLearningProposal(updated),
        personalityVersion: personalityVersion(versionRow),
      };
    });
  }
}

export async function checkDatabaseReadiness(client: PrismaClient = prisma): Promise<void> {
  try {
    const rows = await client.$queryRaw<Array<{ applied: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM "_prisma_migrations"
        WHERE "migration_name" = ${LATEST_DATABASE_MIGRATION}
          AND "finished_at" IS NOT NULL
          AND "rolled_back_at" IS NULL
      ) AS "applied"
    `;
    if (rows[0]?.applied !== true)
      throw new ApplicationError('DATABASE_UNAVAILABLE', 'Database schema is not current');
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError('DATABASE_UNAVAILABLE', 'Database readiness check failed', error);
  }
}

function knowledge(row: Prisma.OwnerKnowledgeGetPayload<object>): OwnerKnowledge {
  return { ...row, type: row.type, sourceType: row.sourceType, status: row.status };
}
function grant(row: Prisma.BunshinKnowledgeGrantGetPayload<object>): BunshinKnowledgeGrant {
  return { ...row, status: row.status };
}

export class PrismaOwnerKnowledgeRepository implements OwnerKnowledgeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async create(input: Parameters<OwnerKnowledgeRepository['create']>[0]) {
    const member = await this.client.workspaceMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!member) throw new ApplicationError('NOT_FOUND', 'workspace not found');
    return knowledge(
      await this.client.ownerKnowledge.create({
        data: {
          workspaceId: input.workspaceId,
          ownerUserId: input.actorUserId,
          type: input.type,
          title: input.title,
          content: input.content,
          sourceType: 'MANUAL',
        },
      }),
    );
  }
  async listOwned(input: Parameters<OwnerKnowledgeRepository['listOwned']>[0]) {
    const rows = await this.client.ownerKnowledge.findMany({
      where: {
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: 'ACTIVE',
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(knowledge);
  }
  async findOwned(input: Parameters<OwnerKnowledgeRepository['findOwned']>[0]) {
    const row = await this.client.ownerKnowledge.findFirst({
      where: {
        id: input.knowledgeId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: 'ACTIVE',
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
    });
    return row ? knowledge(row) : null;
  }
  async updateOwned(input: Parameters<OwnerKnowledgeRepository['updateOwned']>[0]) {
    const found = await this.findOwned(input);
    if (!found) return null;
    return knowledge(
      await this.client.ownerKnowledge.update({
        where: { id: found.id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.content === undefined ? {} : { content: input.content }),
          ...(input.type === undefined ? {} : { type: input.type }),
        },
      }),
    );
  }
  async archiveOwned(input: Parameters<OwnerKnowledgeRepository['archiveOwned']>[0]) {
    return this.client.$transaction(async (tx) => {
      const row = await tx.ownerKnowledge.findFirst({
        where: {
          id: input.knowledgeId,
          workspaceId: input.workspaceId,
          ownerUserId: input.actorUserId,
          status: 'ACTIVE',
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
        },
      });
      if (!row) return null;
      const now = new Date();
      await tx.bunshinKnowledgeGrant.updateMany({
        where: { ownerKnowledgeId: row.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now },
      });
      return knowledge(
        await tx.ownerKnowledge.update({
          where: { id: row.id },
          data: { status: 'ARCHIVED', archivedAt: now },
        }),
      );
    });
  }
}

export class PrismaKnowledgeGrantRepository implements KnowledgeGrantRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async grant(input: Parameters<KnowledgeGrantRepository['grant']>[0]) {
    return this.client.$transaction(async (tx) => {
      const bunshin = await tx.bunshin.findFirst({
        where: {
          id: input.bunshinId,
          workspaceId: input.workspaceId,
          status: { not: 'ARCHIVED' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
        },
        include: {
          workspace: {
            select: {
              memberships: {
                where: { userId: input.actorUserId, status: 'ACTIVE' },
                select: { role: true },
                take: 1,
              },
            },
          },
        },
      });
      const item = await tx.ownerKnowledge.findFirst({
        where: { id: input.knowledgeId, workspaceId: input.workspaceId, status: 'ACTIVE' },
      });
      const role = bunshin?.workspace.memberships[0]?.role;
      if (
        !bunshin ||
        !item ||
        !role ||
        !canManageBunshin(role, input.actorUserId, bunshin.ownerUserId)
      )
        return null;
      const now = new Date();
      return grant(
        await tx.bunshinKnowledgeGrant.upsert({
          where: {
            workspaceId_bunshinId_ownerKnowledgeId: {
              workspaceId: input.workspaceId,
              bunshinId: bunshin.id,
              ownerKnowledgeId: item.id,
            },
          },
          create: {
            workspaceId: input.workspaceId,
            bunshinId: bunshin.id,
            ownerKnowledgeId: item.id,
            grantedByUserId: input.actorUserId,
          },
          update: {
            status: 'ACTIVE',
            grantedAt: now,
            revokedAt: null,
            grantedByUserId: input.actorUserId,
          },
        }),
      );
    });
  }
  async revoke(input: Parameters<KnowledgeGrantRepository['revoke']>[0]) {
    const authorized = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: { memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } } },
      },
      include: {
        workspace: {
          select: {
            memberships: {
              where: { userId: input.actorUserId, status: 'ACTIVE' },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    const role = authorized?.workspace.memberships[0]?.role;
    if (!authorized || !role || !canManageBunshin(role, input.actorUserId, authorized.ownerUserId))
      return null;
    const row = await this.client.bunshinKnowledgeGrant.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        ownerKnowledgeId: input.knowledgeId,
        status: 'ACTIVE',
      },
    });
    if (!row) return null;
    return grant(
      await this.client.bunshinKnowledgeGrant.update({
        where: { id: row.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }),
    );
  }
  async listGrantedKnowledge(
    input: Parameters<KnowledgeGrantRepository['listGrantedKnowledge']>[0],
  ) {
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
    if (!bunshin) return [];
    const rows = await this.client.ownerKnowledge.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: 'ACTIVE',
        grants: {
          some: { workspaceId: input.workspaceId, bunshinId: bunshin.id, status: 'ACTIVE' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(knowledge);
  }
}

function memory(row: Prisma.BunshinMemoryGetPayload<object>): BunshinMemory {
  return {
    ...row,
    type: row.type,
    sourceType: row.sourceType,
    confidence: row.confidence.toNumber(),
  };
}

export class PrismaBunshinMemoryRepository implements BunshinMemoryRepository {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly ownerOnly = false,
  ) {}
  private async managed(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ...(this.ownerOnly ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      include: {
        workspace: {
          select: {
            memberships: {
              where: { userId: input.actorUserId, status: 'ACTIVE' },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    const role = bunshin?.workspace.memberships[0]?.role;
    return bunshin && role && canManageBunshin(role, input.actorUserId, bunshin.ownerUserId)
      ? bunshin
      : null;
  }
  async create(input: Parameters<BunshinMemoryRepository['create']>[0]) {
    if (!(await this.managed(input))) return null;
    return memory(
      await this.client.bunshinMemory.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          type: input.type,
          content: input.content,
          summary: input.summary ?? null,
          sourceType: 'USER_INPUT',
          sourceId: null,
          confidence: input.confidence,
          importance: input.importance,
        },
      }),
    );
  }
  async list(input: Parameters<BunshinMemoryRepository['list']>[0]) {
    if (!(await this.managed(input))) return [];
    const rows = await this.client.bunshinMemory.findMany({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        deletedAt: null,
        ...(input.includeInactive ? {} : { active: true }),
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(memory);
  }
  async find(input: Parameters<BunshinMemoryRepository['find']>[0]) {
    const rows = await this.list({ ...input, includeInactive: true });
    return rows.find((item) => item.id === input.memoryId) ?? null;
  }
  async update(input: Parameters<BunshinMemoryRepository['update']>[0]) {
    if (!(await this.managed(input))) return null;
    const row = await this.client.bunshinMemory.findFirst({
      where: {
        id: input.memoryId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        deletedAt: null,
      },
    });
    if (!row) return null;
    return memory(
      await this.client.bunshinMemory.update({
        where: { id: row.id },
        data: {
          ...(input.type === undefined ? {} : { type: input.type }),
          ...(input.content === undefined ? {} : { content: input.content }),
          ...(input.summary === undefined ? {} : { summary: input.summary }),
          ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
          ...(input.importance === undefined ? {} : { importance: input.importance }),
        },
      }),
    );
  }
  async setActive(input: Parameters<BunshinMemoryRepository['setActive']>[0]) {
    if (!(await this.managed(input))) return null;
    const row = await this.client.bunshinMemory.findFirst({
      where: {
        id: input.memoryId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        deletedAt: null,
      },
    });
    if (!row) return null;
    return memory(
      await this.client.bunshinMemory.update({
        where: { id: row.id },
        data: { active: input.active },
      }),
    );
  }
  async softDelete(input: Parameters<BunshinMemoryRepository['softDelete']>[0]) {
    if (!(await this.managed(input))) return null;
    const row = await this.client.bunshinMemory.findFirst({
      where: {
        id: input.memoryId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        deletedAt: null,
      },
    });
    if (!row) return null;
    return memory(
      await this.client.bunshinMemory.update({
        where: { id: row.id },
        data: { active: false, deletedAt: new Date() },
      }),
    );
  }
}

export class PrismaOwnerBunshinMemoryRepository extends PrismaBunshinMemoryRepository {
  constructor(client: PrismaClient = prisma) {
    super(client, true);
  }
}

function capabilityAssignment(
  row: Prisma.BunshinCapabilityAssignmentGetPayload<object>,
): BunshinCapabilityAssignment {
  return {
    ...row,
    capabilityType: row.capabilityType,
    status: row.status,
    config: row.config,
  };
}

export class PrismaBunshinCapabilityAssignmentRepository implements BunshinCapabilityAssignmentRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async managed(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      include: {
        workspace: {
          select: {
            memberships: {
              where: { userId: input.actorUserId, status: 'ACTIVE' },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    const role = bunshin?.workspace.memberships[0]?.role;
    return bunshin !== null &&
      role !== undefined &&
      canManageBunshin(role, input.actorUserId, bunshin.ownerUserId)
      ? bunshin
      : null;
  }

  async assign(input: Parameters<BunshinCapabilityAssignmentRepository['assign']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.bunshinCapabilityAssignment.upsert({
        where: {
          workspaceId_bunshinId_capabilityType: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            capabilityType: input.capabilityType,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          capabilityType: input.capabilityType,
          assignedByUserId: input.actorUserId,
          config: {},
        },
        update: {},
      });
      if (row.status === 'LOCKED') {
        throw new ApplicationError('CONFLICT', 'locked capability cannot be activated');
      }
      if (row.status === 'ACTIVE') return capabilityAssignment(row);
      return capabilityAssignment(
        await tx.bunshinCapabilityAssignment.update({
          where: { id: row.id },
          data: {
            status: 'ACTIVE',
            assignedByUserId: input.actorUserId,
            activatedAt: new Date(),
          },
        }),
      );
    });
  }

  async list(input: Parameters<BunshinCapabilityAssignmentRepository['list']>[0]) {
    const accessible = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
    if (accessible === null) return null;
    const rows = await this.client.bunshinCapabilityAssignment.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(capabilityAssignment);
  }

  async find(input: Parameters<BunshinCapabilityAssignmentRepository['find']>[0]) {
    const rows = await this.list(input);
    if (rows === null) return null;
    return rows.find((row) => row.capabilityType === input.capabilityType) ?? null;
  }

  async setStatus(input: Parameters<BunshinCapabilityAssignmentRepository['setStatus']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.bunshinCapabilityAssignment.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          capabilityType: input.capabilityType,
        },
      });
      if (row === null) return null;
      if (row.status === 'LOCKED') {
        throw new ApplicationError('CONFLICT', 'locked capability cannot be changed');
      }
      if (row.status === input.status) return capabilityAssignment(row);
      return capabilityAssignment(
        await tx.bunshinCapabilityAssignment.update({
          where: { id: row.id },
          data: {
            status: input.status,
            ...(input.status === 'ACTIVE' ? { activatedAt: new Date() } : {}),
          },
        }),
      );
    });
  }
}

function socialProfile(row: Prisma.SocialProfileGetPayload<object>): SocialProfile {
  try {
    return {
      ...row,
      platform: row.platform,
      postingFrequency: row.postingFrequency,
      preferredFormats: parsePreferredFormats(row.preferredFormats),
      defaultAssistanceLevel: row.defaultAssistanceLevel,
      status: row.status,
    };
  } catch (error) {
    throw new ApplicationError('INTERNAL_ERROR', 'invalid persisted social profile', error);
  }
}

export class PrismaSocialProfileRepository implements SocialProfileRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async accessible(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
  ) {
    return client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }

  private async managed(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      include: {
        workspace: {
          select: {
            memberships: {
              where: { userId: input.actorUserId, status: 'ACTIVE' },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    const role = bunshin?.workspace.memberships[0]?.role;
    return bunshin !== null &&
      role !== undefined &&
      canManageBunshin(role, input.actorUserId, bunshin.ownerUserId)
      ? bunshin
      : null;
  }

  async create(input: Parameters<SocialProfileRepository['create']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if ((await this.managed(tx, input)) === null) return null;
        return socialProfile(
          await tx.socialProfile.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              platform: input.platform,
              handle: input.handle ?? null,
              profileUrl: input.profileUrl ?? null,
              purpose: input.purpose,
              postingFrequency: input.postingFrequency,
              preferredFormats: input.preferredFormats,
              defaultAssistanceLevel: input.defaultAssistanceLevel ?? 'READY_TO_USE',
            },
          }),
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApplicationError('CONFLICT', 'social profile already exists', error);
      }
      throw error;
    }
  }

  async list(input: Parameters<SocialProfileRepository['list']>[0]) {
    if ((await this.accessible(this.client, input)) === null) return null;
    const rows = await this.client.socialProfile.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      orderBy: [{ platform: 'asc' }],
    });
    return rows.map(socialProfile);
  }

  async findByPlatform(input: Parameters<SocialProfileRepository['findByPlatform']>[0]) {
    if ((await this.accessible(this.client, input)) === null) return null;
    const row = await this.client.socialProfile.findUnique({
      where: {
        workspaceId_bunshinId_platform: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          platform: input.platform,
        },
      },
    });
    return row === null ? null : socialProfile(row);
  }

  async update(input: Parameters<SocialProfileRepository['update']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.socialProfile.findUnique({
        where: {
          workspaceId_bunshinId_platform: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            platform: input.platform,
          },
        },
        select: { id: true },
      });
      if (row === null) return null;
      return socialProfile(
        await tx.socialProfile.update({
          where: { id: row.id },
          data: {
            ...(input.handle === undefined ? {} : { handle: input.handle }),
            ...(input.profileUrl === undefined ? {} : { profileUrl: input.profileUrl }),
            ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
            ...(input.postingFrequency === undefined
              ? {}
              : { postingFrequency: input.postingFrequency }),
            ...(input.preferredFormats === undefined
              ? {}
              : { preferredFormats: input.preferredFormats }),
            ...(input.defaultAssistanceLevel === undefined
              ? {}
              : { defaultAssistanceLevel: input.defaultAssistanceLevel }),
          },
        }),
      );
    });
  }

  async setActive(input: Parameters<SocialProfileRepository['setActive']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.socialProfile.findUnique({
        where: {
          workspaceId_bunshinId_platform: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            platform: input.platform,
          },
        },
      });
      if (row === null) return null;
      const status = input.active ? 'ACTIVE' : 'INACTIVE';
      if (row.status === status) return socialProfile(row);
      return socialProfile(
        await tx.socialProfile.update({ where: { id: row.id }, data: { status } }),
      );
    });
  }
}

function socialAccountStrategy(
  row: Prisma.SocialAccountStrategyGetPayload<object>,
): SocialAccountStrategy {
  return { ...row, availableMinutes: row.availableMinutes as 3 | 5 | 10 | 20 };
}

export class PrismaSocialAccountStrategyRepository implements SocialAccountStrategyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private async managed(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      include: {
        workspace: {
          select: {
            memberships: {
              where: { userId: input.actorUserId, status: 'ACTIVE' },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    const role = bunshin?.workspace.memberships[0]?.role;
    return bunshin !== null &&
      role !== undefined &&
      canManageBunshin(role, input.actorUserId, bunshin.ownerUserId)
      ? bunshin
      : null;
  }

  private accessible(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }
  async createVersion(input: Parameters<SocialAccountStrategyRepository['createVersion']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if ((await this.managed(tx, input)) === null) return null;
        const profile = await tx.socialProfile.findFirst({
          where: {
            id: input.socialProfileId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            platform: input.platform,
          },
          select: { id: true },
        });
        if (profile === null) return null;
        await tx.$queryRaw<Array<{ lock: string }>>`
          SELECT pg_advisory_xact_lock(hashtext(${input.socialProfileId}))::text AS lock
        `;
        const latest = await tx.socialAccountStrategy.aggregate({
          where: { socialProfileId: input.socialProfileId },
          _max: { version: true },
        });
        const { actorUserId, groupId, status, ...data } = input;
        void actorUserId;
        void groupId;
        return socialAccountStrategy(
          await tx.socialAccountStrategy.create({
            data: {
              ...data,
              destinationDetail: input.destinationDetail ?? null,
              status: status ?? 'DRAFT',
              version: (latest._max.version ?? 0) + 1,
            },
          }),
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'strategy version conflict', error);
      throw error;
    }
  }
  async list(input: Parameters<SocialAccountStrategyRepository['list']>[0]) {
    if ((await this.accessible(input)) === null) return null;
    const profile = await this.client.socialProfile.findFirst({
      where: {
        id: input.socialProfileId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
      select: { id: true },
    });
    if (profile === null) return null;
    return (
      await this.client.socialAccountStrategy.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          socialProfileId: input.socialProfileId,
        },
        orderBy: { version: 'desc' },
      })
    ).map(socialAccountStrategy);
  }
  async approve(input: Parameters<SocialAccountStrategyRepository['approve']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const target = await tx.socialAccountStrategy.findFirst({
        where: { id: input.strategyId, workspaceId: input.workspaceId, bunshinId: input.bunshinId },
        select: { id: true, socialProfileId: true, status: true },
      });
      if (target === null) return null;
      if (target.status === 'SUPERSEDED')
        throw new ApplicationError('CONFLICT', 'superseded strategy cannot be approved');
      if (target.status === 'APPROVED')
        return socialAccountStrategy(
          await tx.socialAccountStrategy.findUniqueOrThrow({ where: { id: target.id } }),
        );
      const now = new Date();
      await tx.socialAccountStrategy.updateMany({
        where: { socialProfileId: target.socialProfileId, status: 'APPROVED' },
        data: { status: 'SUPERSEDED', supersededAt: now },
      });
      return socialAccountStrategy(
        await tx.socialAccountStrategy.update({
          where: { id: target.id },
          data: { status: 'APPROVED', approvedAt: now, supersededAt: null },
        }),
      );
    });
  }
}

const trendDateString = (value: Date) => value.toISOString().slice(0, 10);
function trendCandidate(
  row: Prisma.TrendIdeaCandidateGetPayload<{ include: { evidenceLinks: true } }>,
): TrendIdeaCandidate {
  return { ...row, evidenceIds: row.evidenceLinks.map(({ evidenceId }) => evidenceId) };
}
function trendRun(
  row: Prisma.TrendResearchRunGetPayload<{
    include: { evidence: true; candidates: { include: { evidenceLinks: true } } };
  }>,
): TrendResearchRun {
  return {
    ...row,
    periodStart: trendDateString(row.periodStart),
    periodEnd: trendDateString(row.periodEnd),
    completedAt: row.completedAt!,
    evidence: row.evidence,
    candidates: row.candidates.map(trendCandidate),
  };
}
export class PrismaTrendResearchRepository implements TrendResearchRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private accessible(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }
  async createCompleted(input: Parameters<TrendResearchRepository['createCompleted']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const bunshin = await tx.bunshin.findFirst({
          where: {
            id: input.bunshinId,
            workspaceId: input.workspaceId,
            status: { not: 'ARCHIVED' },
            workspace: {
              status: 'ACTIVE',
              memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
            },
          },
          include: {
            workspace: {
              select: {
                memberships: {
                  where: { userId: input.actorUserId, status: 'ACTIVE' },
                  select: { role: true },
                  take: 1,
                },
              },
            },
          },
        });
        const role = bunshin?.workspace.memberships[0]?.role;
        if (!bunshin || !role || !canManageBunshin(role, input.actorUserId, bunshin.ownerUserId))
          return null;
        const profile = await tx.socialProfile.findFirst({
          where: {
            id: input.socialProfileId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            platform: input.platform,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (!profile) return null;
        const run = await tx.trendResearchRun.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            socialProfileId: input.socialProfileId,
            periodStart: new Date(`${input.periodStart}T00:00:00.000Z`),
            periodEnd: new Date(`${input.periodEnd}T00:00:00.000Z`),
            queryVersion: input.queryVersion,
            providerKey: input.providerKey,
            status: 'COMPLETED',
            completedAt: input.completedAt,
            expiresAt: input.expiresAt,
          },
        });
        const evidenceIds = new Map<string, string>();
        for (const item of input.evidence) {
          const created = await tx.trendEvidence.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              researchRunId: run.id,
              sourceType: item.sourceType,
              sourceUrl: item.sourceUrl,
              sourceTitle: item.sourceTitle,
              publishedAt: item.publishedAt ?? null,
              retrievedAt: item.retrievedAt,
              summary: item.summary,
              evidenceHash: item.evidenceHash,
              status: 'ACTIVE',
              expiresAt: item.expiresAt,
            },
          });
          evidenceIds.set(item.key, created.id);
        }
        for (const item of input.candidates) {
          const created = await tx.trendIdeaCandidate.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              socialProfileId: input.socialProfileId,
              researchRunId: run.id,
              platform: item.platform,
              topic: item.topic,
              hook: item.hook,
              whyNow: item.whyNow,
              fitReason: item.fitReason,
              suggestedFormat: item.suggestedFormat,
              estimatedMinutes: item.estimatedMinutes,
              freshnessScore: item.freshnessScore,
              fitScore: item.fitScore,
              feasibilityScore: item.feasibilityScore,
              safetyStatus: item.safetyStatus,
              status: 'PROPOSED',
              expiresAt: item.expiresAt,
            },
          });
          await tx.trendIdeaCandidateEvidence.createMany({
            data: item.evidenceKeys.map((key) => ({
              candidateId: created.id,
              evidenceId: evidenceIds.get(key)!,
            })),
          });
        }
        return trendRun(
          await tx.trendResearchRun.findUniqueOrThrow({
            where: { id: run.id },
            include: { evidence: true, candidates: { include: { evidenceLinks: true } } },
          }),
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'trend research already exists', error);
      throw error;
    }
  }
  async listActive(input: Parameters<TrendResearchRepository['listActive']>[0]) {
    if ((await this.accessible(input)) === null) return null;
    const profile = await this.client.socialProfile.findFirst({
      where: {
        id: input.socialProfileId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        bunshin: {
          OR: [
            { groupId: null },
            { group: { serviceConfiguration: { trendResearchEnabled: true } } },
          ],
        },
      },
      select: { id: true },
    });
    if (!profile) return null;
    const rows = await this.client.trendIdeaCandidate.findMany({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        socialProfileId: input.socialProfileId,
        status: { in: ['PROPOSED', 'SELECTED'] },
        expiresAt: { gt: input.at },
        safetyStatus: { not: 'REJECTED' },
        researchRun: { status: 'COMPLETED', expiresAt: { gt: input.at } },
        evidenceLinks: { some: { evidence: { status: 'ACTIVE', expiresAt: { gt: input.at } } } },
      },
      include: { evidenceLinks: true },
      orderBy: [{ fitScore: 'desc' }, { freshnessScore: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(trendCandidate);
  }
}

export class PrismaTrendResearchExpiryRepository implements TrendResearchExpiryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async expire(input: Parameters<TrendResearchExpiryRepository['expire']>[0]) {
    const scope = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        workspace: {
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
        OR: [
          { ownerUserId: input.actorUserId },
          {
            workspace: {
              memberships: {
                some: {
                  userId: input.actorUserId,
                  status: 'ACTIVE',
                  role: { in: ['OWNER', 'ADMIN'] },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!scope) return null;
    return this.client.$transaction(async (tx) => {
      const candidates = await tx.trendIdeaCandidate.updateMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: { in: ['PROPOSED', 'SELECTED'] },
          expiresAt: { lte: input.at },
        },
        data: { status: 'EXPIRED' },
      });
      const evidence = await tx.trendEvidence.updateMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'ACTIVE',
          expiresAt: { lte: input.at },
        },
        data: { status: 'EXPIRED' },
      });
      const runs = await tx.trendResearchRun.updateMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'COMPLETED',
          expiresAt: { lte: input.at },
        },
        data: { status: 'EXPIRED' },
      });
      return { runs: runs.count, evidence: evidence.count, candidates: candidates.count };
    });
  }
}

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
const pointAccountRecord = (row: Prisma.PointAccountGetPayload<object>): PointAccountSnapshot => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  availablePoints: row.availablePoints,
  recoveryDue: row.recoveryDue,
  updatedAt: row.updatedAt,
});

export async function applyPointCreditToAccount(
  tx: Prisma.TransactionClient,
  input: { accountId: string; transactionId: string; amount: number },
) {
  const account = await tx.pointAccount.findUniqueOrThrow({ where: { id: input.accountId } });
  const recoveryApplied = Math.min(account.recoveryDue, input.amount);
  if (recoveryApplied > 0) {
    const recoveries = await tx.pointTransaction.findMany({
      where: { accountId: account.id, type: 'RECOVERY' },
      include: { consumptionFor: true },
      orderBy: { createdAt: 'asc' },
    });
    let remaining = recoveryApplied;
    for (const recovery of recoveries) {
      const linked = recovery.consumptionFor.reduce((sum, item) => sum + item.amount, 0);
      const outstanding = Math.max(0, Math.abs(recovery.amount) - linked);
      const amount = Math.min(remaining, outstanding);
      if (amount === 0) continue;
      await tx.pointConsumptionLink.create({
        data: {
          consumptionTransactionId: recovery.id,
          grantTransactionId: input.transactionId,
          amount,
        },
      });
      remaining -= amount;
      if (remaining === 0) break;
    }
    if (remaining !== 0)
      throw new ApplicationError('CONFLICT', 'point recovery attribution mismatch');
  }
  return tx.pointAccount.update({
    where: { id: account.id },
    data: {
      recoveryDue: { decrement: recoveryApplied },
      availablePoints: { increment: input.amount - recoveryApplied },
      revision: { increment: 1 },
    },
  });
}

export async function registerPointRecovery(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    groupId: string;
    userId: string;
    actorUserId: string;
    amount: number;
    idempotencyKey: string;
    now: Date;
  },
) {
  const account = await tx.pointAccount.findFirst({
    where: { workspaceId: input.workspaceId, userId: input.userId },
  });
  if (!account) return null;
  const existing = await tx.pointTransaction.findUnique({
    where: {
      accountId_idempotencyKey: {
        accountId: account.id,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (
    existing &&
    (!['REVERSAL', 'RECOVERY'].includes(existing.type) ||
      existing.amount !== -input.amount ||
      existing.workspaceId !== input.workspaceId ||
      existing.userId !== input.userId ||
      existing.groupId !== input.groupId ||
      existing.sourceType !== 'OPERATOR_RECOVERY' ||
      existing.sourceId !== input.actorUserId)
  )
    throw new ApplicationError('CONFLICT', 'idempotency key payload mismatch');
  if (existing) return { applied: false as const };
  const recoveredPoints = Math.min(account.availablePoints, input.amount);
  const recoveryAdded = input.amount - recoveredPoints;
  const changed = await tx.pointAccount.updateMany({
    where: {
      id: account.id,
      availablePoints: account.availablePoints,
      recoveryDue: account.recoveryDue,
      revision: account.revision,
    },
    data: {
      availablePoints: { decrement: recoveredPoints },
      recoveryDue: { increment: recoveryAdded },
      revision: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new ApplicationError('CONFLICT', 'point account changed');
  const transaction = await tx.pointTransaction.create({
    data: {
      accountId: account.id,
      workspaceId: input.workspaceId,
      userId: input.userId,
      groupId: input.groupId,
      type: recoveryAdded > 0 ? 'RECOVERY' : 'REVERSAL',
      amount: -input.amount,
      idempotencyKey: input.idempotencyKey,
      sourceType: 'OPERATOR_RECOVERY',
      sourceId: input.actorUserId,
      createdAt: input.now,
    },
  });
  const grants = await tx.pointTransaction.findMany({
    where: {
      accountId: account.id,
      type: { in: ['GRANT', 'REFUND'] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
    },
    include: { consumptions: true },
  });
  grants.sort((left, right) =>
    left.expiresAt === null
      ? right.expiresAt === null
        ? left.createdAt.getTime() - right.createdAt.getTime()
        : 1
      : right.expiresAt === null
        ? -1
        : left.expiresAt.getTime() - right.expiresAt.getTime(),
  );
  let remaining = recoveredPoints;
  for (const grant of grants) {
    const linked = grant.consumptions.reduce((sum, item) => sum + item.amount, 0);
    const amount = Math.min(remaining, Math.max(0, grant.amount - linked));
    if (amount === 0) continue;
    await tx.pointConsumptionLink.create({
      data: {
        consumptionTransactionId: transaction.id,
        grantTransactionId: grant.id,
        amount,
      },
    });
    remaining -= amount;
    if (remaining === 0) break;
  }
  if (remaining !== 0)
    throw new ApplicationError('CONFLICT', 'point recovery attribution mismatch');
  const updated = await tx.pointAccount.findUniqueOrThrow({ where: { id: account.id } });
  return {
    applied: true as const,
    before: pointAccountRecord(account),
    account: pointAccountRecord(updated),
    recoveredPoints,
    recoveryAdded,
    transaction: pointTransactionRecord(transaction),
  };
}

export async function cancelPointRecovery(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    groupId: string;
    userId: string;
    actorUserId: string;
    recoveryTransactionId: string;
    idempotencyKey: string;
    now: Date;
  },
) {
  const recovery = await tx.pointTransaction.findFirst({
    where: {
      id: input.recoveryTransactionId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      userId: input.userId,
      type: { in: ['REVERSAL', 'RECOVERY'] },
      sourceType: 'OPERATOR_RECOVERY',
    },
    include: { account: true, consumptionFor: true },
  });
  if (!recovery) return null;
  const existingCancellation = await tx.pointTransaction.findFirst({
    where: {
      accountId: recovery.accountId,
      type: 'REFUND',
      sourceType: 'OPERATOR_RECOVERY_CANCELLATION',
      sourceId: recovery.id,
    },
  });
  if (existingCancellation) return { applied: false as const };
  const existingIdempotency = await tx.pointTransaction.findUnique({
    where: {
      accountId_idempotencyKey: {
        accountId: recovery.accountId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existingIdempotency)
    throw new ApplicationError('CONFLICT', 'idempotency key payload mismatch');
  const amount = Math.abs(recovery.amount);
  const recoveredPoints = recovery.consumptionFor.reduce((sum, item) => sum + item.amount, 0);
  if (recoveredPoints > amount)
    throw new ApplicationError('CONFLICT', 'point recovery attribution mismatch');
  const recoveryDueCancelled = amount - recoveredPoints;
  const account = recovery.account;
  if (account.recoveryDue < recoveryDueCancelled)
    throw new ApplicationError('CONFLICT', 'point recovery balance mismatch');
  const changed = await tx.pointAccount.updateMany({
    where: {
      id: account.id,
      availablePoints: account.availablePoints,
      recoveryDue: account.recoveryDue,
      revision: account.revision,
    },
    data: {
      availablePoints: { increment: recoveredPoints },
      recoveryDue: { decrement: recoveryDueCancelled },
      revision: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new ApplicationError('CONFLICT', 'point account changed');
  const cancellation = await tx.pointTransaction.create({
    data: {
      accountId: account.id,
      workspaceId: input.workspaceId,
      userId: input.userId,
      groupId: input.groupId,
      type: 'REFUND',
      amount,
      idempotencyKey: input.idempotencyKey,
      sourceType: 'OPERATOR_RECOVERY_CANCELLATION',
      sourceId: recovery.id,
      createdAt: input.now,
    },
  });
  if (recoveryDueCancelled > 0) {
    await tx.pointConsumptionLink.create({
      data: {
        consumptionTransactionId: recovery.id,
        grantTransactionId: cancellation.id,
        amount: recoveryDueCancelled,
      },
    });
  }
  const updated = await tx.pointAccount.findUniqueOrThrow({ where: { id: account.id } });
  return {
    applied: true as const,
    before: pointAccountRecord(account),
    account: pointAccountRecord(updated),
    amount,
    recoveredPointsRestored: recoveredPoints,
    recoveryDueCancelled,
    recoveryTransaction: pointTransactionRecord(recovery),
    cancellationTransaction: pointTransactionRecord(cancellation),
  };
}

const badgeDefinitionRecord = (
  row: Prisma.BadgeDefinitionGetPayload<object>,
): BadgeDefinitionRecord => ({
  id: row.id,
  ownerType: row.ownerType,
  workspaceId: row.workspaceId,
  groupId: row.groupId,
  code: row.code,
  category: row.category,
  status: row.status,
  currentVersion: row.currentVersion,
});
const badgeVersionRecord = (row: Prisma.BadgeVersionGetPayload<object>): BadgeVersionRecord => ({
  id: row.id,
  definitionId: row.definitionId,
  version: row.version,
  title: row.title,
  description: row.description,
  imageKey: row.imageKey,
  lockedImageKey: row.lockedImageKey,
  altText: row.altText,
  backgroundColor: row.backgroundColor,
  conditionType: row.conditionType,
  conditionConfig: row.conditionConfig as Record<string, unknown>,
  visibilityPolicy: row.visibilityPolicy,
  rewardPolicy: row.rewardPolicy as Record<string, unknown>,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  publishedAt: row.publishedAt,
});
const badgeProgressRecord = (row: Prisma.BadgeProgressGetPayload<object>): BadgeProgressRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  badgeVersionId: row.badgeVersionId,
  groupId: row.groupId,
  currentValue: row.currentValue,
  targetValue: row.targetValue,
  streakState: row.streakState as Record<string, unknown> | null,
  status: row.status,
  lastEventAt: row.lastEventAt,
  revision: row.revision,
});
const badgeAwardRecord = (row: Prisma.BadgeAwardGetPayload<object>): BadgeAwardRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  badgeVersionId: row.badgeVersionId,
  groupId: row.groupId,
  sourceBunshinId: row.sourceBunshinId,
  awardedAt: row.awardedAt,
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  evidenceHash: row.evidenceHash,
  idempotencyKey: row.idempotencyKey,
  status: row.status,
});
const badgeProcessingEventRecord = (
  row: Prisma.BadgeProcessingEventGetPayload<object>,
): BadgeProcessingEventRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  eventType: row.eventType,
  sourceEventId: row.sourceEventId,
  status: row.status,
  failureCode: row.failureCode,
  processedAt: row.processedAt,
});

export class PrismaBadgeCoreRepository implements BadgeCoreRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private activeMember(
    tx: Prisma.TransactionClient | PrismaClient,
    workspaceId: string,
    userId: string,
  ) {
    return tx.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  private async canManageDefinition(
    tx: Prisma.TransactionClient | PrismaClient,
    input: {
      actorUserId: string;
      ownerType: 'SYSTEM' | 'GROUP';
      workspaceId: string | null;
      groupId: string | null;
    },
  ) {
    if (input.ownerType === 'SYSTEM')
      return tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });
    if (!input.workspaceId || !input.groupId) return null;
    return tx.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        role: 'MANAGER',
        status: 'ACTIVE',
        group: { status: 'ACTIVE' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }

  async createDefinition(input: Parameters<BadgeCoreRepository['createDefinition']>[0]) {
    if (!(await this.canManageDefinition(this.client, input))) return null;
    try {
      return badgeDefinitionRecord(
        await this.client.$transaction(async (tx) => {
          const definition = await tx.badgeDefinition.create({
            data: {
              ownerType: input.ownerType,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              code: input.code,
              category: input.category,
            },
          });
          await tx.badgeAdminAuditLog.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              badgeDefinitionId: definition.id,
              action: 'DEFINITION_CREATED',
              afterData: { code: definition.code, category: definition.category },
              reason: input.reason,
              performedByUserId: input.actorUserId,
            },
          });
          return definition;
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'badge definition already exists');
      throw error;
    }
  }

  async createVersion(input: Parameters<BadgeCoreRepository['createVersion']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const definition = await tx.badgeDefinition.findUnique({
          where: { id: input.definitionId },
        });
        if (
          !definition ||
          definition.status === 'SUPERSEDED' ||
          !(await this.canManageDefinition(tx, {
            actorUserId: input.actorUserId,
            ownerType: definition.ownerType,
            workspaceId: definition.workspaceId,
            groupId: definition.groupId,
          }))
        )
          return null;
        const version = definition.currentVersion + 1;
        const row = await tx.badgeVersion.create({
          data: {
            definitionId: definition.id,
            version,
            title: input.title,
            description: input.description,
            imageKey: input.imageKey,
            lockedImageKey: input.lockedImageKey,
            altText: input.altText,
            backgroundColor: input.backgroundColor,
            conditionType: input.conditionType,
            conditionConfig: input.conditionConfig as Prisma.InputJsonValue,
            visibilityPolicy: input.visibilityPolicy,
            rewardPolicy: input.rewardPolicy as Prisma.InputJsonValue,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
          },
        });
        await tx.badgeDefinition.update({
          where: { id: definition.id },
          data: { currentVersion: version },
        });
        await tx.badgeAdminAuditLog.create({
          data: {
            workspaceId: definition.workspaceId,
            groupId: definition.groupId,
            badgeDefinitionId: definition.id,
            badgeVersionId: row.id,
            action: 'VERSION_CREATED',
            afterData: { version, conditionType: row.conditionType },
            reason: input.reason,
            performedByUserId: input.actorUserId,
          },
        });
        return badgeVersionRecord(row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async publishVersion(input: Parameters<BadgeCoreRepository['publishVersion']>[0]) {
    return this.client.$transaction(async (tx) => {
      const definition = await tx.badgeDefinition.findUnique({
        where: { id: input.definitionId },
      });
      if (definition?.ownerType === 'GROUP') return null;
      if (
        !definition ||
        !(await this.canManageDefinition(tx, {
          actorUserId: input.actorUserId,
          ownerType: definition.ownerType,
          workspaceId: definition.workspaceId,
          groupId: definition.groupId,
        }))
      )
        return null;
      const version = await tx.badgeVersion.findFirst({
        where: { id: input.badgeVersionId, definitionId: definition.id, publishedAt: null },
      });
      if (!version || version.version !== definition.currentVersion) return null;
      const row = await tx.badgeVersion.update({
        where: { id: version.id },
        data: { publishedAt: input.publishedAt },
      });
      await tx.badgeDefinition.update({
        where: { id: definition.id },
        data: { status: 'ACTIVE' },
      });
      await tx.badgeAdminAuditLog.create({
        data: {
          workspaceId: definition.workspaceId,
          groupId: definition.groupId,
          badgeDefinitionId: definition.id,
          badgeVersionId: row.id,
          action: 'VERSION_PUBLISHED',
          afterData: { version: row.version, publishedAt: input.publishedAt.toISOString() },
          reason: input.reason,
          performedByUserId: input.actorUserId,
        },
      });
      return badgeVersionRecord(row);
    });
  }

  private async eligibleVersion(
    tx: Prisma.TransactionClient | PrismaClient,
    input: { workspaceId: string; userId: string; badgeVersionId: string; groupId: string | null },
  ) {
    if (!(await this.activeMember(tx, input.workspaceId, input.userId))) return null;
    const version = await tx.badgeVersion.findFirst({
      where: {
        id: input.badgeVersionId,
        publishedAt: { not: null },
      },
    });
    if (!version) return null;
    const definition = await tx.badgeDefinition.findFirst({
      where: {
        id: version.definitionId,
        status: 'ACTIVE',
        OR: [
          { ownerType: 'SYSTEM', workspaceId: null, groupId: null },
          {
            ownerType: 'GROUP',
            workspaceId: input.workspaceId,
            groupId: input.groupId,
          },
        ],
      },
    });
    if (!definition) return null;
    if (definition.ownerType === 'GROUP') {
      const member = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: definition.groupId!,
          userId: input.userId,
          status: 'ACTIVE',
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
      if (!member || input.groupId !== definition.groupId) return null;
    } else if (input.groupId !== null) return null;
    return version;
  }

  async saveProgress(input: Parameters<BadgeCoreRepository['saveProgress']>[0]) {
    if (!(await this.eligibleVersion(this.client, input))) return null;
    return badgeProgressRecord(
      await this.client.badgeProgress.upsert({
        where: {
          workspaceId_userId_badgeVersionId: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            badgeVersionId: input.badgeVersionId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          badgeVersionId: input.badgeVersionId,
          groupId: input.groupId,
          currentValue: input.currentValue,
          targetValue: input.targetValue,
          streakState:
            input.streakState === null
              ? Prisma.JsonNull
              : (input.streakState as Prisma.InputJsonValue),
          status: input.status,
          lastEventAt: input.lastEventAt,
        },
        update: {
          currentValue: input.currentValue,
          targetValue: input.targetValue,
          streakState:
            input.streakState === null
              ? Prisma.JsonNull
              : (input.streakState as Prisma.InputJsonValue),
          status: input.status,
          lastEventAt: input.lastEventAt,
          revision: { increment: 1 },
        },
      }),
    );
  }

  async award(input: Parameters<BadgeCoreRepository['award']>[0]) {
    if (!(await this.eligibleVersion(this.client, input))) return null;
    if (input.sourceBunshinId) {
      const bunshin = await this.client.bunshin.findFirst({
        where: {
          id: input.sourceBunshinId,
          workspaceId: input.workspaceId,
          ownerUserId: input.userId,
          status: { not: 'ARCHIVED' },
        },
        select: { id: true },
      });
      if (!bunshin) return null;
    }
    return this.client.$transaction(async (tx) => {
      const existing = await tx.badgeAward.findFirst({
        where: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          OR: [{ idempotencyKey: input.idempotencyKey }, { badgeVersionId: input.badgeVersionId }],
        },
      });
      if (existing) {
        if (
          existing.badgeVersionId !== input.badgeVersionId ||
          existing.sourceType !== input.sourceType ||
          existing.sourceId !== input.sourceId ||
          existing.evidenceHash !== input.evidenceHash
        )
          throw new ApplicationError('CONFLICT', 'badge award idempotency mismatch');
        return badgeAwardRecord(existing);
      }
      const row = await tx.badgeAward.create({ data: input });
      await tx.badgeProgress.upsert({
        where: {
          workspaceId_userId_badgeVersionId: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            badgeVersionId: input.badgeVersionId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          badgeVersionId: input.badgeVersionId,
          groupId: input.groupId,
          currentValue: 1,
          targetValue: 1,
          status: 'AWARDED',
          lastEventAt: input.awardedAt,
        },
        update: { status: 'AWARDED', lastEventAt: input.awardedAt, revision: { increment: 1 } },
      });
      return badgeAwardRecord(row);
    });
  }

  async recordProcessingEvent(input: Parameters<BadgeCoreRepository['recordProcessingEvent']>[0]) {
    if (!(await this.activeMember(this.client, input.workspaceId, input.userId))) return null;
    const existing = await this.client.badgeProcessingEvent.findUnique({
      where: {
        workspaceId_eventType_sourceEventId: {
          workspaceId: input.workspaceId,
          eventType: input.eventType,
          sourceEventId: input.sourceEventId,
        },
      },
    });
    if (existing && existing.userId !== input.userId)
      throw new ApplicationError('CONFLICT', 'badge event scope mismatch');
    return badgeProcessingEventRecord(
      await this.client.badgeProcessingEvent.upsert({
        where: {
          workspaceId_eventType_sourceEventId: {
            workspaceId: input.workspaceId,
            eventType: input.eventType,
            sourceEventId: input.sourceEventId,
          },
        },
        create: input,
        update: {
          status: input.status,
          failureCode: input.failureCode,
          processedAt: input.processedAt,
        },
      }),
    );
  }
}

const pointTransactionRecord = (
  row: Prisma.PointTransactionGetPayload<object>,
): PointTransactionRecord => ({
  id: row.id,
  accountId: row.accountId,
  workspaceId: row.workspaceId,
  userId: row.userId,
  groupId: row.groupId,
  campaignId: row.campaignId,
  type: row.type,
  amount: row.amount,
  idempotencyKey: row.idempotencyKey,
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  ruleVersionId: row.ruleVersionId,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
});

export class PrismaPointLedgerRepository implements PointLedgerRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async activeMember(tx: Prisma.TransactionClient, workspaceId: string, userId: string) {
    return tx.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  private async validAttribution(
    tx: Prisma.TransactionClient,
    input: { workspaceId: string; groupId: string | null; campaignId: string | null },
  ) {
    if (input.campaignId && !input.groupId) return false;
    if (input.groupId) {
      const group = await tx.group.findFirst({
        where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!group) return false;
    }
    if (input.campaignId) {
      const campaign = await tx.campaign.findFirst({
        where: {
          id: input.campaignId,
          workspaceId: input.workspaceId,
          groupId: input.groupId!,
        },
        select: { id: true },
      });
      if (!campaign) return false;
    }
    return true;
  }

  async getAccount(input: { workspaceId: string; actorUserId: string }) {
    const row = await this.client.pointAccount.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
        AND: {
          workspace: {
            memberships: {
              some: { userId: input.actorUserId, status: 'ACTIVE' },
            },
          },
        },
      },
    });
    return row ? pointAccountRecord(row) : null;
  }

  async getUserDashboard(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    now: Date;
    timezone: string;
  }): Promise<PointUserDashboard | null> {
    const membership = await this.client.workspaceMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!membership) return null;

    const groupMembership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        group: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!groupMembership) return null;

    const campaignParticipations = await this.client.campaignParticipation.findMany({
      where: {
        userId: input.actorUserId,
        status: 'ACCEPTED',
        campaign: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'OPEN',
          startsAt: { lte: input.now },
          endsAt: { gt: input.now },
        },
      },
      select: { campaignId: true, campaign: { select: { name: true } } },
    });
    const campaignIds = campaignParticipations.map(({ campaignId }) => campaignId);

    const account = await this.client.pointAccount.findUnique({
      where: {
        workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId },
      },
    });
    const emptyAccount: PointAccountSnapshot = {
      id: '',
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
      availablePoints: 0,
      recoveryDue: 0,
      updatedAt: input.now,
    };
    const thirtyDaysLater = new Date(input.now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [transactions, expiring, rules, posts] = await Promise.all([
      account
        ? this.client.pointTransaction.findMany({
            where: {
              accountId: account.id,
              workspaceId: input.workspaceId,
              userId: input.actorUserId,
              OR: [{ groupId: input.groupId }, { groupId: null }],
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : [],
      account
        ? this.client.pointTransaction.findMany({
            where: {
              accountId: account.id,
              workspaceId: input.workspaceId,
              userId: input.actorUserId,
              type: 'GRANT',
              expiresAt: { gt: input.now, lte: thirtyDaysLater },
            },
            select: {
              amount: true,
              expiresAt: true,
              consumptions: { select: { amount: true } },
            },
            orderBy: { expiresAt: 'asc' },
          })
        : [],
      this.client.pointRuleVersion.findMany({
        where: {
          status: { in: ['ACTIVE', 'SUSPENDED'] },
          OR: [{ groupId: null }, { groupId: input.groupId }],
          AND: [
            { OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }] },
            { OR: [{ campaignId: null }, { campaignId: { in: campaignIds } }] },
            { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
          ],
        },
        select: {
          ruleKey: true,
          grantAmount: true,
          dailyLimit: true,
          weeklyLimit: true,
          workspaceId: true,
          groupId: true,
          campaignId: true,
          campaign: { select: { name: true } },
          status: true,
          version: true,
        },
        orderBy: [{ ruleKey: 'asc' }, { version: 'desc' }],
      }),
      this.client.postRecord.findMany({
        where: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          bunshin: { groupId: input.groupId },
        },
        select: { postedAt: true },
        orderBy: { postedAt: 'desc' },
        take: 20,
      }),
    ]);
    const weekKey = pointWeekKey(input.now, input.timezone);
    const uniqueRules = new Map<string, (typeof rules)[number]>();
    rules
      .sort(
        (left, right) =>
          Number(Boolean(right.groupId)) - Number(Boolean(left.groupId)) ||
          Number(right.workspaceId === input.workspaceId) -
            Number(left.workspaceId === input.workspaceId) ||
          right.version - left.version,
      )
      .forEach((rule) => {
        const key = `${rule.campaignId ?? 'service'}:${rule.ruleKey}`;
        if (!uniqueRules.has(key)) uniqueRules.set(key, rule);
      });
    const expiringBalances = expiring
      .map((item) => ({
        expiresAt: item.expiresAt,
        amount: Math.max(
          0,
          item.amount - item.consumptions.reduce((used, link) => used + link.amount, 0),
        ),
      }))
      .filter((item) => item.amount > 0);
    return {
      account: account ? pointAccountRecord(account) : emptyAccount,
      recentTransactions: transactions.map(pointTransactionRecord),
      expiringWithin30Days: expiringBalances.reduce((sum, item) => sum + item.amount, 0),
      nextExpiryAt: expiringBalances[0]?.expiresAt ?? null,
      earningMethods: [...uniqueRules.values()]
        .filter((rule) => rule.status === 'ACTIVE')
        .map((rule) => ({
          ruleKey: rule.ruleKey,
          campaignId: rule.campaignId,
          campaignName: rule.campaign?.name ?? null,
          grantAmount: rule.grantAmount,
          dailyLimit: rule.dailyLimit,
          weeklyLimit: rule.weeklyLimit,
        })),
      weeklyPosts: posts.filter((post) => pointWeekKey(post.postedAt, input.timezone) === weekKey)
        .length,
      weeklyPostGoal: 3,
    };
  }

  async grant(input: Parameters<PointLedgerRepository['grant']>[0]) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          if (!(await this.activeMember(tx, input.workspaceId, input.actorUserId))) return null;
          if (!(await this.validAttribution(tx, input))) return null;
          if (input.ruleVersionId) {
            const rule = await tx.pointRuleVersion.findFirst({
              where: {
                id: input.ruleVersionId,
                status: 'ACTIVE',
                OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
              },
              select: { id: true },
            });
            if (!rule) return null;
          }
          const account = await tx.pointAccount.upsert({
            where: {
              workspaceId_userId: {
                workspaceId: input.workspaceId,
                userId: input.actorUserId,
              },
            },
            create: { workspaceId: input.workspaceId, userId: input.actorUserId },
            update: {},
          });
          const existing = await tx.pointTransaction.findUnique({
            where: {
              accountId_idempotencyKey: {
                accountId: account.id,
                idempotencyKey: input.idempotencyKey,
              },
            },
          });
          if (existing && (existing.type !== 'GRANT' || existing.amount !== input.amount))
            throw new ApplicationError('CONFLICT', 'idempotency key payload mismatch');
          if (existing)
            return {
              account: pointAccountRecord(account),
              transaction: pointTransactionRecord(existing),
            };
          const transaction = await tx.pointTransaction.create({
            data: {
              accountId: account.id,
              workspaceId: input.workspaceId,
              userId: input.actorUserId,
              groupId: input.groupId,
              campaignId: input.campaignId,
              ruleVersionId: input.ruleVersionId,
              type: 'GRANT',
              amount: input.amount,
              idempotencyKey: input.idempotencyKey,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
              expiresAt: input.expiresAt,
            },
          });
          const updated = await applyPointCreditToAccount(tx, {
            accountId: account.id,
            transactionId: transaction.id,
            amount: input.amount,
          });
          return {
            account: pointAccountRecord(updated),
            transaction: pointTransactionRecord(transaction),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const account = await this.client.pointAccount.findUnique({
        where: {
          workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId },
        },
      });
      if (!account) throw error;
      const transaction = await this.client.pointTransaction.findUnique({
        where: {
          accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey },
        },
      });
      if (!transaction) throw error;
      return {
        account: pointAccountRecord(account),
        transaction: pointTransactionRecord(transaction),
      };
    }
  }

  async consume(input: Parameters<PointLedgerRepository['consume']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        if (!(await this.activeMember(tx, input.workspaceId, input.actorUserId))) return null;
        if (!(await this.validAttribution(tx, input))) return null;
        const account = await tx.pointAccount.findUnique({
          where: {
            workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId },
          },
        });
        if (!account) return null;
        const existing = await tx.pointTransaction.findUnique({
          where: {
            accountId_idempotencyKey: {
              accountId: account.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing && (existing.type !== 'CONSUME' || existing.amount !== -input.amount))
          throw new ApplicationError('CONFLICT', 'idempotency key payload mismatch');
        if (existing)
          return {
            account: pointAccountRecord(account),
            transaction: pointTransactionRecord(existing),
          };
        const changed = await tx.pointAccount.updateMany({
          where: { id: account.id, availablePoints: { gte: input.amount }, recoveryDue: 0 },
          data: { availablePoints: { decrement: input.amount }, revision: { increment: 1 } },
        });
        if (changed.count !== 1) return null;
        const transaction = await tx.pointTransaction.create({
          data: {
            accountId: account.id,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            groupId: input.groupId,
            campaignId: input.campaignId,
            type: 'CONSUME',
            amount: -input.amount,
            idempotencyKey: input.idempotencyKey,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          },
        });
        const grants = await tx.pointTransaction.findMany({
          where: {
            accountId: account.id,
            type: { in: ['GRANT', 'REFUND'] },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: { consumptions: true },
        });
        grants.sort((left, right) =>
          left.expiresAt === null
            ? right.expiresAt === null
              ? left.createdAt.getTime() - right.createdAt.getTime()
              : 1
            : right.expiresAt === null
              ? -1
              : left.expiresAt.getTime() - right.expiresAt.getTime(),
        );
        let remaining = input.amount;
        for (const grant of grants) {
          const used = grant.consumptions.reduce((sum, link) => sum + link.amount, 0);
          const available = grant.amount - used;
          if (available <= 0) continue;
          const amount = Math.min(remaining, available);
          await tx.pointConsumptionLink.create({
            data: {
              consumptionTransactionId: transaction.id,
              grantTransactionId: grant.id,
              amount,
            },
          });
          remaining -= amount;
          if (remaining === 0) break;
        }
        if (remaining !== 0)
          throw new ApplicationError('CONFLICT', 'point ledger balance mismatch');
        const updated = await tx.pointAccount.findUniqueOrThrow({ where: { id: account.id } });
        return {
          account: pointAccountRecord(updated),
          transaction: pointTransactionRecord(transaction),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async refund(input: Parameters<PointLedgerRepository['refund']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        if (!(await this.activeMember(tx, input.workspaceId, input.actorUserId))) return null;
        const consumption = await tx.pointTransaction.findFirst({
          where: {
            id: input.consumptionTransactionId,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            type: 'CONSUME',
          },
        });
        if (!consumption) return null;
        const existing = await tx.pointTransaction.findUnique({
          where: {
            accountId_idempotencyKey: {
              accountId: consumption.accountId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (
          existing &&
          (existing.type !== 'REFUND' || existing.sourceId !== input.consumptionTransactionId)
        )
          throw new ApplicationError('CONFLICT', 'idempotency key payload mismatch');
        if (existing) {
          const account = await tx.pointAccount.findUniqueOrThrow({
            where: { id: consumption.accountId },
          });
          return {
            account: pointAccountRecord(account),
            transaction: pointTransactionRecord(existing),
          };
        }
        const previous = await tx.pointTransaction.aggregate({
          where: {
            accountId: consumption.accountId,
            type: 'REFUND',
            sourceType: 'CONSUMPTION_REFUND',
            sourceId: consumption.id,
          },
          _sum: { amount: true },
        });
        const amount = Math.abs(consumption.amount) - (previous._sum.amount ?? 0);
        if (amount <= 0) return null;
        const transaction = await tx.pointTransaction.create({
          data: {
            accountId: consumption.accountId,
            workspaceId: consumption.workspaceId,
            userId: consumption.userId,
            groupId: consumption.groupId,
            campaignId: consumption.campaignId,
            type: 'REFUND',
            amount,
            idempotencyKey: input.idempotencyKey,
            sourceType: 'CONSUMPTION_REFUND',
            sourceId: consumption.id,
          },
        });
        const account = await applyPointCreditToAccount(tx, {
          accountId: consumption.accountId,
          transactionId: transaction.id,
          amount,
        });
        return {
          account: pointAccountRecord(account),
          transaction: pointTransactionRecord(transaction),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

const pointCatalogItemRecord = (
  row: Prisma.PointRewardCatalogItemGetPayload<object>,
): PointRewardCatalogItemRecord => ({
  id: row.id,
  rewardKey: row.rewardKey,
  version: row.version,
  rewardType: row.rewardType,
  title: row.title,
  description: row.description,
  pointCost: row.pointCost,
});

const pointRedemptionRecord = (
  row: Prisma.PointRedemptionGetPayload<object>,
): PointRedemptionRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  accountId: row.accountId,
  catalogItemId: row.catalogItemId,
  consumptionTransactionId: row.consumptionTransactionId,
  status: row.status,
  pointCost: row.pointCost,
  idempotencyKey: row.idempotencyKey,
  resourceType: row.resourceType,
  resourceId: row.resourceId,
  reservedAt: row.reservedAt,
  reservationExpiresAt: row.reservationExpiresAt,
  confirmedAt: row.confirmedAt,
  releasedAt: row.releasedAt,
  refundedAt: row.refundedAt,
  failureReason: row.failureReason,
});

export class PrismaPointRedemptionRepository implements PointRedemptionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async activeMember(workspaceId: string, userId: string, groupId?: string | null) {
    if (groupId)
      return this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId,
          status: 'ACTIVE',
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
          user: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
    return this.client.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  async listCatalog(input: Parameters<PointRedemptionRepository['listCatalog']>[0]) {
    if (!(await this.activeMember(input.workspaceId, input.actorUserId, input.groupId)))
      return null;
    const [rows, settings] = await Promise.all([
      this.client.pointRewardCatalogItem.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
        },
        orderBy: [{ rewardKey: 'asc' }, { version: 'desc' }],
      }),
      input.groupId
        ? this.client.servicePointRewardSetting.findMany({
            where: { workspaceId: input.workspaceId, groupId: input.groupId },
            select: { rewardType: true, status: true, pointCost: true },
          })
        : Promise.resolve([]),
    ]);
    const unique = new Map<string, (typeof rows)[number]>();
    rows.forEach((row) => {
      if (!unique.has(row.rewardKey)) unique.set(row.rewardKey, row);
    });
    return applyPointRewardSettings(
      [...unique.values()].map(pointCatalogItemRecord),
      settings.map((setting) => ({
        rewardType: setting.rewardType,
        status: setting.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
        pointCost: setting.pointCost,
      })),
    );
  }

  async reserve(input: Parameters<PointRedemptionRepository['reserve']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const member = input.groupId
          ? await tx.groupMembership.findFirst({
              where: {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                userId: input.actorUserId,
                status: 'ACTIVE',
                group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
                user: { status: 'ACTIVE' },
              },
              select: { id: true },
            })
          : await tx.workspaceMembership.findFirst({
              where: {
                workspaceId: input.workspaceId,
                userId: input.actorUserId,
                status: 'ACTIVE',
                workspace: { status: 'ACTIVE' },
                user: { status: 'ACTIVE' },
              },
              select: { id: true },
            });
        if (!member) return null;
        const account = await tx.pointAccount.findUnique({
          where: {
            workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId },
          },
        });
        if (!account) return null;
        const existing = await tx.pointRedemption.findUnique({
          where: {
            accountId_idempotencyKey: {
              accountId: account.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { consumptionTransaction: { select: { groupId: true } } },
        });
        if (existing) {
          if (
            existing.catalogItemId !== input.catalogItemId ||
            existing.resourceType !== input.resourceType ||
            existing.resourceId !== input.resourceId ||
            (existing.consumptionTransaction.groupId !== null &&
              existing.consumptionTransaction.groupId !== (input.groupId ?? null))
          )
            throw new ApplicationError('CONFLICT', 'idempotency key payload mismatch');
          return pointRedemptionRecord(existing);
        }
        const item = await tx.pointRewardCatalogItem.findFirst({
          where: {
            id: input.catalogItemId,
            status: 'ACTIVE',
            OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
          },
        });
        if (!item) return null;
        const setting = input.groupId
          ? await tx.servicePointRewardSetting.findUnique({
              where: {
                workspaceId_groupId_rewardType: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  rewardType: item.rewardType,
                },
              },
              select: { status: true, pointCost: true },
            })
          : null;
        if (setting && setting.status !== 'ACTIVE') return null;
        const pointCost = setting?.pointCost ?? item.pointCost;
        if (input.expectedPointCost !== undefined && input.expectedPointCost !== pointCost)
          throw new ApplicationError('CONFLICT', 'point reward cost changed', {
            currentPointCost: pointCost,
          });
        const changed = await tx.pointAccount.updateMany({
          where: { id: account.id, availablePoints: { gte: pointCost }, recoveryDue: 0 },
          data: { availablePoints: { decrement: pointCost }, revision: { increment: 1 } },
        });
        if (changed.count !== 1) return null;
        const consumption = await tx.pointTransaction.create({
          data: {
            accountId: account.id,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            groupId: input.groupId ?? null,
            type: 'CONSUME',
            amount: -pointCost,
            idempotencyKey: `redemption:${input.idempotencyKey}`,
            sourceType: 'POINT_REDEMPTION',
            sourceId: null,
          },
        });
        const grants = await tx.pointTransaction.findMany({
          where: {
            accountId: account.id,
            type: { in: ['GRANT', 'REFUND'] },
            OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
          },
          include: { consumptions: true },
        });
        grants.sort((left, right) => {
          if (left.expiresAt === null) return right.expiresAt === null ? 0 : 1;
          if (right.expiresAt === null) return -1;
          return left.expiresAt.getTime() - right.expiresAt.getTime();
        });
        let remaining = pointCost;
        for (const grant of grants) {
          const used = grant.consumptions.reduce((sum, link) => sum + link.amount, 0);
          const amount = Math.min(remaining, Math.max(0, grant.amount - used));
          if (amount === 0) continue;
          await tx.pointConsumptionLink.create({
            data: {
              consumptionTransactionId: consumption.id,
              grantTransactionId: grant.id,
              amount,
            },
          });
          remaining -= amount;
          if (remaining === 0) break;
        }
        if (remaining !== 0)
          throw new ApplicationError('CONFLICT', 'point ledger balance mismatch');
        const redemption = await tx.pointRedemption.create({
          data: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            accountId: account.id,
            catalogItemId: item.id,
            consumptionTransactionId: consumption.id,
            pointCost,
            idempotencyKey: input.idempotencyKey,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            reservedAt: input.now,
            reservationExpiresAt: input.reservationExpiresAt,
          },
        });
        await tx.pointTransaction.update({
          where: { id: consumption.id },
          data: { sourceId: redemption.id },
        });
        return pointRedemptionRecord(redemption);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findOwnedByResource(
    input: Parameters<PointRedemptionRepository['findOwnedByResource']>[0],
  ) {
    const row = await this.client.pointRedemption.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
        user: { status: 'ACTIVE' },
      },
    });
    return row ? pointRedemptionRecord(row) : null;
  }

  async transition(input: Parameters<PointRedemptionRepository['transition']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const redemption = await tx.pointRedemption.findFirst({
          where: {
            id: input.redemptionId,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            workspace: { memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } } },
          },
        });
        if (!redemption) return null;
        if (redemption.status === input.targetStatus) return pointRedemptionRecord(redemption);
        const expected = input.targetStatus === 'REFUNDED' ? 'CONFIRMED' : 'RESERVED';
        if (redemption.status !== expected) return null;
        if (input.targetStatus === 'CONFIRMED' && redemption.reservationExpiresAt <= input.now)
          return null;
        if (input.targetStatus !== 'CONFIRMED') {
          const refundKey = `redemption:${redemption.id}:${input.targetStatus}`;
          const refund = await tx.pointTransaction.create({
            data: {
              accountId: redemption.accountId,
              workspaceId: redemption.workspaceId,
              userId: redemption.userId,
              type: 'REFUND',
              amount: redemption.pointCost,
              idempotencyKey: refundKey,
              sourceType: 'POINT_REDEMPTION_REFUND',
              sourceId: redemption.consumptionTransactionId,
            },
          });
          await applyPointCreditToAccount(tx, {
            accountId: redemption.accountId,
            transactionId: refund.id,
            amount: redemption.pointCost,
          });
        }
        const updated = await tx.pointRedemption.update({
          where: { id: redemption.id },
          data:
            input.targetStatus === 'CONFIRMED'
              ? { status: 'CONFIRMED', confirmedAt: input.now }
              : input.targetStatus === 'RELEASED'
                ? { status: 'RELEASED', releasedAt: input.now, failureReason: input.reason }
                : { status: 'REFUNDED', refundedAt: input.now, failureReason: input.reason },
        });
        return pointRedemptionRecord(updated);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async releaseExpired(input: Parameters<PointRedemptionRepository['releaseExpired']>[0]) {
    const candidates = await this.client.pointRedemption.findMany({
      where: { status: 'RESERVED', reservationExpiresAt: { lte: input.now } },
      select: { id: true },
      orderBy: { reservationExpiresAt: 'asc' },
      take: input.limit,
    });
    let released = 0;
    for (const candidate of candidates) {
      const changed = await this.client.$transaction(
        async (tx) => {
          const redemption = await tx.pointRedemption.findUnique({ where: { id: candidate.id } });
          if (
            !redemption ||
            redemption.status !== 'RESERVED' ||
            redemption.reservationExpiresAt > input.now
          )
            return false;
          const claimed = await tx.pointRedemption.updateMany({
            where: { id: redemption.id, status: 'RESERVED' },
            data: {
              status: 'RELEASED',
              releasedAt: input.now,
              failureReason: 'RESERVATION_EXPIRED',
            },
          });
          if (claimed.count !== 1) return false;
          const refund = await tx.pointTransaction.create({
            data: {
              accountId: redemption.accountId,
              workspaceId: redemption.workspaceId,
              userId: redemption.userId,
              type: 'REFUND',
              amount: redemption.pointCost,
              idempotencyKey: `redemption:${redemption.id}:RELEASED`,
              sourceType: 'POINT_REDEMPTION_REFUND',
              sourceId: redemption.consumptionTransactionId,
            },
          });
          await applyPointCreditToAccount(tx, {
            accountId: redemption.accountId,
            transactionId: refund.id,
            amount: redemption.pointCost,
          });
          return true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (changed) released += 1;
    }
    return released;
  }
}

const pointDateParts = (value: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
};

const pointDayKey = (value: Date, timezone: string) => {
  const { year, month, day } = pointDateParts(value, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const pointWeekKey = (value: Date, timezone: string) => {
  const { year, month, day } = pointDateParts(value, timezone);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return pointDayKey(date, 'UTC');
};

const pointExpiry = (value: Date) => {
  const after180Days = new Date(value.getTime() + 180 * 24 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(after180Days.getUTCFullYear(), after180Days.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
};

export class PrismaPointActivityProcessorRepository implements PointActivityProcessorRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listCandidates(input: { limit: number }): Promise<PointActivityCandidate[]> {
    const rows = await this.client.$queryRaw<
      Array<{
        workspaceId: string;
        actorUserId: string;
        eventType: PointActivityCandidate['eventType'];
        sourceEventId: string;
        occurredAt: Date;
      }>
    >(Prisma.sql`
      SELECT candidate."workspaceId", candidate."actorUserId", candidate."eventType",
             candidate."sourceEventId", candidate."occurredAt"
      FROM (
        SELECT activity."workspace_id" AS "workspaceId",
               activity."actor_user_id" AS "actorUserId",
               'MISSION_VIEWED'::text AS "eventType",
               activity."id" AS "sourceEventId",
               activity."occurred_at" AS "occurredAt"
        FROM "mission_activities" activity
        WHERE activity."type" = 'VIEWED'
        UNION ALL
        SELECT post."workspace_id", post."actor_user_id", 'POSTED'::text,
               post."id", post."posted_at"
        FROM "post_records" post
      ) candidate
      WHERE NOT EXISTS (
        SELECT 1 FROM "point_processing_events" processed
        WHERE processed."workspace_id" = candidate."workspaceId"
          AND processed."event_type" = candidate."eventType"
          AND processed."source_event_id" = candidate."sourceEventId"::text
          AND processed."status" = 'COMPLETED'
      )
      ORDER BY candidate."occurredAt" ASC, candidate."sourceEventId" ASC
      LIMIT ${input.limit}
    `);
    return rows;
  }

  async process(
    input: PointActivityCandidate & { timezone: string },
  ): Promise<PointActivityProcessResult> {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const membership = await tx.workspaceMembership.findFirst({
            where: {
              workspaceId: input.workspaceId,
              userId: input.actorUserId,
              status: 'ACTIVE',
              workspace: { status: 'ACTIVE' },
              user: { status: 'ACTIVE' },
            },
            select: { id: true },
          });
          if (!membership) return 'NOT_ELIGIBLE';
          const previousProcessing = await tx.pointProcessingEvent.findUnique({
            where: {
              workspaceId_eventType_sourceEventId: {
                workspaceId: input.workspaceId,
                eventType: input.eventType,
                sourceEventId: input.sourceEventId,
              },
            },
          });
          if (previousProcessing?.status === 'COMPLETED') return 'ALREADY_PROCESSED';
          const processing = previousProcessing
            ? await tx.pointProcessingEvent.update({
                where: { id: previousProcessing.id },
                data: { status: 'PROCESSING', failureCode: null, processedAt: null },
              })
            : await tx.pointProcessingEvent.create({
                data: {
                  workspaceId: input.workspaceId,
                  userId: input.actorUserId,
                  eventType: input.eventType,
                  sourceEventId: input.sourceEventId,
                },
              });
          let groupId: string | null = null;
          let campaignId: string | null = null;
          if (input.eventType === 'MISSION_VIEWED') {
            const event = await tx.missionActivity.findFirst({
              where: {
                id: input.sourceEventId,
                workspaceId: input.workspaceId,
                actorUserId: input.actorUserId,
                type: 'VIEWED',
              },
              select: {
                occurredAt: true,
                dailyMission: {
                  select: { campaignId: true, bunshin: { select: { groupId: true } } },
                },
              },
            });
            if (!event) {
              await tx.pointProcessingEvent.update({
                where: { id: processing.id },
                data: { status: 'COMPLETED', processedAt: new Date() },
              });
              return 'NOT_ELIGIBLE';
            }
            campaignId = event.dailyMission.campaignId;
            groupId = event.dailyMission.bunshin.groupId;
          } else {
            const event = await tx.postRecord.findFirst({
              where: {
                id: input.sourceEventId,
                workspaceId: input.workspaceId,
                actorUserId: input.actorUserId,
              },
              select: {
                postedAt: true,
                dailyMission: {
                  select: { campaignId: true, bunshin: { select: { groupId: true } } },
                },
              },
            });
            if (!event) {
              await tx.pointProcessingEvent.update({
                where: { id: processing.id },
                data: { status: 'COMPLETED', processedAt: new Date() },
              });
              return 'NOT_ELIGIBLE';
            }
            campaignId = event.dailyMission.campaignId;
            groupId = event.dailyMission.bunshin.groupId;
          }
          if (campaignId) {
            const campaign = await tx.campaign.findFirst({
              where: { id: campaignId, workspaceId: input.workspaceId },
              select: { groupId: true },
            });
            if (!campaign) {
              await tx.pointProcessingEvent.update({
                where: { id: processing.id },
                data: { status: 'COMPLETED', processedAt: new Date() },
              });
              return 'NOT_ELIGIBLE';
            }
            groupId = campaign.groupId;
          }
          if (groupId) {
            const pilotEnabled = await hasActiveRewardsPilotAccess(
              tx,
              {
                workspaceId: input.workspaceId,
                groupId,
                userId: input.actorUserId,
              },
              input.occurredAt,
            );
            if (!pilotEnabled) {
              await tx.pointProcessingEvent.update({
                where: { id: processing.id },
                data: {
                  status: 'COMPLETED',
                  failureCode: 'REWARDS_PILOT_UNAVAILABLE',
                  processedAt: new Date(),
                },
              });
              return 'NOT_ELIGIBLE';
            }
            const pointControl = await tx.serviceConfiguration.findFirst({
              where: { workspaceId: input.workspaceId, groupId },
              select: { pointIssuanceStopped: true },
            });
            if (pointControl?.pointIssuanceStopped) {
              await tx.pointProcessingEvent.update({
                where: { id: processing.id },
                data: {
                  status: 'COMPLETED',
                  failureCode: 'POINT_ISSUANCE_STOPPED',
                  processedAt: new Date(),
                },
              });
              return 'NO_ACTIVE_RULE';
            }
          }
          const dayKey = pointDayKey(input.occurredAt, input.timezone);
          const weekKey = pointWeekKey(input.occurredAt, input.timezone);
          const servicePeriod = groupId ? `:group:${groupId}` : '';
          const ruleRequests =
            input.eventType === 'MISSION_VIEWED'
              ? [
                  {
                    key: 'MISSION_VIEWED_DAILY',
                    period: `day:${dayKey}${servicePeriod}`,
                    legacyPeriod: `day:${dayKey}`,
                    eligible: true,
                  },
                ]
              : [
                  {
                    key: 'POSTED_DAILY',
                    period: `day:${dayKey}${servicePeriod}`,
                    legacyPeriod: `day:${dayKey}`,
                    eligible: true,
                  },
                  {
                    key: 'POSTED_WEEKLY_3',
                    period: `week:${weekKey}${servicePeriod}`,
                    legacyPeriod: `week:${weekKey}`,
                    eligible: await this.hasThreePostsInWeek(
                      tx,
                      input.workspaceId,
                      groupId,
                      input.actorUserId,
                      weekKey,
                      input.timezone,
                      input.occurredAt,
                    ),
                  },
                ];
          let granted = false;
          let activeRuleFound = false;
          const account = await tx.pointAccount.upsert({
            where: {
              workspaceId_userId: {
                workspaceId: input.workspaceId,
                userId: input.actorUserId,
              },
            },
            create: { workspaceId: input.workspaceId, userId: input.actorUserId },
            update: {},
          });
          for (const request of ruleRequests) {
            if (!request.eligible) continue;
            const rules = await tx.pointRuleVersion.findMany({
              where: {
                ruleKey: request.key,
                status: { in: ['ACTIVE', 'SUSPENDED'] },
                OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
                AND: [
                  { OR: [{ groupId: null }, { groupId }] },
                  { OR: [{ campaignId: null }, { campaignId }] },
                  { OR: [{ startsAt: null }, { startsAt: { lte: input.occurredAt } }] },
                  { OR: [{ endsAt: null }, { endsAt: { gt: input.occurredAt } }] },
                ],
              },
              orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
            });
            const rule = rules.sort(
              (left, right) =>
                Number(Boolean(right.campaignId)) - Number(Boolean(left.campaignId)) ||
                Number(Boolean(right.groupId)) - Number(Boolean(left.groupId)) ||
                Number(Boolean(right.workspaceId)) - Number(Boolean(left.workspaceId)),
            )[0];
            if (!rule) continue;
            if (rule.status === 'SUSPENDED') continue;
            activeRuleFound = true;
            const idempotencyKey = `rule:${rule.id}:${request.period}`;
            const legacyIdempotencyKey = `rule:${rule.id}:${request.legacyPeriod}`;
            const existing = await tx.pointTransaction.findFirst({
              where: {
                accountId: account.id,
                OR: [
                  { idempotencyKey },
                  ...(groupId && legacyIdempotencyKey !== idempotencyKey
                    ? [{ idempotencyKey: legacyIdempotencyKey, groupId }]
                    : []),
                ],
              },
              select: { id: true },
            });
            if (existing) continue;
            const budget = await tx.pointRuleBudget.findUnique({
              where: { ruleVersionId: rule.id },
            });
            if (budget) {
              const reserved = await tx.pointRuleBudget.updateMany({
                where: {
                  id: budget.id,
                  grantedPoints: budget.grantedPoints,
                  maximumPoints: { gte: budget.grantedPoints + rule.grantAmount },
                },
                data: { grantedPoints: { increment: rule.grantAmount } },
              });
              if (reserved.count !== 1) continue;
            }
            const transaction = await tx.pointTransaction.create({
              data: {
                accountId: account.id,
                workspaceId: input.workspaceId,
                userId: input.actorUserId,
                groupId,
                campaignId,
                ruleVersionId: rule.id,
                type: 'GRANT',
                amount: rule.grantAmount,
                idempotencyKey,
                sourceType: input.eventType,
                sourceId: input.sourceEventId,
                expiresAt: pointExpiry(input.occurredAt),
              },
            });
            await applyPointCreditToAccount(tx, {
              accountId: account.id,
              transactionId: transaction.id,
              amount: rule.grantAmount,
            });
            granted = true;
          }
          await tx.pointProcessingEvent.update({
            where: { id: processing.id },
            data: { status: 'COMPLETED', processedAt: new Date(), failureCode: null },
          });
          if (granted) return 'GRANTED';
          return activeRuleFound ? 'NOT_ELIGIBLE' : 'NO_ACTIVE_RULE';
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return 'ALREADY_PROCESSED';
      await this.client.pointProcessingEvent.upsert({
        where: {
          workspaceId_eventType_sourceEventId: {
            workspaceId: input.workspaceId,
            eventType: input.eventType,
            sourceEventId: input.sourceEventId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          eventType: input.eventType,
          sourceEventId: input.sourceEventId,
          status: 'FAILED',
          failureCode: 'PROCESSOR_ERROR',
        },
        update: { status: 'FAILED', failureCode: 'PROCESSOR_ERROR' },
      });
      throw error;
    }
  }

  private async hasThreePostsInWeek(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    groupId: string | null,
    userId: string,
    weekKey: string,
    timezone: string,
    occurredAt: Date,
  ) {
    const posts = await tx.postRecord.findMany({
      where: {
        workspaceId,
        actorUserId: userId,
        ...(groupId ? { bunshin: { groupId } } : {}),
        postedAt: {
          gte: new Date(occurredAt.getTime() - 7 * 24 * 60 * 60 * 1000),
          lte: new Date(occurredAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      select: { postedAt: true },
    });
    return posts.filter((post) => pointWeekKey(post.postedAt, timezone) === weekKey).length >= 3;
  }
}
