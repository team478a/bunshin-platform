import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  calculateAdminRetention,
  calculateFirstWeekThreePostKpi,
  normalizePersonalityVersionContent,
  GENERATION_CONTEXT_SNAPSHOT_SCHEMA_VERSION,
  LINE_ADMIN_RETRYABLE_FAILURES,
  VIDEO_AI_SCENE_ADMIN_RETRYABLE_FAILURES,
  VIDEO_RENDER_ADMIN_RETRYABLE_FAILURES,
  selectExternalTrackingLink,
  isLineNotificationSuppressed,
} from '@bunshin/application';
import type {
  AccountTransaction,
  AccountUnitOfWork,
  BunshinRepository,
  CreateBunshinInput,
  CreateUserInput,
  PlatformAdminRepository,
  ScopedBunshinReference,
  UpdateBunshinInput,
  WorkspaceAccessRepository,
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
  LegalDocumentRepository,
  LegalDocument,
  LegalDocumentType,
  LegalConsentRepository,
  RequiredLegalConsentDocument,
  AccountDeletionRequestRepository,
  AccountDeletionRequest,
  AccountDeletionExecutionRepository,
  AccountDeletionPurgeRepository,
  AccountDeletionOrchestrationRepository,
  AccountDeletionAdminOperationsRepository,
  AccountDeletionBlockedReason,
  LineConfigurationRepository,
  LineChannelConfiguration,
  LineConfigurationEnvironment,
  GroupLineChannelConfiguration,
  GroupLineConfigurationRepository,
  GroupLineConnectionRepository,
  LineRichMenu,
  LineRichMenuRepository,
  AiProviderConfiguration,
  AiProviderConfigurationRepository,
  AdminEmailConfiguration,
  AdminEmailConfigurationRepository,
  LineNotificationPreference,
  LineNotificationPreferenceRepository,
  JobRepository,
  EnqueueJobInput,
  Job,
  MissionAutomationScopeRepository,
  MissionAutomationCandidateRepository,
  TrendResearchAutomationCandidateRepository,
  PersonalityLearningCandidateRepository,
  TrendResearchExpiryRepository,
  TrendResearchGenerationContextRepository,
  LineMessageDelivery,
  LineMessageDeliveryRepository,
  LineDeliveryPreferencePort,
  LineReturnReminderRepository,
  LineMissionNotificationSummaryRepository,
  LineAdminMetricsRepository,
  LineDeliveryRetryRepository,
  LineAdminFunnelRepository,
  LineOperationalSnapshotRepository,
  MissionDeepLinkState,
  MissionDeepLinkStateRepository,
  LineConnection,
  LineConnectionRepository,
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
  GenerationContextSnapshot,
  GenerationContextSnapshotPayload,
  GenerationContextSnapshotRepository,
  BunshinPersonalityVersion,
  PersonalityVersionContent,
  PersonalityVersionRepository,
  PersonalityVersionScope,
  PersonalityLearningProposal,
  PersonalityLearningProposalRepository,
  GroupParticipationRepository,
  ProductPackRepository,
  GroupKnowledgeRepository,
  GroupKnowledgeScope,
  GroupKnowledgeSourceRecord,
  GroupKnowledgeChunkRecord,
  AdvertisingSafetyRepository,
  CampaignRepository,
  CampaignPlanningContext,
  CampaignSafetyRepository,
  ExternalTrackingLinkRepository,
  ExternalLinkPlacementRepository,
  GroupFeatureEntitlementRepository,
  GroupFeaturePolicyRecord,
  GroupMemberFeatureAssignmentRecord,
  EffectiveGroupFeatureAccess,
  ActivityContinuityRule,
  ActivityContinuityRuleRepository,
  ActivityBadgeRule,
  VideoProjectRecord,
  VideoProjectRepository,
  VideoSceneRecord,
  VideoAiProcessingType,
  VideoSceneGenerationRecord,
  VideoSceneGenerationExecutionContext,
  VideoSceneGenerationRepository,
  VideoAiProviderCostPolicyRepository,
  VideoPlatform,
  VideoPlanningContextRepository,
  VideoRenderRecord,
  VideoRenderRepository,
  VideoDeliveryRecord,
  VideoDeliveryRepository,
  VideoRenderOperationsRepository,
  VideoRenderCompletionRepository,
  VideoAssetRecord,
  VideoAssetRepository,
  VideoDisclosurePolicy,
  VideoDisclosurePolicyRepository,
  SocialImageGenerationRequestRecord,
  SocialImageGenerationRequestRepository,
  SocialImageGenerationAuthorizationPort,
  SocialImageGenerationExecutionContext,
  SocialImageGenerationExecutionRepository,
  SocialImagePilotEvidenceRecord,
  SocialImagePilotEvidenceRepository,
  ServiceFoundationRecord,
  ServiceFoundationRepository,
  ServiceStaffRoleRepository,
  ServiceParticipationRepository,
  ServiceReferralRewardRepository,
  ServiceReferralRewardGrant,
  ServiceReferralRewardRuleRepository,
  ServiceReferralRewardRuleRecord,
  ServiceCreditConsumptionRepository,
  ServiceCreditConsumptionResult,
  ServiceCreditExpirationRepository,
  ServiceCreditAdjustmentRepository,
  ProgramCoreRepository,
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
import type { CurrentUser, CurrentUserAccountRepository, VerifiedSessionUser } from '@bunshin/auth';
import {
  parsePreferredFormats,
  type ContentPillar,
  type ContentPillarRepository,
  type WeeklyPlan,
  type WeeklyPlanRepository,
  type DailyMission,
  type DailyMissionRepository,
  type DailyMissionStatus,
  type MissionTrendContext,
  type MissionDecision,
  type MissionActivity,
  type MissionEngagementRepository,
  type AchievementBadge,
  type AchievementBadgeRepository,
  type PostRecord,
  type MissionFeedback,
  type MissionOutcomeRepository,
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
  PlatformAdmin,
  User,
  Workspace,
  WorkspaceMembership,
  OwnerKnowledge,
  BunshinKnowledgeGrant,
  BunshinMemory,
  Group,
  GroupInvitation,
  GroupMembership,
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
import { runtimeDatabaseUrl } from './runtime-database-url';

const globalPrisma = globalThis as unknown as { bunshinPrisma?: PrismaClient };
const databaseUrl = runtimeDatabaseUrl(process.env['DATABASE_URL']);
export const prisma =
  globalPrisma.bunshinPrisma ??
  new PrismaClient({
    log: ['warn', 'error'],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });
if (process.env['NODE_ENV'] !== 'production') globalPrisma.bunshinPrisma = prisma;

function lineConfiguration(
  row: Prisma.LineChannelConfigurationGetPayload<object>,
  exposeMask = true,
): LineChannelConfiguration {
  return {
    id: row.id,
    environment: row.environment,
    version: row.version,
    status: row.status,
    loginChannelId: row.loginChannelId,
    loginSecretMask: exposeMask ? row.loginSecretMask : '登録済み',
    messagingChannelId: row.messagingChannelId,
    messagingSecretMask: exposeMask ? row.messagingSecretMask : '登録済み',
    accessTokenMask: exposeMask ? row.accessTokenMask : '登録済み',
    liffId: row.liffId,
    defaultNotificationTime: row.defaultNotificationTime,
    defaultTimezone: row.defaultTimezone,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    globallyPaused: row.globallyPaused,
    quotaWarningPercent: row.quotaWarningPercent,
    quotaLowPriorityStop: row.quotaLowPriorityStop,
    keyVersion: row.keyVersion,
    lastVerifiedAt: row.lastVerifiedAt,
    lastErrorCategory: row.lastErrorCategory,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type LineRichMenuRow = Prisma.LineRichMenuGetPayload<{ include: { areas: true } }>;
function lineRichMenu(row: LineRichMenuRow): LineRichMenu {
  return {
    id: row.id,
    environment: row.environment,
    version: row.version,
    name: row.name,
    description: row.description,
    status: row.status,
    imageObjectKey: row.imageObjectKey,
    imageSha256: row.imageSha256,
    imageContentType: row.imageContentType,
    imageWidth: row.imageWidth,
    imageHeight: row.imageHeight,
    lineRichMenuId: row.lineRichMenuId,
    lastSyncedAt: row.lastSyncedAt,
    lastErrorCategory: row.lastErrorCategory,
    areas: row.areas
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(({ action, x, y, width, height, sortOrder }) => ({
        action,
        x,
        y,
        width,
        height,
        sortOrder,
      })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function aiProviderConfiguration(
  row: Prisma.AiProviderConfigurationGetPayload<object>,
  exposeMask = true,
): AiProviderConfiguration {
  return {
    id: row.id,
    environment: row.environment,
    provider: row.provider,
    version: row.version,
    status: row.status,
    apiKeyConfigured: row.encryptedApiKey !== null,
    apiKeyMask: exposeMask ? row.apiKeyMask : row.encryptedApiKey === null ? null : '登録済み',
    model: row.model,
    dailyBudgetUsdMicros: row.dailyBudgetUsdMicros,
    monthlyBudgetUsdMicros: row.monthlyBudgetUsdMicros,
    requestCostUsdMicros: row.requestCostUsdMicros,
    globallyPaused: row.globallyPaused,
    keyVersion: row.keyVersion,
    lastVerifiedAt: row.lastVerifiedAt,
    lastErrorCategory: row.lastErrorCategory,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function adminEmailConfiguration(
  row: Prisma.AdminEmailConfigurationGetPayload<object>,
): AdminEmailConfiguration {
  return {
    ...row,
    recipientEmails: Array.isArray(row.recipientEmails)
      ? row.recipientEmails.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

function lineNotificationPreference(
  row: Prisma.LineNotificationPreferenceGetPayload<object>,
): LineNotificationPreference {
  return row;
}

function lineConnection(row: Prisma.LineConnectionGetPayload<object>): LineConnection {
  return {
    id: row.id,
    environment: row.environment,
    workspaceId: row.workspaceId,
    userId: row.userId,
    status: row.status,
    friendshipStatus: row.friendshipStatus,
    notificationConsentAt: row.notificationConsentAt,
    followedAt: row.followedAt,
    unfollowedAt: row.unfollowedAt,
    lastWebhookAt: row.lastWebhookAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function platformJob(row: Prisma.JobGetPayload<object>): Job {
  return {
    ...row,
    capabilityType: row.capabilityType,
    environment: row.environment,
    status: row.status,
  };
}

export class PrismaJobRepository implements JobRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async enqueue(input: EnqueueJobInput): Promise<Job> {
    const scope = await this.client.workspace.findFirst({
      where: {
        id: input.workspaceId,
        status: 'ACTIVE',
        memberships: { some: { userId: input.requestedBy, status: 'ACTIVE' } },
        ...(input.bunshinId
          ? { bunshins: { some: { id: input.bunshinId, status: { not: 'ARCHIVED' } } } }
          : {}),
      },
      select: { id: true },
    });
    if (!scope) throw new ApplicationError('NOT_FOUND', 'job scope not found');
    const row = await this.client.job.upsert({
      where: {
        environment_idempotencyKey: {
          environment: input.environment,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        environment: input.environment,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId ?? null,
        capabilityType: input.capabilityType ?? null,
        jobType: input.jobType,
        payloadReference: input.payloadReference,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        requestedBy: input.requestedBy,
        priority: input.priority ?? 100,
        maxAttempts: input.maxAttempts ?? 5,
        scheduledAt: input.scheduledAt ?? new Date(),
      },
      update: {},
    });
    if (
      row.workspaceId !== input.workspaceId ||
      row.bunshinId !== (input.bunshinId ?? null) ||
      row.jobType !== input.jobType ||
      row.payloadReference !== input.payloadReference
    )
      throw new ApplicationError('CONFLICT', 'idempotency key belongs to another job');
    return platformJob(row);
  }

  async claim(input: Parameters<JobRepository['claim']>[0]): Promise<Job | null> {
    const rows = await this.client.$queryRaw<Array<{ id: string }>>`
      WITH candidate AS (
        SELECT "id"
        FROM "jobs"
        WHERE "environment" = ${input.environment}::"LineConfigurationEnvironment"
          AND (
            ("status" = 'PENDING' AND "scheduled_at" <= ${input.now})
            OR ("status" = 'RETRY_SCHEDULED' AND "next_retry_at" <= ${input.now})
            OR ("status" = 'LEASED' AND "lease_expires_at" <= ${input.now})
          )
        ORDER BY "priority" ASC, COALESCE("next_retry_at", "scheduled_at") ASC, "created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "jobs" AS job
      SET "status" = 'LEASED',
          "lease_owner" = ${input.workerId},
          "lease_expires_at" = ${input.leaseExpiresAt},
          "attempt_count" = "attempt_count" + 1,
          "next_retry_at" = NULL,
          "updated_at" = ${input.now}
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job."id"
    `;
    const claimed = rows[0];
    if (!claimed) return null;
    return platformJob(await this.client.job.findUniqueOrThrow({ where: { id: claimed.id } }));
  }

  async complete(input: Parameters<JobRepository['complete']>[0]): Promise<Job | null> {
    const result = await this.client.job.updateMany({
      where: {
        id: input.jobId,
        status: 'LEASED',
        leaseOwner: input.workerId,
        leaseExpiresAt: { gt: input.now },
      },
      data: {
        status: 'SUCCEEDED',
        completedAt: input.now,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (result.count === 0) return null;
    return platformJob(await this.client.job.findUniqueOrThrow({ where: { id: input.jobId } }));
  }

  async fail(input: Parameters<JobRepository['fail']>[0]): Promise<Job | null> {
    const result = await this.client.job.updateMany({
      where: {
        id: input.jobId,
        status: 'LEASED',
        leaseOwner: input.workerId,
        leaseExpiresAt: { gt: input.now },
      },
      data: {
        status: input.nextRetryAt ? 'RETRY_SCHEDULED' : 'DEAD',
        nextRetryAt: input.nextRetryAt,
        lastErrorCategory: input.failure.errorCategory,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (result.count === 0) return null;
    return platformJob(await this.client.job.findUniqueOrThrow({ where: { id: input.jobId } }));
  }

  async cancel(input: Parameters<JobRepository['cancel']>[0]): Promise<Job | null> {
    const result = await this.client.job.updateMany({
      where: {
        id: input.jobId,
        environment: input.environment,
        status: { in: ['PENDING', 'RETRY_SCHEDULED'] },
      },
      data: { status: 'CANCELLED', cancelledAt: input.now },
    });
    if (result.count === 0) return null;
    return platformJob(await this.client.job.findUniqueOrThrow({ where: { id: input.jobId } }));
  }
}

export class PrismaMissionAutomationScopeRepository implements MissionAutomationScopeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async base(input: { workspaceId: string; bunshinId: string; actorUserId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
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
        capabilityAssignments: { some: { capabilityType: 'SOCIAL', status: 'ACTIVE' } },
        socialAccountStrategies: { some: { status: 'APPROVED' } },
        socialProfiles: { some: { status: 'ACTIVE' } },
      },
      select: { id: true },
    });
  }

  async validateWeekly(input: Parameters<MissionAutomationScopeRepository['validateWeekly']>[0]) {
    if (!(await this.base(input))) return false;
    return (
      (await this.client.contentPillar.count({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          active: true,
          deletedAt: null,
        },
      })) > 0
    );
  }

  async validateDaily(input: Parameters<MissionAutomationScopeRepository['validateDaily']>[0]) {
    if (!(await this.base(input))) return false;
    const missionDate = new Date(`${input.missionDate}T00:00:00.000Z`);
    return (
      (await this.client.weeklyPlan.count({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'CONFIRMED',
          weekStartDate: {
            lte: missionDate,
            gte: new Date(missionDate.getTime() - 6 * 86_400_000),
          },
          items: { some: { scheduledDate: missionDate } },
        },
      })) > 0
    );
  }

  async validateTrend(input: Parameters<MissionAutomationScopeRepository['validateTrend']>[0]) {
    if (!(await this.base(input))) return false;
    return (
      (await this.client.socialProfile.count({
        where: {
          id: input.socialProfileId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'ACTIVE',
          accountStrategies: { some: { status: 'APPROVED' } },
          bunshin: {
            OR: [
              { groupId: null },
              { group: { serviceConfiguration: { trendResearchEnabled: true } } },
            ],
          },
        },
      })) > 0
    );
  }
}

export class PrismaMissionAutomationCandidateRepository implements MissionAutomationCandidateRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listEnabled(limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid scheduler candidate limit');
    const rows = await this.client.lineNotificationPreference.findMany({
      where: {
        enabled: true,
        notificationConsentAt: { not: null },
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE', memberships: { some: { status: 'ACTIVE' } } },
        bunshin: { status: { not: 'ARCHIVED' } },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return {
      candidates: rows.slice(0, limit).map(lineNotificationPreference),
      truncated: rows.length > limit,
    };
  }
}

export class PrismaTrendResearchAutomationCandidateRepository implements TrendResearchAutomationCandidateRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listEligible(limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid trend scheduler candidate limit');
    const rows = await this.client.socialProfile.findMany({
      where: {
        status: 'ACTIVE',
        accountStrategies: { some: { status: 'APPROVED' } },
        bunshin: {
          status: { not: 'ARCHIVED' },
          ownerUser: { status: 'ACTIVE' },
          workspace: { status: 'ACTIVE', memberships: { some: { status: 'ACTIVE' } } },
          capabilityAssignments: { some: { capabilityType: 'SOCIAL', status: 'ACTIVE' } },
          OR: [
            { groupId: null },
            { group: { serviceConfiguration: { trendResearchEnabled: true } } },
          ],
        },
      },
      select: {
        id: true,
        workspaceId: true,
        bunshinId: true,
        bunshin: { select: { ownerUserId: true } },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return {
      candidates: rows.slice(0, limit).map((row) => ({
        workspaceId: row.workspaceId,
        bunshinId: row.bunshinId,
        actorUserId: row.bunshin.ownerUserId,
        socialProfileId: row.id,
      })),
      truncated: rows.length > limit,
    };
  }
}

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

function lineMessageDelivery(
  row: Prisma.LineMessageDeliveryGetPayload<object>,
): LineMessageDelivery {
  return row;
}

function missionDeepLinkState(
  row: Prisma.MissionDeepLinkStateGetPayload<object>,
): MissionDeepLinkState {
  return row;
}

function lineMissionScope(input: {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
  dailyMissionId: string;
}): Prisma.BunshinWhereInput {
  return {
    id: input.bunshinId,
    workspaceId: input.workspaceId,
    status: { not: 'ARCHIVED' },
    ownerUser: { status: 'ACTIVE' },
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
    dailyMissions: { some: { id: input.dailyMissionId } },
  };
}

export class PrismaLineConnectionRepository implements LineConnectionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async connect(input: Parameters<LineConnectionRepository['connect']>[0]) {
    const identity = await this.client.authIdentity.findFirst({
      where: {
        provider: 'LINE',
        providerUserId: input.providerUserId,
        userId: input.actorUserId,
        user: {
          status: 'ACTIVE',
          memberships: {
            some: { workspaceId: input.workspaceId, status: 'ACTIVE' },
          },
        },
      },
      select: { id: true },
    });
    if (!identity) return null;
    const row = await this.client.lineConnection.upsert({
      where: {
        environment_workspaceId_userId: {
          environment: input.environment,
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
        },
      },
      create: {
        environment: input.environment,
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        providerUserId: input.providerUserId,
        notificationConsentAt: input.consentGranted ? new Date() : null,
      },
      update: {
        providerUserId: input.providerUserId,
        status: 'ACTIVE',
        notificationConsentAt: input.consentGranted ? new Date() : null,
      },
    });
    return lineConnection(row);
  }

  async disconnect(input: Parameters<LineConnectionRepository['disconnect']>[0]) {
    return this.client.$transaction(async (tx) => {
      const connection = await tx.lineConnection.updateMany({
        where: {
          environment: input.environment,
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          user: {
            status: 'ACTIVE',
            memberships: {
              some: { workspaceId: input.workspaceId, status: 'ACTIVE' },
            },
          },
        },
        data: {
          status: 'DISCONNECTED',
          notificationConsentAt: null,
        },
      });
      if (connection.count !== 1) return false;
      await tx.lineMessageDelivery.updateMany({
        where: {
          environment: input.environment,
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
          sentAt: null,
          cancelledAt: null,
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          lastErrorCategory: 'RECIPIENT_UNAVAILABLE',
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      return true;
    });
  }

  async applyWebhook(input: Parameters<LineConnectionRepository['applyWebhook']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const duplicate = await tx.lineWebhookEvent.findUnique({
          where: {
            environment_providerEventId: {
              environment: input.environment,
              providerEventId: input.providerEventId,
            },
          },
          select: { id: true },
        });
        if (duplicate) return 'DUPLICATE' as const;

        let outcome: 'APPLIED' | 'IDENTITY_NOT_FOUND' | 'CONNECTION_NOT_FOUND' | 'IGNORED';
        let workspaceId: string | null = null;
        if (input.type === 'OTHER' || input.providerUserId === null) {
          outcome = 'IGNORED';
        } else {
          const identity = await tx.authIdentity.findUnique({
            where: {
              provider_providerUserId: {
                provider: 'LINE',
                providerUserId: input.providerUserId,
              },
            },
            include: { user: { select: { status: true } } },
          });
          if (!identity || identity.user.status !== 'ACTIVE') {
            outcome = 'IDENTITY_NOT_FOUND';
          } else {
            const connections = await tx.lineConnection.findMany({
              where: {
                environment: input.environment,
                providerUserId: input.providerUserId,
                userId: identity.userId,
                status: 'ACTIVE',
              },
              select: { workspaceId: true },
            });
            if (connections.length === 0) {
              outcome = 'CONNECTION_NOT_FOUND';
            } else {
              const following = input.type === 'FOLLOW';
              await tx.lineConnection.updateMany({
                where: {
                  environment: input.environment,
                  providerUserId: input.providerUserId,
                  userId: identity.userId,
                  status: 'ACTIVE',
                },
                data: {
                  friendshipStatus: following ? 'FOLLOWING' : 'UNFOLLOWED',
                  ...(following
                    ? { followedAt: input.occurredAt }
                    : { unfollowedAt: input.occurredAt }),
                  lastWebhookAt: input.occurredAt,
                },
              });
              if (!following) {
                await tx.lineMessageDelivery.updateMany({
                  where: {
                    environment: input.environment,
                    userId: identity.userId,
                    workspaceId: { in: connections.map((connection) => connection.workspaceId) },
                    status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
                    sentAt: null,
                    cancelledAt: null,
                  },
                  data: {
                    status: 'CANCELLED',
                    cancelledAt: input.processedAt,
                    lastErrorCategory: 'RECIPIENT_UNAVAILABLE',
                    leaseOwner: null,
                    leaseExpiresAt: null,
                  },
                });
              }
              outcome = 'APPLIED';
              workspaceId = connections.length === 1 ? connections[0]!.workspaceId : null;
            }
          }
        }
        await tx.lineWebhookEvent.create({
          data: {
            environment: input.environment,
            providerEventId: input.providerEventId,
            type: input.type,
            outcome,
            occurredAt: input.occurredAt,
            processedAt: input.processedAt,
            workspaceId,
          },
        });
        return outcome;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return 'DUPLICATE';
      throw error;
    }
  }

  async resolve(input: Parameters<LineConnectionRepository['resolve']>[0]) {
    if (input.groupId) {
      const row = await this.client.groupLineConnection.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.userId,
          status: 'ACTIVE',
          friendshipStatus: 'FOLLOWING',
          notificationConsentAt: { not: null },
          configuration: {
            environment: input.environment,
            status: 'ACTIVE',
            globallyPaused: false,
            lastVerifiedAt: { not: null },
            lastErrorCategory: null,
          },
          group: {
            status: 'ACTIVE',
            lineRoutingPolicies: {
              some: {
                environment: input.environment,
                mode: 'DEDICATED',
                pilotEnabled: true,
              },
            },
          },
          groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
          user: { status: 'ACTIVE' },
          workspace: {
            status: 'ACTIVE',
            ...(input.bunshinId
              ? {
                  bunshins: {
                    some: {
                      id: input.bunshinId,
                      status: { not: 'ARCHIVED' as const },
                      lineNotificationPreferences: {
                        some: {
                          userId: input.userId,
                          enabled: true,
                          notificationConsentAt: { not: null },
                        },
                      },
                    },
                  },
                }
              : {}),
          },
        },
        select: { providerUserId: true },
      });
      return row?.providerUserId ?? null;
    }
    if (!input.bunshinId) {
      const row = await this.client.lineConnection.findFirst({
        where: {
          environment: input.environment,
          workspaceId: input.workspaceId,
          userId: input.userId,
          status: 'ACTIVE',
          friendshipStatus: 'FOLLOWING',
          notificationConsentAt: { not: null },
          user: {
            status: 'ACTIVE',
            memberships: { some: { workspaceId: input.workspaceId, status: 'ACTIVE' } },
          },
          workspace: { status: 'ACTIVE' },
        },
        select: { providerUserId: true },
      });
      return row?.providerUserId ?? null;
    }
    const row = await this.client.lineConnection.findFirst({
      where: {
        environment: input.environment,
        workspaceId: input.workspaceId,
        userId: input.userId,
        status: 'ACTIVE',
        friendshipStatus: 'FOLLOWING',
        notificationConsentAt: { not: null },
        user: {
          status: 'ACTIVE',
          memberships: {
            some: { workspaceId: input.workspaceId, status: 'ACTIVE' },
          },
        },
        workspace: { status: 'ACTIVE' },
      },
      select: {
        providerUserId: true,
        workspace: {
          select: {
            bunshins: {
              where: {
                id: input.bunshinId,
                status: { not: 'ARCHIVED' },
                lineNotificationPreferences: {
                  some: {
                    userId: input.userId,
                    enabled: true,
                    notificationConsentAt: { not: null },
                  },
                },
              },
              select: { id: true },
            },
          },
        },
      },
    });
    return row && (!input.bunshinId || row.workspace.bunshins.length === 1)
      ? row.providerUserId
      : null;
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

export class PrismaLineAdminMetricsRepository implements LineAdminMetricsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async get(actorUserId: string, environment: LineConfigurationEnvironment) {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
      select: { id: true, role: true },
    });
    if (!admin) return null;
    const [
      [active, following, notificationReady],
      deliveryCounts,
      jobCounts,
      failureRows,
      retryableFailures,
      retryableBadgeFailures,
      configuration,
    ] = await Promise.all([
      Promise.all([
        this.client.lineConnection.count({ where: { environment, status: 'ACTIVE' } }),
        this.client.lineConnection.count({ where: { environment, friendshipStatus: 'FOLLOWING' } }),
        this.client.lineConnection.count({
          where: {
            environment,
            status: 'ACTIVE',
            friendshipStatus: 'FOLLOWING',
            notificationConsentAt: { not: null },
          },
        }),
      ]),
      Promise.all(
        (['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'] as const).map((status) =>
          this.client.lineMessageDelivery.count({ where: { environment, status } }),
        ),
      ),
      Promise.all(
        (['RETRY_SCHEDULED', 'DEAD'] as const).map((status) =>
          this.client.job.count({
            where: {
              environment,
              jobType: { in: ['LINE_MISSION_DELIVER', 'BADGE_LINE_DELIVER'] },
              status,
            },
          }),
        ),
      ),
      this.client.lineMessageDeliveryAttempt.findMany({
        where: { delivery: { environment }, status: 'FAILED', errorCategory: { not: null } },
        select: { errorCategory: true },
        orderBy: { attemptedAt: 'desc' },
        take: 500,
      }),
      ['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)
        ? this.client.lineMessageDelivery.findMany({
            where: {
              environment,
              status: 'FAILED',
              sentAt: null,
              cancelledAt: null,
              lastErrorCategory: { in: [...LINE_ADMIN_RETRYABLE_FAILURES] },
            },
            select: {
              id: true,
              lastErrorCategory: true,
              attemptCount: true,
              updatedAt: true,
              retryRequests: { select: { deliveryAttemptCount: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 100,
          })
        : Promise.resolve([]),
      ['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)
        ? this.client.badgeLineNotificationDelivery.findMany({
            where: {
              environment,
              status: 'DEAD',
              sentAt: null,
              cancelledAt: null,
              lastErrorCategory: { in: [...LINE_ADMIN_RETRYABLE_FAILURES] },
            },
            select: {
              id: true,
              lastErrorCategory: true,
              attemptCount: true,
              updatedAt: true,
              retryRequests: { select: { deliveryAttemptCount: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 100,
          })
        : Promise.resolve([]),
      this.client.lineChannelConfiguration.findFirst({ where: { environment, status: 'ACTIVE' } }),
    ]);
    const [pending = 0, processing = 0, sent = 0, failed = 0, cancelled = 0] = deliveryCounts;
    const [retryScheduled = 0, dead = 0] = jobCounts;
    const failureCounts = new Map<string, number>();
    for (const row of failureRows) {
      if (row.errorCategory)
        failureCounts.set(row.errorCategory, (failureCounts.get(row.errorCategory) ?? 0) + 1);
    }
    return {
      environment,
      connections: {
        active,
        following,
        notificationReady,
      },
      deliveries: { pending, processing, sent, failed, cancelled },
      jobs: { retryScheduled, dead },
      failures: [...failureCounts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 8),
      retryableFailures: retryableFailures
        .flatMap((row) =>
          row.lastErrorCategory &&
          !row.retryRequests.some((request) => request.deliveryAttemptCount === row.attemptCount)
            ? [
                {
                  deliveryId: row.id,
                  category: row.lastErrorCategory,
                  attemptCount: row.attemptCount,
                  failedAt: row.updatedAt,
                },
              ]
            : [],
        )
        .slice(0, 20),
      retryableBadgeFailures: retryableBadgeFailures
        .flatMap((row) =>
          row.lastErrorCategory &&
          !row.retryRequests.some((request) => request.deliveryAttemptCount === row.attemptCount)
            ? [
                {
                  deliveryId: row.id,
                  category: row.lastErrorCategory,
                  attemptCount: row.attemptCount,
                  failedAt: row.updatedAt,
                },
              ]
            : [],
        )
        .slice(0, 20),
      configuration: {
        active: configuration !== null,
        verified:
          configuration?.lastVerifiedAt !== null && configuration?.lastErrorCategory === null,
        globallyPaused: configuration?.globallyPaused ?? false,
        quotaWarningPercent: configuration?.quotaWarningPercent ?? null,
        quotaLowPriorityStop: configuration?.quotaLowPriorityStop ?? null,
      },
    };
  }
}

export class PrismaLineOperationalSnapshotRepository implements LineOperationalSnapshotRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async get(environment: LineConfigurationEnvironment) {
    const [failed, retryScheduled, dead, failureRows, configuration] = await Promise.all([
      this.client.lineMessageDelivery.count({ where: { environment, status: 'FAILED' } }),
      this.client.job.count({
        where: {
          environment,
          jobType: { in: ['LINE_MISSION_DELIVER', 'BADGE_LINE_DELIVER'] },
          status: 'RETRY_SCHEDULED',
        },
      }),
      this.client.job.count({
        where: {
          environment,
          jobType: { in: ['LINE_MISSION_DELIVER', 'BADGE_LINE_DELIVER'] },
          status: 'DEAD',
        },
      }),
      this.client.lineMessageDelivery.findMany({
        where: { environment, status: 'FAILED', lastErrorCategory: { not: null } },
        select: { lastErrorCategory: true },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      }),
      this.client.lineChannelConfiguration.findFirst({
        where: { environment, status: 'ACTIVE' },
      }),
    ]);
    const failureCounts = new Map<string, number>();
    for (const row of failureRows) {
      if (row.lastErrorCategory)
        failureCounts.set(
          row.lastErrorCategory,
          (failureCounts.get(row.lastErrorCategory) ?? 0) + 1,
        );
    }
    return {
      environment,
      configuration: {
        active: configuration !== null,
        verified:
          configuration?.lastVerifiedAt !== null && configuration?.lastErrorCategory === null,
        globallyPaused: configuration?.globallyPaused ?? false,
      },
      deliveries: { failed },
      jobs: { retryScheduled, dead },
      failures: [...failureCounts.entries()].map(([category, count]) => ({ category, count })),
    };
  }
}

const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? null : numerator / denominator;

export class PrismaLineAdminFunnelRepository implements LineAdminFunnelRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async summarize(input: Parameters<LineAdminFunnelRepository['summarize']>[0]) {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    const sentWhere = {
      environment: input.environment,
      status: 'SENT' as const,
      sentAt: { gte: input.from, lt: input.to },
    };
    const [sentMessages, cohortRows, connections] = await Promise.all([
      this.client.lineMessageDelivery.count({ where: sentWhere }),
      this.client.lineMessageDelivery.findMany({
        where: sentWhere,
        select: {
          userId: true,
          sentAt: true,
          dailyMission: {
            select: {
              decision: { select: { decision: true, decidedAt: true } },
              activities: {
                where: {
                  type: {
                    in: [
                      'COPIED_TEXT',
                      'COPIED_SLIDE',
                      'COPIED_IMAGE_INSTRUCTION',
                      'COPIED_VIDEO_PROMPT',
                      'COPIED_SCRIPT',
                    ],
                  },
                  occurredAt: { lt: input.to },
                },
                select: { occurredAt: true },
              },
              postRecord: { select: { postedAt: true } },
              deepLinkStates: {
                where: {
                  environment: input.environment,
                  consumedAt: { not: null, lt: input.to },
                },
                select: { consumedAt: true },
              },
            },
          },
        },
        orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
        take: input.cohortLimit + 1,
      }),
      this.client.lineConnection.findMany({
        where: {
          environment: input.environment,
          OR: [
            { followedAt: { gte: input.from, lt: input.to } },
            { unfollowedAt: { gte: input.from, lt: input.to } },
          ],
        },
        select: { userId: true, followedAt: true, unfollowedAt: true },
      }),
    ]);
    const truncated = cohortRows.length > input.cohortLimit;
    const cohort = cohortRows.slice(0, input.cohortLimit);
    const sentUsers = new Set<string>();
    const openedUsers = new Set<string>();
    const acceptedUsers = new Set<string>();
    const copiedUsers = new Set<string>();
    const postedUsers = new Set<string>();
    let opened = 0;
    let posted = 0;
    for (const row of cohort) {
      if (!row.sentAt) continue;
      sentUsers.add(row.userId);
      const sentAt = row.sentAt.getTime();
      const openedThroughEnvironment = row.dailyMission.deepLinkStates.some(
        (state) => (state.consumedAt?.getTime() ?? 0) >= sentAt,
      );
      if (openedThroughEnvironment) {
        opened += 1;
        openedUsers.add(row.userId);
      }
      const decision = row.dailyMission.decision;
      if (
        openedThroughEnvironment &&
        decision?.decision === 'ACCEPTED' &&
        (decision.decidedAt?.getTime() ?? 0) >= sentAt &&
        decision.decidedAt!.getTime() < input.to.getTime()
      )
        acceptedUsers.add(row.userId);
      if (
        openedThroughEnvironment &&
        row.dailyMission.activities.some((activity) => activity.occurredAt.getTime() >= sentAt)
      )
        copiedUsers.add(row.userId);
      const postedAt = row.dailyMission.postRecord?.postedAt;
      if (
        openedThroughEnvironment &&
        postedAt &&
        postedAt.getTime() >= sentAt &&
        postedAt < input.to
      ) {
        posted += 1;
        postedUsers.add(row.userId);
      }
    }
    const followedUsers = new Set<string>();
    const unfollowedUsers = new Set<string>();
    const reachedUsers = new Set<string>();
    for (const connection of connections) {
      if (
        connection.followedAt &&
        connection.followedAt >= input.from &&
        connection.followedAt < input.to
      ) {
        followedUsers.add(connection.userId);
        reachedUsers.add(connection.userId);
      }
      if (
        connection.unfollowedAt &&
        connection.unfollowedAt >= input.from &&
        connection.unfollowedAt < input.to
      ) {
        unfollowedUsers.add(connection.userId);
        reachedUsers.add(connection.userId);
      }
    }
    return {
      environment: input.environment,
      period: { from: input.from, to: input.to },
      cohort: { sentMessages, sentUsers: sentUsers.size, truncated },
      stages: {
        followedUsers: followedUsers.size,
        unfollowedUsers: unfollowedUsers.size,
        openedUsers: openedUsers.size,
        acceptedUsers: acceptedUsers.size,
        copiedUsers: copiedUsers.size,
        postedUsers: postedUsers.size,
      },
      messages: { opened, posted },
      rates: {
        openRate: truncated ? null : ratio(opened, cohort.length),
        notificationToPostRate: truncated ? null : ratio(posted, cohort.length),
        unfollowRate: ratio(unfollowedUsers.size, reachedUsers.size),
      },
    };
  }
}

export class PrismaLineDeliveryRetryRepository implements LineDeliveryRetryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async request(input: Parameters<LineDeliveryRetryRepository['request']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const admin = await tx.platformAdmin.findFirst({
          where: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
          },
          select: { id: true },
        });
        const delivery = await tx.lineMessageDelivery.findFirst({
          where: {
            id: input.deliveryId,
            environment: input.environment,
            status: 'FAILED',
            sentAt: null,
            cancelledAt: null,
            attemptCount: { gt: 0 },
            lastErrorCategory: { in: [...LINE_ADMIN_RETRYABLE_FAILURES] },
            workspace: { status: 'ACTIVE' },
            bunshin: { status: { not: 'ARCHIVED' } },
            user: { status: 'ACTIVE' },
          },
        });
        if (!delivery) return null;
        if (input.groupId !== undefined && delivery.groupId !== input.groupId) return null;
        if (!admin) {
          if (delivery.groupId === null) return null;
          const manager = await tx.groupMembership.findFirst({
            where: {
              workspaceId: delivery.workspaceId,
              groupId: delivery.groupId,
              userId: input.actorUserId,
              status: 'ACTIVE',
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
              group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
            },
            select: { id: true },
          });
          if (!manager) return null;
        }
        const job = await tx.job.create({
          data: {
            environment: input.environment,
            workspaceId: delivery.workspaceId,
            bunshinId: delivery.bunshinId,
            capabilityType: 'SOCIAL',
            jobType: 'LINE_MISSION_DELIVER',
            payloadReference: `line-delivery:${delivery.id}`,
            idempotencyKey: `line-admin-retry:${delivery.id}:${delivery.attemptCount}`,
            correlationId: input.requestId,
            requestedBy: delivery.userId,
            priority: 50,
          },
        });
        const retry = await tx.lineDeliveryRetryRequest.create({
          data: {
            id: input.requestId,
            environment: input.environment,
            deliveryId: delivery.id,
            deliveryAttemptCount: delivery.attemptCount,
            actorUserId: input.actorUserId,
            reason: input.reason,
            jobId: job.id,
          },
        });
        return retry;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError(
          'CONFLICT',
          'this delivery failure already has a retry job',
          error,
        );
      throw error;
    }
  }
}

export class PrismaLineMessageDeliveryRepository implements LineMessageDeliveryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async getScoped(input: Parameters<LineMessageDeliveryRepository['getScoped']>[0]) {
    const row = await this.client.lineMessageDelivery.findFirst({
      where: {
        id: input.deliveryId,
        environment: input.environment,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        userId: input.actorUserId,
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
        bunshin: { status: { not: 'ARCHIVED' } },
        user: { status: 'ACTIVE' },
      },
    });
    return row ? lineMessageDelivery(row) : null;
  }

  async prepare(input: Parameters<LineMessageDeliveryRepository['prepare']>[0]) {
    const accessible = await this.client.bunshin.findFirst({
      where: lineMissionScope(input),
      select: { id: true },
    });
    if (!accessible) return null;
    const mission = await this.client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
      select: {
        campaign: { select: { groupId: true } },
        contentLinkUsage: { select: { groupId: true } },
      },
    });
    if (!mission) return null;
    const campaignGroupId = mission.campaign?.groupId ?? null;
    const usageGroupId = mission.contentLinkUsage?.groupId ?? null;
    if (campaignGroupId && usageGroupId && campaignGroupId !== usageGroupId)
      throw new ApplicationError('CONFLICT', 'Mission group context mismatch');
    const groupId = campaignGroupId ?? usageGroupId;
    if (
      groupId &&
      !(await this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      }))
    )
      return null;

    try {
      return lineMessageDelivery(
        await this.client.lineMessageDelivery.create({
          data: {
            environment: input.environment,
            workspaceId: input.workspaceId,
            groupId,
            bunshinId: input.bunshinId,
            userId: input.actorUserId,
            dailyMissionId: input.dailyMissionId,
            kind: input.kind,
            idempotencyKey: input.idempotencyKey,
            scheduledAt: input.scheduledAt,
          },
        }),
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.client.lineMessageDelivery.findUnique({
        where: {
          environment_idempotencyKey: {
            environment: input.environment,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (
        !existing ||
        existing.workspaceId !== input.workspaceId ||
        existing.groupId !== groupId ||
        existing.bunshinId !== input.bunshinId ||
        existing.userId !== input.actorUserId ||
        existing.dailyMissionId !== input.dailyMissionId ||
        existing.kind !== input.kind
      )
        throw new ApplicationError('CONFLICT', 'delivery idempotency key is already in use');
      return lineMessageDelivery(existing);
    }
  }

  async claim(input: Parameters<LineMessageDeliveryRepository['claim']>[0]) {
    return this.client.$transaction(async (tx) => {
      const claimed = await tx.lineMessageDelivery.updateMany({
        where: {
          id: input.deliveryId,
          environment: input.environment,
          userId: input.actorUserId,
          sentAt: null,
          cancelledAt: null,
          scheduledAt: { lte: input.now },
          user: { status: 'ACTIVE' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
          bunshin: {
            status: { not: 'ARCHIVED' },
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
          OR: [
            { status: { in: ['PENDING', 'FAILED'] } },
            { status: 'PROCESSING', leaseExpiresAt: { lte: input.now } },
          ],
        },
        data: {
          status: 'PROCESSING',
          attemptCount: { increment: 1 },
          leaseOwner: input.leaseOwner,
          leaseExpiresAt: input.leaseExpiresAt,
          lastErrorCategory: null,
        },
      });
      if (claimed.count !== 1) return null;
      const row = await tx.lineMessageDelivery.findFirst({
        where: {
          id: input.deliveryId,
          environment: input.environment,
          userId: input.actorUserId,
          status: 'PROCESSING',
          leaseOwner: input.leaseOwner,
          leaseExpiresAt: input.leaseExpiresAt,
        },
      });
      if (!row) throw new ApplicationError('CONFLICT', 'LINE delivery claim lost');
      return { delivery: lineMessageDelivery(row), attemptNumber: row.attemptCount };
    });
  }

  async recordAttempt(input: Parameters<LineMessageDeliveryRepository['recordAttempt']>[0]) {
    if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery attempt number');
    if (!Number.isInteger(input.latencyMs) || input.latencyMs < 0)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery attempt latency');
    if ((input.status === 'SUCCESS') !== (input.errorCategory === null))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery attempt error category');

    await this.client.$transaction(async (tx) => {
      const delivery = await tx.lineMessageDelivery.updateMany({
        where: {
          id: input.deliveryId,
          environment: input.environment,
          status: 'PROCESSING',
          leaseOwner: input.leaseOwner,
          attemptCount: input.attemptNumber,
        },
        data: {
          status: input.status === 'SUCCESS' ? 'SENT' : 'FAILED',
          sentAt: input.status === 'SUCCESS' ? input.attemptedAt : null,
          lastErrorCategory: input.errorCategory,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (delivery.count !== 1)
        throw new ApplicationError('NOT_FOUND', 'LINE delivery not found in environment');
      await tx.lineMessageDeliveryAttempt.create({
        data: {
          deliveryId: input.deliveryId,
          attemptNumber: input.attemptNumber,
          status: input.status,
          errorCategory: input.errorCategory,
          latencyMs: input.latencyMs,
          attemptedAt: input.attemptedAt,
        },
      });
    });
  }

  async releaseClaim(input: Parameters<LineMessageDeliveryRepository['releaseClaim']>[0]) {
    const result = await this.client.lineMessageDelivery.updateMany({
      where: {
        id: input.deliveryId,
        environment: input.environment,
        status: 'PROCESSING',
        leaseOwner: input.leaseOwner,
      },
      data: {
        status: input.status,
        lastErrorCategory: input.errorCategory,
        cancelledAt: input.status === 'CANCELLED' ? input.now : null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }
}

export class PrismaLineDeliveryPreferenceRepository implements LineDeliveryPreferencePort {
  constructor(private readonly client: PrismaClient = prisma) {}
  async isAllowed(input: Parameters<LineDeliveryPreferencePort['isAllowed']>[0]) {
    const preference = await this.client.lineNotificationPreference.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        userId: input.userId,
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.userId, status: 'ACTIVE' } },
        },
        bunshin: { status: { not: 'ARCHIVED' } },
        user: { status: 'ACTIVE' },
      },
    });
    return preference
      ? !isLineNotificationSuppressed(lineNotificationPreference(preference), input.at)
      : false;
  }
}

export class PrismaLineReturnReminderRepository implements LineReturnReminderRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async shouldUse(input: Parameters<LineReturnReminderRepository['shouldUse']>[0]) {
    const localDate = new Date(`${input.localDate}T00:00:00.000Z`);
    if (Number.isNaN(localDate.valueOf())) return false;
    const dormantBefore = new Date(localDate);
    dormantBefore.setUTCDate(dormantBefore.getUTCDate() - input.dormancyDays);
    const cooldownFrom = new Date(localDate);
    cooldownFrom.setUTCDate(cooldownFrom.getUTCDate() - input.cooldownDays);
    const preference = await this.client.lineNotificationPreference.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        userId: input.actorUserId,
        enabled: true,
        reminderEnabled: true,
        notificationConsentAt: { not: null },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
        bunshin: { status: { not: 'ARCHIVED' } },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!preference) return false;
    const [lastActivity, recentReminder] = await Promise.all([
      this.client.missionActivity.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          actorUserId: input.actorUserId,
        },
        select: { dailyMission: { select: { missionDate: true } } },
        orderBy: [{ dailyMission: { missionDate: 'desc' } }, { occurredAt: 'desc' }],
      }),
      this.client.lineMessageDelivery.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          userId: input.actorUserId,
          kind: 'REMINDER',
          createdAt: { gte: cooldownFrom },
          status: { in: ['PENDING', 'PROCESSING', 'SENT'] },
        },
        select: { id: true },
      }),
    ]);
    return Boolean(
      lastActivity && lastActivity.dailyMission.missionDate <= dormantBefore && !recentReminder,
    );
  }
}

export class PrismaMissionDeepLinkStateRepository implements MissionDeepLinkStateRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async create(input: Parameters<MissionDeepLinkStateRepository['create']>[0]) {
    const accessible = await this.client.bunshin.findFirst({
      where: lineMissionScope(input),
      select: { id: true },
    });
    if (!accessible) return null;
    try {
      return missionDeepLinkState(
        await this.client.missionDeepLinkState.create({
          data: {
            id: input.id,
            environment: input.environment,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            userId: input.actorUserId,
            dailyMissionId: input.dailyMissionId,
            keyVersion: input.keyVersion,
            expiresAt: input.expiresAt,
          },
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'Mission deep link state already exists');
      throw error;
    }
  }

  async consume(input: Parameters<MissionDeepLinkStateRepository['consume']>[0]) {
    return this.client.$transaction(async (tx) => {
      const state = await tx.missionDeepLinkState.findFirst({
        where: {
          id: input.id,
          environment: input.environment,
          userId: input.actorUserId,
          keyVersion: input.keyVersion,
          expiresAt: input.expiresAt,
          consumedAt: null,
          AND: { expiresAt: { gt: input.now } },
          user: { status: 'ACTIVE' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
          bunshin: {
            status: { not: 'ARCHIVED' },
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
        },
      });
      if (!state) return null;
      const claimed = await tx.missionDeepLinkState.updateMany({
        where: {
          id: state.id,
          environment: input.environment,
          userId: input.actorUserId,
          keyVersion: input.keyVersion,
          expiresAt: input.expiresAt,
          consumedAt: null,
          AND: { expiresAt: { gt: input.now } },
        },
        data: { consumedAt: input.now },
      });
      if (claimed.count !== 1) return null;
      return missionDeepLinkState({ ...state, consumedAt: input.now });
    });
  }
}

export class PrismaLineNotificationPreferenceRepository implements LineNotificationPreferenceRepository {
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

  async getScoped(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    if (!(await this.accessible(input))) return { accessible: false, preference: null };
    const row = await this.client.lineNotificationPreference.findUnique({
      where: {
        workspaceId_userId_bunshinId: {
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          bunshinId: input.bunshinId,
        },
      },
    });
    return { accessible: true, preference: row ? lineNotificationPreference(row) : null };
  }

  async upsert(input: Parameters<LineNotificationPreferenceRepository['upsert']>[0]) {
    if (!(await this.accessible(input))) return null;
    return this.client.$transaction(async (tx) => {
      const existing = await tx.lineNotificationPreference.findUnique({
        where: {
          workspaceId_userId_bunshinId: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            bunshinId: input.bunshinId,
          },
        },
      });
      const consentAt = input.consentGranted
        ? (existing?.notificationConsentAt ?? new Date())
        : null;
      const data = {
        enabled: input.enabled,
        notificationConsentAt: consentAt,
        localTime: input.localTime,
        timezone: input.timezone,
        frequency: input.frequency,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd,
        pausedUntil: input.pausedUntil,
        reminderEnabled: input.reminderEnabled,
      };
      const row = await tx.lineNotificationPreference.upsert({
        where: {
          workspaceId_userId_bunshinId: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            bunshinId: input.bunshinId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          bunshinId: input.bunshinId,
          ...data,
        },
        update: data,
      });
      return lineNotificationPreference(row);
    });
  }
}

export class PrismaAiProviderConfigurationRepository implements AiProviderConfigurationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private admin(actorUserId: string) {
    return this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
    });
  }

  async listForAdmin(input: Parameters<AiProviderConfigurationRepository['listForAdmin']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null) return null;
    const rows = await this.client.aiProviderConfiguration.findMany({
      where: { environment: input.environment },
      orderBy: [{ provider: 'asc' }, { version: 'desc' }],
    });
    return rows.map((row) =>
      aiProviderConfiguration(row, ['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)),
    );
  }

  async createVersion(input: Parameters<AiProviderConfigurationRepository['createVersion']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const latest = await tx.aiProviderConfiguration.findFirst({
        where: { environment: input.environment, provider: input.provider },
        orderBy: { version: 'desc' },
      });
      const row = await tx.aiProviderConfiguration.create({
        data: {
          environment: input.environment,
          provider: input.provider,
          version: (latest?.version ?? 0) + 1,
          encryptedApiKey: input.apiKey?.encryptedValue ?? null,
          apiKeyMask: input.apiKey?.mask ?? null,
          keyVersion: input.apiKey?.keyVersion ?? 1,
          model: input.model,
          dailyBudgetUsdMicros: input.dailyBudgetUsdMicros,
          monthlyBudgetUsdMicros: input.monthlyBudgetUsdMicros,
          requestCostUsdMicros: input.requestCostUsdMicros ?? 0,
          globallyPaused: true,
        },
      });
      await tx.aiProviderConfigurationAudit.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          provider: input.provider,
          actorUserId: input.actorUserId,
          action: 'CREATE_VERSION',
          reason: input.reason,
          changedFields: [
            ...(input.apiKey === null ? [] : ['credentials']),
            'model',
            'budgetPolicy',
            'globallyPaused',
          ],
        },
      });
      return aiProviderConfiguration(row);
    });
  }

  async getForConnectionTest(
    input: Parameters<AiProviderConfigurationRepository['getForConnectionTest']>[0],
  ) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    const row = await this.client.aiProviderConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    if (row?.encryptedApiKey == null) return null;
    return { configuration: aiProviderConfiguration(row), encryptedApiKey: row.encryptedApiKey };
  }

  async recordConnectionTest(
    input: Parameters<AiProviderConfigurationRepository['recordConnectionTest']>[0],
  ) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role))
      throw new ApplicationError('FORBIDDEN', 'admin required');
    const target = await this.client.aiProviderConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    if (target === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    await this.client.$transaction([
      this.client.aiProviderConfiguration.update({
        where: { id: target.id },
        data: {
          ...(input.success
            ? { lastVerifiedAt: new Date(), status: 'DRAFT' }
            : { status: 'ERROR' }),
          lastErrorCategory: input.errorCategory,
        },
      }),
      this.client.aiProviderConfigurationAudit.create({
        data: {
          configurationId: target.id,
          environment: input.environment,
          provider: target.provider,
          actorUserId: input.actorUserId,
          action: 'CONNECTION_TEST',
          reason: '管理画面から接続テストを実行',
          changedFields: ['lastVerifiedAt', 'lastErrorCategory', 'status'],
        },
      }),
    ]);
  }

  async activate(input: Parameters<AiProviderConfigurationRepository['activate']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const target = await tx.aiProviderConfiguration.findFirst({
        where: { id: input.configurationId, environment: input.environment },
      });
      if (target === null) return null;
      if (
        target.encryptedApiKey === null ||
        target.lastVerifiedAt === null ||
        target.lastErrorCategory
      )
        throw new ApplicationError('CONFLICT', 'successful connection test required');
      await tx.aiProviderConfiguration.updateMany({
        where: { environment: input.environment, provider: target.provider, status: 'ACTIVE' },
        data: { status: 'DISABLED', globallyPaused: true },
      });
      const row = await tx.aiProviderConfiguration.update({
        where: { id: target.id },
        data: { status: 'ACTIVE', globallyPaused: false },
      });
      await tx.aiProviderConfigurationAudit.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          provider: row.provider,
          actorUserId: input.actorUserId,
          action: 'ACTIVATE',
          reason: input.reason,
          changedFields: ['status', 'globallyPaused'],
        },
      });
      return aiProviderConfiguration(row);
    });
  }

  async pause(input: Parameters<AiProviderConfigurationRepository['pause']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN' && admin?.role !== 'OPERATOR') return null;
    const target = await this.client.aiProviderConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    if (target === null) return null;
    const row = await this.client.aiProviderConfiguration.update({
      where: { id: target.id },
      data: { globallyPaused: true },
    });
    await this.client.aiProviderConfigurationAudit.create({
      data: {
        configurationId: row.id,
        environment: input.environment,
        provider: row.provider,
        actorUserId: input.actorUserId,
        action: 'PAUSE',
        reason: input.reason,
        changedFields: ['globallyPaused'],
      },
    });
    return aiProviderConfiguration(row);
  }

  async getActiveForRuntime(
    input: Parameters<AiProviderConfigurationRepository['getActiveForRuntime']>[0],
  ) {
    const row = await this.client.aiProviderConfiguration.findFirst({
      where: {
        environment: input.environment,
        provider: input.provider,
        status: 'ACTIVE',
      },
    });
    if (row?.encryptedApiKey == null) return null;
    const provider = input.provider.toLowerCase();
    const [daily, monthly] = await Promise.all([
      this.client.aiUsageEvent.aggregate({
        where: { provider, occurredAt: { gte: input.dailyFrom, lt: input.now } },
        _sum: { estimatedCostUsdMicros: true },
      }),
      this.client.aiUsageEvent.aggregate({
        where: { provider, occurredAt: { gte: input.monthlyFrom, lt: input.now } },
        _sum: { estimatedCostUsdMicros: true },
      }),
    ]);
    const safeNumber = (value: bigint | null) =>
      value === null
        ? 0
        : Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : value);
    return {
      configuration: aiProviderConfiguration(row),
      encryptedApiKey: row.encryptedApiKey,
      dailySpentUsdMicros: safeNumber(daily._sum.estimatedCostUsdMicros),
      monthlySpentUsdMicros: safeNumber(monthly._sum.estimatedCostUsdMicros),
    };
  }
}

/**
 * Keeps video-generation budget reservation separate from general AI text usage.
 * The estimated amount is deliberately retained for every queued request so a failed
 * provider response cannot silently make the available budget look larger than it is.
 */
export class PrismaVideoAiProviderCostPolicyRepository implements VideoAiProviderCostPolicyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findActive(input: Parameters<VideoAiProviderCostPolicyRepository['findActive']>[0]) {
    const configuration = await this.client.aiProviderConfiguration.findFirst({
      where: {
        environment: input.environment,
        provider: input.provider,
        model: input.model,
        status: 'ACTIVE',
        globallyPaused: false,
        encryptedApiKey: { not: null },
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    });
    if (!configuration) return null;
    const total = async (from: Date) => {
      const value = await this.client.videoSceneGeneration.aggregate({
        where: {
          provider: input.provider,
          model: input.model,
          createdAt: { gte: from, lt: input.now },
        },
        _sum: { estimatedCostUsdMicros: true },
      });
      return value._sum.estimatedCostUsdMicros ?? 0;
    };
    const [dailySpentUsdMicros, monthlySpentUsdMicros] = await Promise.all([
      total(input.dailyFrom),
      total(input.monthlyFrom),
    ]);
    return {
      policy: {
        provider: input.provider,
        model: input.model,
        globallyPaused: configuration.globallyPaused,
        dailyBudgetUsdMicros: configuration.dailyBudgetUsdMicros,
        monthlyBudgetUsdMicros: configuration.monthlyBudgetUsdMicros,
        maxSceneCostUsdMicros: configuration.requestCostUsdMicros,
      },
      dailySpentUsdMicros,
      monthlySpentUsdMicros,
    };
  }
}

export class PrismaAdminEmailConfigurationRepository implements AdminEmailConfigurationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private admin(userId: string) {
    return this.client.platformAdmin.findFirst({ where: { userId, status: 'ACTIVE' } });
  }
  async list(input: Parameters<AdminEmailConfigurationRepository['list']>[0]) {
    if (!(await this.admin(input.actorUserId))) return null;
    return (
      await this.client.adminEmailConfiguration.findMany({
        where: { environment: input.environment },
        orderBy: { version: 'desc' },
      })
    ).map(adminEmailConfiguration);
  }
  async create(input: Parameters<AdminEmailConfigurationRepository['create']>[0]) {
    if ((await this.admin(input.actorUserId))?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const latest = await tx.adminEmailConfiguration.findFirst({
        where: { environment: input.environment },
        orderBy: { version: 'desc' },
      });
      const row = await tx.adminEmailConfiguration.create({
        data: {
          environment: input.environment,
          version: (latest?.version ?? 0) + 1,
          encryptedApiKey: input.apiKey.encryptedValue,
          apiKeyMask: input.apiKey.mask,
          keyVersion: input.apiKey.keyVersion,
          fromEmail: input.fromEmail,
          recipientEmails: input.recipientEmails,
        },
      });
      await tx.adminEmailConfigurationAudit.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'CREATE_VERSION',
          reason: input.reason,
          changedFields: ['credentials', 'fromEmail', 'recipientEmails'],
        },
      });
      return adminEmailConfiguration(row);
    });
  }
  async forTest(input: Parameters<AdminEmailConfigurationRepository['forTest']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (!admin || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    const row = await this.client.adminEmailConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    return row
      ? { configuration: adminEmailConfiguration(row), encryptedApiKey: row.encryptedApiKey }
      : null;
  }
  async recordTest(input: Parameters<AdminEmailConfigurationRepository['recordTest']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (!admin || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role))
      throw new ApplicationError('FORBIDDEN', 'admin required');
    const target = await this.client.adminEmailConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    if (!target) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    await this.client.$transaction([
      this.client.adminEmailConfiguration.update({
        where: { id: target.id },
        data: {
          status: input.success ? 'DRAFT' : 'ERROR',
          lastVerifiedAt: input.success ? new Date() : target.lastVerifiedAt,
          lastErrorCategory: input.errorCategory,
        },
      }),
      this.client.adminEmailConfigurationAudit.create({
        data: {
          configurationId: target.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'CONNECTION_TEST',
          reason: '管理画面からテストメールを送信',
          changedFields: ['lastVerifiedAt', 'lastErrorCategory', 'status'],
        },
      }),
    ]);
  }
  async activate(input: Parameters<AdminEmailConfigurationRepository['activate']>[0]) {
    if ((await this.admin(input.actorUserId))?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const target = await tx.adminEmailConfiguration.findFirst({
        where: { id: input.configurationId, environment: input.environment },
      });
      if (!target) return null;
      if (!target.lastVerifiedAt || target.lastErrorCategory)
        throw new ApplicationError('CONFLICT', 'successful connection test required');
      await tx.adminEmailConfiguration.updateMany({
        where: { environment: input.environment, status: 'ACTIVE' },
        data: { status: 'DISABLED', globallyPaused: true },
      });
      const row = await tx.adminEmailConfiguration.update({
        where: { id: target.id },
        data: { status: 'ACTIVE', globallyPaused: false },
      });
      await tx.adminEmailConfigurationAudit.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'ACTIVATE',
          reason: input.reason,
          changedFields: ['status', 'globallyPaused'],
        },
      });
      return adminEmailConfiguration(row);
    });
  }
  async pause(input: Parameters<AdminEmailConfigurationRepository['pause']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (!admin || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    const target = await this.client.adminEmailConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    if (!target) return null;
    const row = await this.client.adminEmailConfiguration.update({
      where: { id: target.id },
      data: { globallyPaused: true },
    });
    await this.client.adminEmailConfigurationAudit.create({
      data: {
        configurationId: row.id,
        environment: input.environment,
        actorUserId: input.actorUserId,
        action: 'PAUSE',
        reason: input.reason,
        changedFields: ['globallyPaused'],
      },
    });
    return adminEmailConfiguration(row);
  }
  async active(input: Parameters<AdminEmailConfigurationRepository['active']>[0]) {
    const row = await this.client.adminEmailConfiguration.findFirst({
      where: {
        environment: input.environment,
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    });
    return row
      ? { configuration: adminEmailConfiguration(row), encryptedApiKey: row.encryptedApiKey }
      : null;
  }
  async hasConfiguration(
    input: Parameters<AdminEmailConfigurationRepository['hasConfiguration']>[0],
  ) {
    return (
      (await this.client.adminEmailConfiguration.count({
        where: { environment: input.environment },
      })) > 0
    );
  }
}

export class PrismaLineRichMenuRepository implements LineRichMenuRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private admin(actorUserId: string) {
    return this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
    });
  }

  async listForAdmin(input: Parameters<LineRichMenuRepository['listForAdmin']>[0]) {
    if ((await this.admin(input.actorUserId)) === null) return null;
    const rows = await this.client.lineRichMenu.findMany({
      where: { environment: input.environment },
      include: { areas: true },
      orderBy: { version: 'desc' },
    });
    return rows.map(lineRichMenu);
  }

  async getForPublish(input: Parameters<LineRichMenuRepository['getForPublish']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (
      admin === null ||
      (input.operation === 'PUBLISH' && admin.role !== 'SUPER_ADMIN') ||
      (input.operation === 'DISABLE' && !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role))
    )
      return null;
    const row = await this.client.lineRichMenu.findFirst({
      where: { id: input.richMenuId, environment: input.environment },
      include: { areas: true },
    });
    return row === null ? null : lineRichMenu(row);
  }

  async createDraft(input: Parameters<LineRichMenuRepository['createDraft']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    return this.client.$transaction(
      async (tx) => {
        const latest = await tx.lineRichMenu.findFirst({
          where: { environment: input.environment },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const row = await tx.lineRichMenu.create({
          data: {
            environment: input.environment,
            version: (latest?.version ?? 0) + 1,
            name: input.name,
            description: input.description,
            imageObjectKey: input.imageObjectKey,
            imageSha256: input.imageSha256,
            imageContentType: input.imageContentType,
            imageWidth: input.imageWidth,
            imageHeight: input.imageHeight,
            areas: { create: input.areas },
          },
          include: { areas: true },
        });
        await tx.lineRichMenuAudit.create({
          data: {
            richMenuId: row.id,
            environment: input.environment,
            actorUserId: input.actorUserId,
            action: 'CREATE_DRAFT',
            reason: input.reason,
            metadata: { version: row.version, imageSha256: row.imageSha256 },
          },
        });
        return lineRichMenu(row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async markVerified(input: Parameters<LineRichMenuRepository['markVerified']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    return this.client.$transaction(async (tx) => {
      const target = await tx.lineRichMenu.findFirst({
        where: {
          id: input.richMenuId,
          environment: input.environment,
          status: { in: ['DRAFT', 'ERROR'] },
        },
      });
      if (target === null) return null;
      const row = await tx.lineRichMenu.update({
        where: { id: target.id },
        data: { status: 'VERIFIED', lastErrorCategory: null },
        include: { areas: true },
      });
      await tx.lineRichMenuAudit.create({
        data: {
          richMenuId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'VERIFY',
          reason: input.reason,
          metadata: { fromStatus: target.status, toStatus: row.status },
        },
      });
      return lineRichMenu(row);
    });
  }

  async activate(input: Parameters<LineRichMenuRepository['activate']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const target = await tx.lineRichMenu.findFirst({
        where: {
          id: input.richMenuId,
          environment: input.environment,
          status: { in: ['VERIFIED', 'ACTIVE'] },
        },
      });
      if (target === null) return null;
      await tx.lineRichMenu.updateMany({
        where: {
          environment: input.environment,
          status: 'ACTIVE',
          id: { not: target.id },
        },
        data: { status: 'DISABLED' },
      });
      const row = await tx.lineRichMenu.update({
        where: { id: target.id },
        data: {
          status: 'ACTIVE',
          lineRichMenuId: input.lineRichMenuId,
          lastSyncedAt: input.syncedAt,
          lastErrorCategory: null,
        },
        include: { areas: true },
      });
      await tx.lineRichMenuAudit.create({
        data: {
          richMenuId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'ACTIVATE',
          reason: input.reason,
          metadata: { lineRichMenuId: input.lineRichMenuId, version: row.version },
        },
      });
      return lineRichMenu(row);
    });
  }

  async disable(input: Parameters<LineRichMenuRepository['disable']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    return this.client.$transaction(async (tx) => {
      const target = await tx.lineRichMenu.findFirst({
        where: { id: input.richMenuId, environment: input.environment, status: 'ACTIVE' },
      });
      if (target === null) return null;
      const row = await tx.lineRichMenu.update({
        where: { id: target.id },
        data: { status: 'DISABLED', lastSyncedAt: input.syncedAt },
        include: { areas: true },
      });
      await tx.lineRichMenuAudit.create({
        data: {
          richMenuId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'DISABLE',
          reason: input.reason,
          metadata: { lineRichMenuId: row.lineRichMenuId, version: row.version },
        },
      });
      return lineRichMenu(row);
    });
  }
}

export class PrismaLineConfigurationRepository implements LineConfigurationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private admin(actorUserId: string) {
    return this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
    });
  }

  async listForAdmin(input: { actorUserId: string; environment: LineConfigurationEnvironment }) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null) return null;
    const rows = await this.client.lineChannelConfiguration.findMany({
      where: { environment: input.environment },
      orderBy: { version: 'desc' },
    });
    return rows.map((row) =>
      lineConfiguration(row, ['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)),
    );
  }

  async createVersion(input: Parameters<LineConfigurationRepository['createVersion']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const latest = await tx.lineChannelConfiguration.findFirst({
        where: { environment: input.environment },
        orderBy: { version: 'desc' },
      });
      const row = await tx.lineChannelConfiguration.create({
        data: {
          environment: input.environment,
          version: (latest?.version ?? 0) + 1,
          loginChannelId: input.loginChannelId,
          encryptedLoginSecret: input.secrets.loginSecret,
          loginSecretMask: input.secrets.loginSecretMask,
          messagingChannelId: input.messagingChannelId,
          encryptedMessagingSecret: input.secrets.messagingSecret,
          messagingSecretMask: input.secrets.messagingSecretMask,
          encryptedAccessToken: input.secrets.accessToken,
          accessTokenMask: input.secrets.accessTokenMask,
          liffId: input.liffId,
          defaultNotificationTime: input.defaultNotificationTime,
          defaultTimezone: input.defaultTimezone,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
          globallyPaused: input.globallyPaused,
          quotaWarningPercent: input.quotaWarningPercent,
          quotaLowPriorityStop: input.quotaLowPriorityStop,
          keyVersion: input.secrets.keyVersion,
        },
      });
      await tx.lineConfigurationAudit.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'CREATE_VERSION',
          reason: input.reason,
          changedFields: ['credentials', 'notificationDefaults', 'quotaPolicy'],
        },
      });
      return lineConfiguration(row);
    });
  }

  async activate(input: Parameters<LineConfigurationRepository['activate']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const target = await tx.lineChannelConfiguration.findFirst({
        where: { id: input.configurationId, environment: input.environment },
      });
      if (target === null) return null;
      if (target.lastVerifiedAt === null || target.lastErrorCategory !== null)
        throw new ApplicationError('CONFLICT', 'successful connection test required');
      await tx.lineChannelConfiguration.updateMany({
        where: { environment: input.environment, status: 'ACTIVE' },
        data: { status: 'DISABLED' },
      });
      const row = await tx.lineChannelConfiguration.update({
        where: { id: target.id },
        data: { status: 'ACTIVE' },
      });
      await tx.lineConfigurationAudit.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'ACTIVATE',
          reason: input.reason,
          changedFields: ['status'],
        },
      });
      return lineConfiguration(row);
    });
  }

  async getForConnectionTest(
    input: Parameters<LineConfigurationRepository['getForConnectionTest']>[0],
  ) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    const row = await this.client.lineChannelConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    if (row === null) return null;
    return {
      configuration: lineConfiguration(row),
      loginSecret: row.encryptedLoginSecret,
      messagingSecret: row.encryptedMessagingSecret,
      accessToken: row.encryptedAccessToken,
    };
  }

  async recordConnectionTest(
    input: Parameters<LineConfigurationRepository['recordConnectionTest']>[0],
  ) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role))
      throw new ApplicationError('FORBIDDEN', 'admin required');
    await this.client.$transaction([
      this.client.lineChannelConfiguration.update({
        where: { id: input.configurationId },
        data: {
          ...(input.success ? { lastVerifiedAt: new Date() } : {}),
          lastErrorCategory: input.errorCategory,
          ...(input.success ? {} : { status: 'ERROR' }),
        },
      }),
      this.client.lineConfigurationAudit.create({
        data: {
          configurationId: input.configurationId,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'CONNECTION_TEST',
          reason: '管理画面から接続テストを実行',
          changedFields: ['lastVerifiedAt', 'lastErrorCategory'],
        },
      }),
    ]);
  }
}

function groupLineConfiguration(
  row: Prisma.GroupLineChannelConfigurationGetPayload<object>,
): GroupLineChannelConfiguration {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    groupId: row.groupId,
    environment: row.environment,
    version: row.version,
    status: row.status,
    webhookRoutingKey: row.webhookRoutingKey,
    loginChannelId: row.loginChannelId,
    loginSecretMask: row.loginSecretMask,
    messagingChannelId: row.messagingChannelId,
    messagingSecretMask: row.messagingSecretMask,
    accessTokenMask: row.accessTokenMask,
    liffId: row.liffId,
    globallyPaused: row.globallyPaused,
    quotaWarningPercent: row.quotaWarningPercent,
    quotaLowPriorityStop: row.quotaLowPriorityStop,
    keyVersion: row.keyVersion,
    lastVerifiedAt: row.lastVerifiedAt,
    lastErrorCategory: row.lastErrorCategory,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaGroupLineConfigurationRepository implements GroupLineConfigurationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async access(actorUserId: string, workspaceId: string, groupId: string) {
    const [admin, manager] = await Promise.all([
      this.client.platformAdmin.findFirst({
        where: { userId: actorUserId, status: 'ACTIVE' },
        select: { role: true },
      }),
      this.client.groupMembership.findFirst({
        where: {
          userId: actorUserId,
          workspaceId,
          groupId,
          OR: [
            { role: 'MANAGER' },
            {
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
              group: { serviceConfiguration: { isNot: null } },
            },
          ],
          status: 'ACTIVE',
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
        },
        select: { id: true },
      }),
    ]);
    return { admin, manager };
  }

  async list(input: Parameters<GroupLineConfigurationRepository['list']>[0]) {
    const access = await this.access(input.actorUserId, input.workspaceId, input.groupId);
    if (!access.admin && !access.manager) return null;
    const policy = await this.client.groupLineRoutingPolicy.findUnique({
      where: {
        workspaceId_groupId_environment: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
        },
      },
    });
    const rows = await this.client.groupLineChannelConfiguration.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        environment: input.environment,
      },
      orderBy: { version: 'desc' },
    });
    return {
      mode: policy?.mode ?? 'SHARED',
      pilotEnabled: policy?.pilotEnabled ?? false,
      configurations: rows.map(groupLineConfiguration),
    };
  }

  async createVersion(input: Parameters<GroupLineConfigurationRepository['createVersion']>[0]) {
    const access = await this.access(input.actorUserId, input.workspaceId, input.groupId);
    if (access.admin?.role !== 'SUPER_ADMIN' && !access.manager) return null;
    return this.client.$transaction(async (tx) => {
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: input.workspaceId },
        select: { dedicatedLineEnabled: true, suspended: true },
      });
      if (entitlement && (!entitlement.dedicatedLineEnabled || entitlement.suspended))
        throw new ApplicationError('FORBIDDEN', 'dedicated LINE is not included in the contract');
      const policy = await tx.groupLineRoutingPolicy.findUnique({
        where: {
          workspaceId_groupId_environment: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            environment: input.environment,
          },
        },
      });
      if (!policy || policy.mode !== 'DEDICATED' || !policy.pilotEnabled)
        throw new ApplicationError('CONFLICT', 'dedicated LINE pilot is not enabled');
      const latest = await tx.groupLineChannelConfiguration.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
        },
        orderBy: { version: 'desc' },
      });
      const row = await tx.groupLineChannelConfiguration.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          version: (latest?.version ?? 0) + 1,
          loginChannelId: input.loginChannelId,
          encryptedLoginSecret: input.secrets.loginSecret,
          loginSecretMask: input.secrets.loginSecretMask,
          messagingChannelId: input.messagingChannelId,
          encryptedMessagingSecret: input.secrets.messagingSecret,
          messagingSecretMask: input.secrets.messagingSecretMask,
          encryptedAccessToken: input.secrets.accessToken,
          accessTokenMask: input.secrets.accessTokenMask,
          liffId: input.liffId,
          globallyPaused: true,
          quotaWarningPercent: input.quotaWarningPercent,
          quotaLowPriorityStop: input.quotaLowPriorityStop,
          keyVersion: input.secrets.keyVersion,
          createdByUserId: input.actorUserId,
        },
      });
      await tx.groupLineConfigurationAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          configurationId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'CREATE_VERSION',
          reason: input.reason,
          afterData: { version: row.version, status: row.status },
        },
      });
      return groupLineConfiguration(row);
    });
  }

  async getForTest(input: Parameters<GroupLineConfigurationRepository['getForTest']>[0]) {
    const access = await this.access(input.actorUserId, input.workspaceId, input.groupId);
    if (
      (!access.admin || !['SUPER_ADMIN', 'OPERATOR'].includes(access.admin.role)) &&
      !access.manager
    )
      return null;
    const row = await this.client.groupLineChannelConfiguration.findFirst({
      where: {
        id: input.configurationId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        environment: input.environment,
      },
    });
    return row
      ? {
          configuration: groupLineConfiguration(row),
          loginSecret: row.encryptedLoginSecret,
          messagingSecret: row.encryptedMessagingSecret,
          accessToken: row.encryptedAccessToken,
        }
      : null;
  }

  async recordTest(input: Parameters<GroupLineConfigurationRepository['recordTest']>[0]) {
    const access = await this.access(input.actorUserId, input.workspaceId, input.groupId);
    if (
      (!access.admin || !['SUPER_ADMIN', 'OPERATOR'].includes(access.admin.role)) &&
      !access.manager
    )
      throw new ApplicationError('FORBIDDEN', 'admin required');
    await this.client.$transaction(async (tx) => {
      const target = await tx.groupLineChannelConfiguration.findFirst({
        where: {
          id: input.configurationId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
        },
      });
      if (!target) throw new ApplicationError('NOT_FOUND', 'configuration not found');
      await tx.groupLineChannelConfiguration.update({
        where: { id: target.id },
        data: {
          lastVerifiedAt: input.success ? new Date() : target.lastVerifiedAt,
          lastErrorCategory: input.errorCategory,
          status: input.success ? 'DRAFT' : 'ERROR',
        },
      });
      await tx.groupLineConfigurationAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          configurationId: target.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'CONNECTION_TEST',
          reason: '管理画面から接続テストを実行',
          afterData: { success: input.success, errorCategory: input.errorCategory },
        },
      });
    });
  }

  async activate(input: Parameters<GroupLineConfigurationRepository['activate']>[0]) {
    const access = await this.access(input.actorUserId, input.workspaceId, input.groupId);
    if (access.admin?.role !== 'SUPER_ADMIN' && !access.manager) return null;
    return this.client.$transaction(async (tx) => {
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: input.workspaceId },
        select: { dedicatedLineEnabled: true, suspended: true },
      });
      if (entitlement && (!entitlement.dedicatedLineEnabled || entitlement.suspended)) return null;
      const target = await tx.groupLineChannelConfiguration.findFirst({
        where: {
          id: input.configurationId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          lastVerifiedAt: { not: null },
          lastErrorCategory: null,
        },
      });
      if (!target) return null;
      await tx.groupLineChannelConfiguration.updateMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          status: 'ACTIVE',
        },
        data: { status: 'DISABLED', globallyPaused: true },
      });
      const row = await tx.groupLineChannelConfiguration.update({
        where: { id: target.id },
        data: { status: 'ACTIVE', globallyPaused: false },
      });
      await tx.groupLineConfigurationAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          configurationId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'ACTIVATE',
          reason: input.reason,
          beforeData: { status: target.status, globallyPaused: target.globallyPaused },
          afterData: { status: row.status, globallyPaused: row.globallyPaused },
        },
      });
      return groupLineConfiguration(row);
    });
  }

  async setPolicy(input: Parameters<GroupLineConfigurationRepository['setPolicy']>[0]) {
    const access = await this.access(input.actorUserId, input.workspaceId, input.groupId);
    if (access.admin?.role !== 'SUPER_ADMIN' && !access.manager) return null;
    return this.client.$transaction(async (tx) => {
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: input.workspaceId },
        select: { dedicatedLineEnabled: true, suspended: true },
      });
      if (
        input.mode === 'DEDICATED' &&
        entitlement &&
        (!entitlement.dedicatedLineEnabled || entitlement.suspended)
      )
        return null;
      const group = await tx.group.findFirst({
        where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!group) return null;
      const before = await tx.groupLineRoutingPolicy.findUnique({
        where: {
          workspaceId_groupId_environment: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            environment: input.environment,
          },
        },
      });
      const policy = await tx.groupLineRoutingPolicy.upsert({
        where: {
          workspaceId_groupId_environment: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            environment: input.environment,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          mode: input.mode,
          pilotEnabled: input.pilotEnabled,
          reason: input.reason,
          updatedByUserId: input.actorUserId,
        },
        update: {
          mode: input.mode,
          pilotEnabled: input.pilotEnabled,
          reason: input.reason,
          updatedByUserId: input.actorUserId,
        },
      });
      if (input.mode !== 'DEDICATED') {
        await tx.groupLineChannelConfiguration.updateMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            environment: input.environment,
            status: 'ACTIVE',
          },
          data: { status: 'DISABLED', globallyPaused: true },
        });
      }
      await tx.groupLineConfigurationAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'SET_POLICY',
          reason: input.reason,
          ...(before
            ? { beforeData: { mode: before.mode, pilotEnabled: before.pilotEnabled } }
            : {}),
          afterData: { mode: policy.mode, pilotEnabled: policy.pilotEnabled },
        },
      });
      return { mode: policy.mode, pilotEnabled: policy.pilotEnabled };
    });
  }
}

export class PrismaGroupLineConnectionRepository implements GroupLineConnectionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async connectVerified(input: Parameters<GroupLineConnectionRepository['connectVerified']>[0]) {
    return this.client.$transaction(async (tx) => {
      const membership = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
      const configuration = await tx.groupLineChannelConfiguration.findFirst({
        where: {
          id: input.configurationId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          status: 'ACTIVE',
          lastVerifiedAt: { not: null },
          lastErrorCategory: null,
          group: {
            lineRoutingPolicies: {
              some: { environment: input.environment, mode: 'DEDICATED', pilotEnabled: true },
            },
          },
        },
        select: { id: true },
      });
      if (!membership || !configuration) return false;
      await tx.groupLineConnection.upsert({
        where: {
          configurationId_userId: {
            configurationId: input.configurationId,
            userId: input.actorUserId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          userId: input.actorUserId,
          configurationId: input.configurationId,
          providerUserId: input.verifiedProviderUserId,
          notificationConsentAt: input.consentGranted ? new Date() : null,
        },
        update: {
          groupMembershipId: input.groupMembershipId,
          providerUserId: input.verifiedProviderUserId,
          status: 'ACTIVE',
          notificationConsentAt: input.consentGranted ? new Date() : null,
        },
      });
      return true;
    });
  }

  async applyWebhook(input: Parameters<GroupLineConnectionRepository['applyWebhook']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const configuration = await tx.groupLineChannelConfiguration.findFirst({
          where: {
            id: input.configurationId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            environment: input.environment,
            status: 'ACTIVE',
            group: {
              status: 'ACTIVE',
              lineRoutingPolicies: {
                some: { environment: input.environment, mode: 'DEDICATED', pilotEnabled: true },
              },
            },
          },
          select: { id: true },
        });
        if (!configuration) return 'IGNORED' as const;
        const duplicate = await tx.groupLineWebhookEvent.findUnique({
          where: {
            configurationId_providerEventId: {
              configurationId: input.configurationId,
              providerEventId: input.providerEventId,
            },
          },
          select: { id: true },
        });
        if (duplicate) return 'DUPLICATE' as const;
        let outcome: 'APPLIED' | 'CONNECTION_NOT_FOUND' | 'IGNORED';
        if (input.type === 'OTHER' || input.providerUserId === null) outcome = 'IGNORED';
        else {
          const connection = await tx.groupLineConnection.findFirst({
            where: {
              configurationId: input.configurationId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              providerUserId: input.providerUserId,
              status: 'ACTIVE',
              user: { status: 'ACTIVE' },
              groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
            },
          });
          if (!connection) outcome = 'CONNECTION_NOT_FOUND';
          else if (
            connection.lastWebhookAt &&
            connection.lastWebhookAt.getTime() >= input.occurredAt.getTime()
          )
            outcome = 'IGNORED';
          else {
            const following = input.type === 'FOLLOW';
            await tx.groupLineConnection.update({
              where: { id: connection.id },
              data: {
                friendshipStatus: following ? 'FOLLOWING' : 'UNFOLLOWED',
                ...(following
                  ? { followedAt: input.occurredAt }
                  : { unfollowedAt: input.occurredAt }),
                lastWebhookAt: input.occurredAt,
              },
            });
            if (!following)
              await tx.lineMessageDelivery.updateMany({
                where: {
                  environment: input.environment,
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  userId: connection.userId,
                  status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
                  sentAt: null,
                  cancelledAt: null,
                },
                data: {
                  status: 'CANCELLED',
                  cancelledAt: input.processedAt,
                  lastErrorCategory: 'RECIPIENT_UNAVAILABLE',
                  leaseOwner: null,
                  leaseExpiresAt: null,
                },
              });
            outcome = 'APPLIED';
          }
        }
        await tx.groupLineWebhookEvent.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            configurationId: input.configurationId,
            providerEventId: input.providerEventId,
            type: input.type,
            outcome,
            occurredAt: input.occurredAt,
            processedAt: input.processedAt,
          },
        });
        return outcome;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return 'DUPLICATE';
      throw error;
    }
  }
}

function user(row: Awaited<ReturnType<PrismaClient['user']['create']>>): User {
  return { ...row, email: row.email, status: row.status };
}

function contentPillar(row: Prisma.ContentPillarGetPayload<object>): ContentPillar {
  return row;
}

export class PrismaContentPillarRepository implements ContentPillarRepository {
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

  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApplicationError('CONFLICT', 'content pillar title already exists', error);
    }
    throw error;
  }

  async create(input: Parameters<ContentPillarRepository['create']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if ((await this.managed(tx, input)) === null) return null;
        return contentPillar(
          await tx.contentPillar.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              title: input.title,
              description: input.description ?? null,
              weight: input.weight,
            },
          }),
        );
      });
    } catch (error) {
      return this.conflict(error);
    }
  }

  async list(input: Parameters<ContentPillarRepository['list']>[0]) {
    if ((await this.accessible(this.client, input)) === null) return null;
    const rows = await this.client.contentPillar.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(contentPillar);
  }

  async find(input: Parameters<ContentPillarRepository['find']>[0]) {
    if ((await this.accessible(this.client, input)) === null) return null;
    const row = await this.client.contentPillar.findFirst({
      where: {
        id: input.pillarId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        deletedAt: null,
      },
    });
    return row === null ? null : contentPillar(row);
  }

  async update(input: Parameters<ContentPillarRepository['update']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if ((await this.managed(tx, input)) === null) return null;
        const row = await tx.contentPillar.findFirst({
          where: {
            id: input.pillarId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            deletedAt: null,
          },
        });
        if (row === null) return null;
        return contentPillar(
          await tx.contentPillar.update({
            where: { id: row.id },
            data: {
              ...(input.title === undefined ? {} : { title: input.title }),
              ...(input.description === undefined ? {} : { description: input.description }),
              ...(input.weight === undefined ? {} : { weight: input.weight }),
            },
          }),
        );
      });
    } catch (error) {
      return this.conflict(error);
    }
  }

  async setActive(input: Parameters<ContentPillarRepository['setActive']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.contentPillar.findFirst({
        where: {
          id: input.pillarId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          deletedAt: null,
        },
      });
      if (row === null) return null;
      if (row.active === input.active) return contentPillar(row);
      return contentPillar(
        await tx.contentPillar.update({ where: { id: row.id }, data: { active: input.active } }),
      );
    });
  }

  async softDelete(input: Parameters<ContentPillarRepository['softDelete']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.contentPillar.findFirst({
        where: { id: input.pillarId, workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      });
      if (row === null) return null;
      if (row.deletedAt !== null) return contentPillar(row);
      return contentPillar(
        await tx.contentPillar.update({
          where: { id: row.id },
          data: { active: false, deletedAt: new Date() },
        }),
      );
    });
  }
}

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
function weeklyPlan(row: Prisma.WeeklyPlanGetPayload<{ include: { items: true } }>): WeeklyPlan {
  return {
    ...row,
    weekStartDate: dateOnly(row.weekStartDate),
    status: row.status,
    items: row.items
      .map((item) => ({
        ...item,
        scheduledDate: dateOnly(item.scheduledDate),
        recommendedFormat: item.recommendedFormat,
      }))
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.id.localeCompare(b.id)),
  };
}

export class PrismaWeeklyPlanRepository implements WeeklyPlanRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private async authorized(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
    manage: boolean,
  ) {
    const value = await client.bunshin.findFirst({
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
    if (!value) return null;
    const role = value.workspace.memberships[0]?.role;
    return !manage || (role && canManageBunshin(role, input.actorUserId, value.ownerUserId))
      ? value
      : null;
  }
  private include = { items: true } as const;
  private async plan(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; weeklyPlanId: string },
  ) {
    return client.weeklyPlan.findFirst({
      where: { id: input.weeklyPlanId, workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      include: this.include,
    });
  }
  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ApplicationError('CONFLICT', 'weekly plan or date already exists', error);
    throw error;
  }
  async createPlan(input: Parameters<WeeklyPlanRepository['createPlan']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        return weeklyPlan(
          await tx.weeklyPlan.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              weekStartDate: new Date(`${input.weekStartDate}T00:00:00Z`),
              timezone: input.timezone,
              strategySummary: input.strategySummary ?? null,
            },
            include: this.include,
          }),
        );
      });
    } catch (error) {
      return this.conflict(error);
    }
  }
  async createGeneratedPlan(input: Parameters<WeeklyPlanRepository['createGeneratedPlan']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        const active = await tx.contentPillar.findMany({
          where: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            active: true,
            deletedAt: null,
            id: { in: input.items.map(({ contentPillarId }) => contentPillarId) },
          },
          select: { id: true },
        });
        if (
          new Set(active.map(({ id }) => id)).size !==
          new Set(input.items.map(({ contentPillarId }) => contentPillarId)).size
        )
          return null;
        const campaignIds = [
          ...new Set(input.items.flatMap(({ campaignId }) => (campaignId ? [campaignId] : []))),
        ];
        if (campaignIds.length > 0) {
          const campaigns = await tx.campaign.count({
            where: {
              id: { in: campaignIds },
              status: 'OPEN',
              startsAt: {
                lt: new Date(
                  Date.parse(`${input.weekStartDate}T00:00:00.000Z`) + 7 * 24 * 60 * 60 * 1000,
                ),
              },
              endsAt: { gt: new Date(`${input.weekStartDate}T00:00:00.000Z`) },
              group: {
                status: 'ACTIVE',
                memberships: {
                  some: {
                    userId: input.actorUserId,
                    status: 'ACTIVE',
                    consentedAt: { not: null },
                  },
                },
              },
              participations: {
                some: {
                  userId: input.actorUserId,
                  bunshinId: input.bunshinId,
                  participantWorkspaceId: input.workspaceId,
                  status: 'ACCEPTED',
                },
              },
              productPackVersion: {
                status: 'PUBLISHED',
                assignments: {
                  some: { bunshinId: input.bunshinId, status: 'ACTIVE' },
                },
              },
            },
          });
          if (campaigns !== campaignIds.length) return null;
        }
        const plan = await tx.weeklyPlan.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            weekStartDate: new Date(`${input.weekStartDate}T00:00:00Z`),
            timezone: input.timezone,
            strategySummary: input.strategySummary,
          },
        });
        await tx.weeklyPlanItem.createMany({
          data: input.items.map((item) => ({
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            weeklyPlanId: plan.id,
            scheduledDate: new Date(`${item.scheduledDate}T00:00:00Z`),
            contentPillarId: item.contentPillarId,
            goal: item.goal,
            angle: item.angle,
            recommendedFormat: item.recommendedFormat,
            notes: item.notes,
            campaignId: item.campaignId,
            classification: item.classification,
          })),
        });
        return weeklyPlan((await this.plan(tx, { ...input, weeklyPlanId: plan.id }))!);
      });
    } catch (error) {
      return this.conflict(error);
    }
  }
  async listPlans(input: Parameters<WeeklyPlanRepository['listPlans']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    return (
      await this.client.weeklyPlan.findMany({
        where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
        include: this.include,
        orderBy: [{ weekStartDate: 'desc' }, { id: 'desc' }],
      })
    ).map(weeklyPlan);
  }
  async findPlan(input: Parameters<WeeklyPlanRepository['findPlan']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const row = await this.plan(this.client, input);
    return row ? weeklyPlan(row) : null;
  }
  async updatePlan(input: Parameters<WeeklyPlanRepository['updatePlan']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const row = await this.plan(tx, input);
      if (!row) return null;
      if (row.status !== 'DRAFT')
        throw new ApplicationError('CONFLICT', 'only draft plan is editable');
      return weeklyPlan(
        await tx.weeklyPlan.update({
          where: { id: row.id },
          data: { strategySummary: input.strategySummary },
          include: this.include,
        }),
      );
    });
  }
  private async activePillar(
    tx: Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; contentPillarId: string },
  ) {
    return tx.contentPillar.findFirst({
      where: {
        id: input.contentPillarId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        active: true,
        deletedAt: null,
      },
      select: { id: true },
    });
  }
  private inWeek(plan: { weekStartDate: Date }, value: string) {
    const date = new Date(`${value}T00:00:00Z`);
    const difference = (date.valueOf() - plan.weekStartDate.valueOf()) / 86400000;
    if (!Number.isInteger(difference) || difference < 0 || difference > 6)
      throw new ApplicationError('VALIDATION_ERROR', 'scheduled date is outside plan week');
    return date;
  }
  async createItem(input: Parameters<WeeklyPlanRepository['createItem']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        const plan = await this.plan(tx, input);
        if (!plan) return null;
        if (plan.status !== 'DRAFT')
          throw new ApplicationError('CONFLICT', 'only draft plan is editable');
        if (!(await this.activePillar(tx, input)))
          throw new ApplicationError('NOT_FOUND', 'active content pillar not found');
        await tx.weeklyPlanItem.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            weeklyPlanId: plan.id,
            scheduledDate: this.inWeek(plan, input.scheduledDate),
            contentPillarId: input.contentPillarId,
            goal: input.goal,
            angle: input.angle,
            recommendedFormat: input.recommendedFormat,
            notes: input.notes ?? null,
          },
        });
        return weeklyPlan((await this.plan(tx, input))!);
      });
    } catch (error) {
      return this.conflict(error);
    }
  }
  async updateItem(input: Parameters<WeeklyPlanRepository['updateItem']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        const plan = await this.plan(tx, input);
        if (!plan) return null;
        if (plan.status !== 'DRAFT')
          throw new ApplicationError('CONFLICT', 'only draft plan is editable');
        const item = plan.items.find((value) => value.id === input.itemId);
        if (!item) return null;
        if (
          input.contentPillarId &&
          !(await this.activePillar(tx, { ...input, contentPillarId: input.contentPillarId }))
        )
          throw new ApplicationError('NOT_FOUND', 'active content pillar not found');
        await tx.weeklyPlanItem.update({
          where: { id: item.id },
          data: {
            ...(input.scheduledDate === undefined
              ? {}
              : { scheduledDate: this.inWeek(plan, input.scheduledDate) }),
            ...(input.contentPillarId === undefined
              ? {}
              : { contentPillarId: input.contentPillarId }),
            ...(input.goal === undefined ? {} : { goal: input.goal }),
            ...(input.angle === undefined ? {} : { angle: input.angle }),
            ...(input.recommendedFormat === undefined
              ? {}
              : { recommendedFormat: input.recommendedFormat }),
            ...(input.notes === undefined ? {} : { notes: input.notes }),
          },
        });
        return weeklyPlan((await this.plan(tx, input))!);
      });
    } catch (error) {
      return this.conflict(error);
    }
  }
  async removeItem(input: Parameters<WeeklyPlanRepository['removeItem']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const plan = await this.plan(tx, input);
      if (!plan) return null;
      if (plan.status !== 'DRAFT')
        throw new ApplicationError('CONFLICT', 'only draft plan is editable');
      const item = plan.items.find((value) => value.id === input.itemId);
      if (!item) return null;
      await tx.weeklyPlanItem.delete({ where: { id: item.id } });
      return weeklyPlan((await this.plan(tx, input))!);
    });
  }
  async confirmPlan(input: Parameters<WeeklyPlanRepository['confirmPlan']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const plan = await this.plan(tx, input);
      if (!plan) return null;
      if (plan.status === 'CONFIRMED') return weeklyPlan(plan);
      if (plan.status !== 'DRAFT')
        throw new ApplicationError('CONFLICT', 'expired plan cannot be confirmed');
      if (plan.items.length < 1) throw new ApplicationError('CONFLICT', 'plan requires an item');
      const active = await tx.contentPillar.count({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          id: { in: plan.items.map((item) => item.contentPillarId) },
          active: true,
          deletedAt: null,
        },
      });
      if (active !== new Set(plan.items.map((item) => item.contentPillarId)).size)
        throw new ApplicationError('CONFLICT', 'plan contains inactive pillar');
      return weeklyPlan(
        await tx.weeklyPlan.update({
          where: { id: plan.id },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
          include: this.include,
        }),
      );
    });
  }
  async expirePlan(input: Parameters<WeeklyPlanRepository['expirePlan']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const plan = await this.plan(tx, input);
      if (!plan) return null;
      if (plan.status === 'EXPIRED') return weeklyPlan(plan);
      return weeklyPlan(
        await tx.weeklyPlan.update({
          where: { id: plan.id },
          data: { status: 'EXPIRED', expiredAt: new Date() },
          include: this.include,
        }),
      );
    });
  }
}

const missionDate = (value: Date) => value.toISOString().slice(0, 10);
type MissionRow = Prisma.DailyMissionGetPayload<{
  include: {
    content: true;
    trendContext: true;
    contentLinkUsage: { include: { productPack: true; campaign: true } };
  };
}>;
function dailyMission(row: MissionRow): DailyMission {
  if (!row.content) throw new ApplicationError('INTERNAL_ERROR', 'mission content missing');
  return {
    ...row,
    missionDate: missionDate(row.missionDate),
    status: row.status,
    format: row.format,
    assistanceLevel: row.assistanceLevel,
    content: row.content.contentJson as Record<string, unknown>,
    trendContext: row.trendContext
      ? {
          id: row.trendContext.id,
          candidateId: row.trendContext.candidateId,
          snapshot: row.trendContext.snapshot as unknown as MissionTrendContext['snapshot'],
          createdAt: row.trendContext.createdAt,
        }
      : null,
    linkUsage: row.contentLinkUsage
      ? {
          linkName: row.contentLinkUsage.linkNameSnapshot,
          insertedUrl: row.contentLinkUsage.insertedUrlSnapshot,
          expiresAt: row.contentLinkUsage.expiresAtSnapshot,
          productName: row.contentLinkUsage.productPack.name,
          campaignName: row.contentLinkUsage.campaign?.name ?? null,
          advertisingClassification: row.contentLinkUsage.advertisingClassification,
        }
      : null,
  };
}
export class PrismaDailyMissionRepository implements DailyMissionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private include = {
    content: true,
    trendContext: true,
    contentLinkUsage: { include: { productPack: true, campaign: true } },
  } as const;
  private async authorized(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
    manage: boolean,
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
    if (!bunshin) return null;
    const role = bunshin.workspace.memberships[0]?.role;
    return !manage || (role && canManageBunshin(role, input.actorUserId, bunshin.ownerUserId))
      ? bunshin
      : null;
  }
  private async row(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; dailyMissionId: string },
  ) {
    return client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
      include: this.include,
    });
  }
  async create(input: Parameters<DailyMissionRepository['create']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        const now = new Date();
        const socialProfile = input.socialProfileId
          ? await tx.socialProfile.findFirst({
              where: {
                id: input.socialProfileId,
                workspaceId: input.workspaceId,
                bunshinId: input.bunshinId,
              },
              select: { id: true, platform: true },
            })
          : null;
        if (input.socialProfileId && !socialProfile) return null;
        if (input.trendCandidateId && !socialProfile) return null;
        const trendCandidate = input.trendCandidateId
          ? await tx.trendIdeaCandidate.findFirst({
              where: {
                id: input.trendCandidateId,
                workspaceId: input.workspaceId,
                bunshinId: input.bunshinId,
                socialProfileId: socialProfile!.id,
                platform: socialProfile!.platform,
                suggestedFormat: input.format,
                safetyStatus: 'SAFE',
                status: { in: ['PROPOSED', 'SELECTED'] },
                expiresAt: { gt: now },
                evidenceLinks: {
                  some: { evidence: { status: 'ACTIVE', expiresAt: { gt: now } } },
                },
              },
              include: {
                evidenceLinks: {
                  where: { evidence: { status: 'ACTIVE', expiresAt: { gt: now } } },
                  include: { evidence: true },
                },
              },
            })
          : null;
        if (input.trendCandidateId && !trendCandidate) return null;
        const weeklyItem = input.weeklyPlanItemId
          ? await tx.weeklyPlanItem.findFirst({
              where: {
                id: input.weeklyPlanItemId,
                workspaceId: input.workspaceId,
                bunshinId: input.bunshinId,
              },
            })
          : null;
        if (input.weeklyPlanItemId && !weeklyItem) return null;
        if (
          weeklyItem &&
          (weeklyItem.campaignId !== (input.campaignId ?? null) ||
            weeklyItem.classification !== (input.classification ?? 'ORGANIC'))
        )
          return null;
        let eligibleCampaign: {
          id: string;
          groupId: string;
          productPackVersion: {
            id: string;
            productPackId: string;
            allowLinklessPosts: boolean;
          };
        } | null = null;
        if (input.campaignId) {
          eligibleCampaign = await tx.campaign.findFirst({
            where: {
              id: input.campaignId,
              status: 'OPEN',
              startsAt: { lte: new Date(`${input.missionDate}T23:59:59.999Z`) },
              endsAt: { gt: new Date(`${input.missionDate}T00:00:00.000Z`) },
              group: {
                status: 'ACTIVE',
                memberships: {
                  some: {
                    userId: input.actorUserId,
                    status: 'ACTIVE',
                    consentedAt: { not: null },
                  },
                },
              },
              participations: {
                some: {
                  participantWorkspaceId: input.workspaceId,
                  userId: input.actorUserId,
                  bunshinId: input.bunshinId,
                  status: 'ACCEPTED',
                },
              },
              productPackVersion: {
                status: 'PUBLISHED',
                assignments: {
                  some: { bunshinId: input.bunshinId, status: 'ACTIVE' },
                },
              },
            },
            select: {
              id: true,
              groupId: true,
              productPackVersion: {
                select: { id: true, productPackId: true, allowLinklessPosts: true },
              },
            },
          });
          if (!eligibleCampaign) return null;
        }
        let resolvedLink: {
          id: string;
          name: string;
          url: string;
          expiresAt: Date | null;
        } | null = null;
        let groupMembershipId: string | null = null;
        let placementTemplate: { id: string; version: number } | null = null;
        if (input.externalLinkUsage) {
          if (
            !eligibleCampaign ||
            input.externalLinkUsage.groupId !== eligibleCampaign.groupId ||
            input.externalLinkUsage.productPackId !==
              eligibleCampaign.productPackVersion.productPackId ||
            input.externalLinkUsage.productPackVersionId !==
              eligibleCampaign.productPackVersion.id ||
            input.externalLinkUsage.campaignId !== eligibleCampaign.id ||
            !socialProfile
          )
            return null;
          const membership = await tx.groupMembership.findFirst({
            where: {
              groupId: eligibleCampaign.groupId,
              workspaceId: input.workspaceId,
              userId: input.actorUserId,
              status: 'ACTIVE',
              consentedAt: { not: null },
            },
            select: { id: true },
          });
          if (!membership) return null;
          groupMembershipId = membership.id;
          const linkAt = new Date(`${input.missionDate}T12:00:00.000Z`);
          const candidates = await tx.externalTrackingLink.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: eligibleCampaign.groupId,
              status: 'ACTIVE',
              deletedAt: null,
              system: { status: 'ACTIVE' },
              allowedDomain: { status: 'ACTIVE' },
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: linkAt } }] },
                { OR: [{ expiresAt: null }, { expiresAt: { gt: linkAt } }] },
              ],
              OR: [
                { scopeType: 'GROUP' },
                {
                  scopeType: 'MEMBER',
                  memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
                },
                {
                  scopeType: 'PRODUCT',
                  productPackId: eligibleCampaign.productPackVersion.productPackId,
                },
                {
                  scopeType: 'PRODUCT_MEMBER',
                  productPackId: eligibleCampaign.productPackVersion.productPackId,
                  memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
                },
                { scopeType: 'CAMPAIGN', campaignId: eligibleCampaign.id },
                {
                  scopeType: 'CAMPAIGN_MEMBER',
                  campaignId: eligibleCampaign.id,
                  memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
                },
              ],
            },
            include: { system: true, allowedDomain: true, memberIdentity: true },
          });
          const selected = selectExternalTrackingLink({
            groupId: eligibleCampaign.groupId,
            groupMembershipId: membership.id,
            productPackId: eligibleCampaign.productPackVersion.productPackId,
            campaignId: eligibleCampaign.id,
            at: linkAt,
            links: candidates.map((link) => ({
              id: link.id,
              name: link.name,
              groupId: link.groupId,
              scopeType: link.scopeType,
              groupMembershipId: link.memberIdentity?.groupMembershipId ?? null,
              productPackId: link.productPackId,
              campaignId: link.campaignId,
              url: link.url,
              status: link.status,
              startsAt: link.startsAt,
              expiresAt: link.expiresAt,
              systemStatus: link.system.status,
              domain: {
                id: link.allowedDomain.id,
                hostname: link.allowedDomain.hostname,
                allowSubdomains: link.allowedDomain.allowSubdomains,
                shortener: link.allowedDomain.shortener,
                status: link.allowedDomain.status,
              },
            })),
          });
          if (
            !selected ||
            selected.id !== input.externalLinkUsage.externalTrackingLinkId ||
            selected.url !== input.externalLinkUsage.insertedUrl ||
            JSON.stringify(input.content).split(selected.url).length - 1 !== 1
          )
            return null;
          resolvedLink = selected;
          if (input.externalLinkUsage.placementTemplateId) {
            placementTemplate = await tx.externalLinkPlacementTemplate.findFirst({
              where: {
                id: input.externalLinkUsage.placementTemplateId,
                workspaceId: input.workspaceId,
                groupId: eligibleCampaign.groupId,
                productPackVersionId: eligibleCampaign.productPackVersion.id,
                platform: socialProfile.platform,
                format: input.format,
                status: 'ACTIVE',
                urlLocked: true,
                version: input.externalLinkUsage.placementTemplateVersion ?? -1,
              },
              select: { id: true, version: true },
            });
            if (!placementTemplate) return null;
          } else if (input.externalLinkUsage.placementTemplateVersion !== null) return null;
        } else if (eligibleCampaign && !eligibleCampaign.productPackVersion.allowLinklessPosts) {
          return null;
        }
        const created = await tx.dailyMission.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            socialProfileId: input.socialProfileId ?? null,
            weeklyPlanItemId: input.weeklyPlanItemId ?? null,
            campaignId: input.campaignId ?? null,
            classification: input.classification ?? 'ORGANIC',
            missionDate: new Date(`${input.missionDate}T00:00:00Z`),
            format: input.format,
            assistanceLevel: input.assistanceLevel ?? 'READY_TO_USE',
            estimatedMinutes: input.estimatedMinutes,
            topic: input.topic,
            angle: input.angle,
            reason: input.reason,
            qualityScore: input.qualityScore ?? null,
          },
        });
        await tx.missionContent.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: created.id,
            format: input.format,
            contentJson: input.content as Prisma.InputJsonValue,
          },
        });
        await tx.missionDecision.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: created.id,
          },
        });
        if (input.externalLinkUsage && eligibleCampaign && resolvedLink && groupMembershipId) {
          await tx.contentLinkUsage.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              dailyMissionId: created.id,
              groupId: eligibleCampaign.groupId,
              groupMembershipId,
              userId: input.actorUserId,
              productPackId: eligibleCampaign.productPackVersion.productPackId,
              productPackVersionId: eligibleCampaign.productPackVersion.id,
              campaignId: eligibleCampaign.id,
              externalTrackingLinkId: resolvedLink.id,
              placementTemplateId: placementTemplate?.id ?? null,
              insertedUrlSnapshot: resolvedLink.url,
              linkNameSnapshot: resolvedLink.name,
              expiresAtSnapshot: resolvedLink.expiresAt,
              placementTemplateVersion: placementTemplate?.version ?? null,
              advertisingClassification: input.classification ?? 'ORGANIC',
            },
          });
        }
        if (eligibleCampaign) {
          const approvalPolicy = await tx.campaignPostingApprovalPolicy.findUnique({
            where: { groupId: eligibleCampaign.groupId },
            select: { required: true },
          });
          if (approvalPolicy?.required) {
            const approvalRequest = await tx.campaignPostingApprovalRequest.create({
              data: {
                workspaceId: input.workspaceId,
                groupId: eligibleCampaign.groupId,
                campaignId: eligibleCampaign.id,
                bunshinId: input.bunshinId,
                dailyMissionId: created.id,
                contentSnapshot: input.content as Prisma.InputJsonValue,
                requestedByUserId: input.actorUserId,
              },
            });
            await tx.campaignPostingApprovalAudit.create({
              data: {
                workspaceId: input.workspaceId,
                groupId: eligibleCampaign.groupId,
                requestId: approvalRequest.id,
                action: 'REQUESTED',
                afterData: { status: approvalRequest.status },
                performedByUserId: input.actorUserId,
              },
            });
          }
        }
        if (trendCandidate) {
          const evidence = trendCandidate.evidenceLinks
            .map(({ evidence }) => evidence)
            .sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl));
          await tx.missionTrendContext.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              dailyMissionId: created.id,
              candidateId: trendCandidate.id,
              snapshot: {
                candidate: {
                  topic: trendCandidate.topic,
                  hook: trendCandidate.hook,
                  whyNow: trendCandidate.whyNow,
                  fitReason: trendCandidate.fitReason,
                  platform: trendCandidate.platform,
                  format: trendCandidate.suggestedFormat,
                  freshnessScore: trendCandidate.freshnessScore,
                  fitScore: trendCandidate.fitScore,
                  feasibilityScore: trendCandidate.feasibilityScore,
                },
                evidence: evidence.map((item) => ({
                  sourceType: item.sourceType,
                  sourceUrl: item.sourceUrl,
                  sourceTitle: item.sourceTitle,
                  publishedAt: item.publishedAt?.toISOString() ?? null,
                  retrievedAt: item.retrievedAt.toISOString(),
                  summary: item.summary,
                })),
              },
            },
          });
          await tx.trendIdeaCandidate.update({
            where: { id: trendCandidate.id },
            data: { status: 'SELECTED' },
          });
        }
        if (input.generationContext) {
          await tx.generationContextSnapshot.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              dailyMissionId: created.id,
              schemaVersion: GENERATION_CONTEXT_SNAPSHOT_SCHEMA_VERSION,
              payload: input.generationContext.payload as unknown as Prisma.InputJsonValue,
              generatedAt: input.generationContext.generatedAt,
            },
          });
        }
        return dailyMission((await this.row(tx, { ...input, dailyMissionId: created.id }))!);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'daily mission already exists', error);
      throw error;
    }
  }
  async list(input: Parameters<DailyMissionRepository['list']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    return (
      await this.client.dailyMission.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          ...(input.from || input.to
            ? {
                missionDate: {
                  ...(input.from ? { gte: new Date(`${input.from}T00:00:00Z`) } : {}),
                  ...(input.to ? { lte: new Date(`${input.to}T00:00:00Z`) } : {}),
                },
              }
            : {}),
        },
        include: this.include,
        orderBy: [{ missionDate: 'desc' }, { id: 'desc' }],
      })
    ).map(dailyMission);
  }
  async find(input: Parameters<DailyMissionRepository['find']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const value = await this.row(this.client, input);
    return value ? dailyMission(value) : null;
  }
  async authorizeCopy(input: Parameters<DailyMissionRepository['authorizeCopy']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const mission = await this.row(this.client, input);
    if (!mission) return null;
    const approval = await this.client.campaignPostingApprovalRequest.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
      },
      select: { status: true, reviewNote: true },
    });
    if (approval?.status === 'PENDING')
      return { allowed: false, reason: 'APPROVAL_PENDING' as const };
    if (approval?.status === 'CHANGES_REQUESTED')
      return {
        allowed: false,
        reason: 'APPROVAL_CHANGES_REQUESTED' as const,
        reviewNote: approval.reviewNote,
      };
    const usage = mission.contentLinkUsage;
    if (!usage) return { allowed: true, reason: 'READY' } as const;
    if (!mission.content) return { allowed: false, reason: 'LINK_UNAVAILABLE' } as const;
    const membership = await this.client.groupMembership.findFirst({
      where: {
        id: usage.groupMembershipId,
        groupId: usage.groupId,
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
      },
      select: { id: true },
    });
    if (!membership) return { allowed: false, reason: 'LINK_UNAVAILABLE' } as const;
    const candidates = await this.client.externalTrackingLink.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: usage.groupId,
        status: 'ACTIVE',
        deletedAt: null,
        system: { status: 'ACTIVE' },
        allowedDomain: { status: 'ACTIVE' },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: input.at } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: input.at } }] },
        ],
        OR: [
          { scopeType: 'GROUP' },
          { scopeType: 'MEMBER', memberIdentity: { groupMembershipId: membership.id } },
          { scopeType: 'PRODUCT', productPackId: usage.productPackId },
          {
            scopeType: 'PRODUCT_MEMBER',
            productPackId: usage.productPackId,
            memberIdentity: { groupMembershipId: membership.id },
          },
          ...(usage.campaignId
            ? [
                { scopeType: 'CAMPAIGN' as const, campaignId: usage.campaignId },
                {
                  scopeType: 'CAMPAIGN_MEMBER' as const,
                  campaignId: usage.campaignId,
                  memberIdentity: { groupMembershipId: membership.id },
                },
              ]
            : []),
        ],
      },
      include: { system: true, allowedDomain: true, memberIdentity: true },
    });
    const selected = selectExternalTrackingLink({
      groupId: usage.groupId,
      groupMembershipId: membership.id,
      productPackId: usage.productPackId,
      campaignId: usage.campaignId,
      at: input.at,
      links: candidates.map((link) => ({
        id: link.id,
        name: link.name,
        groupId: link.groupId,
        scopeType: link.scopeType,
        groupMembershipId: link.memberIdentity?.groupMembershipId ?? null,
        productPackId: link.productPackId,
        campaignId: link.campaignId,
        url: link.url,
        status: link.status,
        startsAt: link.startsAt,
        expiresAt: link.expiresAt,
        systemStatus: link.system.status,
        domain: {
          id: link.allowedDomain.id,
          hostname: link.allowedDomain.hostname,
          allowSubdomains: link.allowedDomain.allowSubdomains,
          shortener: link.allowedDomain.shortener,
          status: link.allowedDomain.status,
        },
      })),
    });
    if (!selected) return { allowed: false, reason: 'LINK_UNAVAILABLE' } as const;
    const snapshotCount =
      JSON.stringify(mission.content.contentJson).split(usage.insertedUrlSnapshot).length - 1;
    if (
      selected.id !== usage.externalTrackingLinkId ||
      selected.url !== usage.insertedUrlSnapshot ||
      snapshotCount !== 1
    )
      return { allowed: false, reason: 'LINK_CHANGED' } as const;
    return { allowed: true, reason: 'READY' } as const;
  }
  async transition(input: Parameters<DailyMissionRepository['transition']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const row = await this.row(tx, input);
      if (!row) return null;
      if (row.status === input.status) return dailyMission(row);
      const allowed: Record<DailyMissionStatus, DailyMissionStatus[]> = {
        GENERATED: ['VIEWED', 'STARTED', 'COMPLETED', 'SKIPPED', 'EXPIRED'],
        VIEWED: ['STARTED', 'COMPLETED', 'SKIPPED', 'EXPIRED'],
        STARTED: ['COMPLETED', 'SKIPPED', 'EXPIRED'],
        COMPLETED: [],
        SKIPPED: [],
        EXPIRED: [],
      };
      if (!allowed[row.status].includes(input.status))
        throw new ApplicationError('CONFLICT', 'invalid mission transition');
      const now = new Date();
      return dailyMission(
        await tx.dailyMission.update({
          where: { id: row.id },
          data: {
            status: input.status,
            ...(input.status === 'VIEWED' ? { viewedAt: now } : {}),
            ...(input.status === 'STARTED' ? { startedAt: now } : {}),
            ...(input.status === 'COMPLETED' ? { completedAt: now } : {}),
            ...(input.status === 'SKIPPED' ? { skippedAt: now } : {}),
            ...(input.status === 'EXPIRED' ? { expiredAt: now } : {}),
          },
          include: this.include,
        }),
      );
    });
  }
}

export class PrismaLineMissionNotificationSummaryRepository implements LineMissionNotificationSummaryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async resolve(input: Parameters<LineMissionNotificationSummaryRepository['resolve']>[0]) {
    const mission = await this.client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        bunshin: {
          status: { not: 'ARCHIVED' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
        },
        socialProfile: { is: { status: 'ACTIVE' } },
        OR: [
          { campaignId: null },
          {
            campaign: {
              is: {
                status: 'OPEN',
                startsAt: { lte: new Date() },
                endsAt: { gt: new Date() },
                group: {
                  status: 'ACTIVE',
                  memberships: {
                    some: {
                      userId: input.actorUserId,
                      status: 'ACTIVE',
                      consentedAt: { not: null },
                    },
                  },
                },
                participations: {
                  some: {
                    participantWorkspaceId: input.workspaceId,
                    userId: input.actorUserId,
                    bunshinId: input.bunshinId,
                    status: 'ACCEPTED',
                  },
                },
                productPackVersion: {
                  status: 'PUBLISHED',
                  assignments: {
                    some: { bunshinId: input.bunshinId, status: 'ACTIVE' },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        format: true,
        estimatedMinutes: true,
        topic: true,
        trendContext: { select: { id: true } },
        socialProfile: { select: { platform: true } },
        classification: true,
        campaign: { select: { name: true } },
        contentLinkUsage: { select: { id: true } },
      },
    });
    if (!mission?.socialProfile) return null;
    return {
      platform: mission.socialProfile.platform,
      format: mission.format,
      estimatedMinutes: mission.estimatedMinutes,
      topic: mission.topic,
      researched: mission.trendContext !== null,
      ...(mission.contentLinkUsage ? { externalLinkIncluded: true } : {}),
      ...(mission.campaign && mission.classification !== 'ORGANIC'
        ? { campaign: { name: mission.campaign.name, classification: mission.classification } }
        : {}),
    };
  }
}

export class PrismaDailyMissionGenerationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async claim(input: {
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    missionDate: string;
    idempotencyKey: string;
  }) {
    const authorized = await this.client.bunshin.findFirst({
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
    if (!authorized) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    const missionDate = new Date(`${input.missionDate}T00:00:00.000Z`);
    try {
      return {
        record: await this.client.dailyMissionGeneration.create({
          data: { ...input, missionDate, status: 'PENDING' },
        }),
        acquired: true,
      };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.client.dailyMissionGeneration.findFirst({
        where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId, missionDate },
      });
      if (!existing) throw error;
      if (existing.actorUserId !== input.actorUserId)
        throw new ApplicationError('CONFLICT', 'daily mission generation already claimed');
      if (existing.status === 'FAILED') {
        return {
          record: await this.client.dailyMissionGeneration.update({
            where: { id: existing.id },
            data: { status: 'PENDING', idempotencyKey: input.idempotencyKey, errorCategory: null },
          }),
          acquired: true,
        };
      }
      if (existing.idempotencyKey !== input.idempotencyKey)
        throw new ApplicationError('CONFLICT', 'daily mission generation already claimed');
      return { record: existing, acquired: false };
    }
  }

  async complete(input: {
    id: string;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    dailyMissionId: string;
  }) {
    const result = await this.client.dailyMissionGeneration.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
      },
      data: { status: 'COMPLETED', dailyMissionId: input.dailyMissionId, errorCategory: null },
    });
    if (result.count !== 1) throw new ApplicationError('NOT_FOUND', 'generation not found');
  }

  async fail(input: {
    id: string;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    errorCategory: string;
  }) {
    const result = await this.client.dailyMissionGeneration.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
      },
      data: { status: 'FAILED', errorCategory: input.errorCategory },
    });
    if (result.count !== 1) throw new ApplicationError('NOT_FOUND', 'generation not found');
  }
}

function generationContextSnapshot(
  row: Prisma.GenerationContextSnapshotGetPayload<object>,
): GenerationContextSnapshot {
  if (row.schemaVersion !== 1) {
    throw new ApplicationError('INTERNAL_ERROR', 'unsupported generation context schema version');
  }
  return {
    ...row,
    schemaVersion: 1,
    payload: row.payload as unknown as GenerationContextSnapshotPayload,
  };
}

export class PrismaGenerationContextSnapshotRepository implements GenerationContextSnapshotRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async authorizedMission(
    input: Parameters<GenerationContextSnapshotRepository['find']>[0],
  ) {
    const mission = await this.client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        bunshin: {
          status: { not: 'ARCHIVED' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
        },
      },
      select: {
        id: true,
        bunshin: {
          select: {
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
        },
      },
    });
    const role = mission?.bunshin.workspace.memberships[0]?.role;
    return mission && role && canManageBunshin(role, input.actorUserId, mission.bunshin.ownerUserId)
      ? mission
      : null;
  }

  async create(input: Parameters<GenerationContextSnapshotRepository['create']>[0]) {
    const mission = await this.authorizedMission(input);
    if (!mission) return null;
    try {
      const row = await this.client.generationContextSnapshot.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          schemaVersion: input.schemaVersion,
          payload: input.payload as unknown as Prisma.InputJsonValue,
          generatedAt: input.generatedAt,
        },
      });
      return generationContextSnapshot(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApplicationError('CONFLICT', 'generation context already exists');
      }
      throw error;
    }
  }

  async find(input: Parameters<GenerationContextSnapshotRepository['find']>[0]) {
    if (!(await this.authorizedMission(input))) return null;
    const row = await this.client.generationContextSnapshot.findFirst({
      where: {
        dailyMissionId: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
    });
    return row ? generationContextSnapshot(row) : null;
  }
}

function missionDecision(row: Prisma.MissionDecisionGetPayload<object>): MissionDecision {
  return row;
}
function missionActivity(row: Prisma.MissionActivityGetPayload<object>): MissionActivity {
  return {
    ...row,
    metadata: row.metadata as Record<string, unknown> | null,
  };
}
export class PrismaMissionEngagementRepository implements MissionEngagementRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private async authorized(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
    manage: boolean,
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
    if (!bunshin) return null;
    const role = bunshin.workspace.memberships[0]?.role;
    return !manage || (role && canManageBunshin(role, input.actorUserId, bunshin.ownerUserId))
      ? bunshin
      : null;
  }
  private mission(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; dailyMissionId: string },
  ) {
    return client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
    });
  }
  private existingActivity(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      bunshinId: string;
      actorUserId: string;
      idempotencyKey: string;
    },
  ) {
    return client.missionActivity.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }
  private assertSameEvent(
    value: Prisma.MissionActivityGetPayload<object>,
    input: { dailyMissionId: string; type: string; metadata?: Record<string, unknown> | null },
  ) {
    const metadata = (value.metadata ?? null) as Record<string, unknown> | null;
    if (
      value.dailyMissionId !== input.dailyMissionId ||
      value.type !== input.type ||
      JSON.stringify(metadata) !== JSON.stringify(input.metadata ?? null)
    )
      throw new ApplicationError('CONFLICT', 'idempotency key was already used');
    return missionActivity(value);
  }
  async getDecision(input: Parameters<MissionEngagementRepository['getDecision']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const value = await this.client.missionDecision.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
      },
    });
    return value ? missionDecision(value) : null;
  }
  async decide(input: Parameters<MissionEngagementRepository['decide']>[0]) {
    const type = input.decision;
    const operation = async () =>
      this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        if (!(await this.mission(tx, input))) return null;
        const existing = await this.existingActivity(tx, input);
        if (existing) {
          const activity = this.assertSameEvent(existing, { ...input, type, metadata: null });
          const decision = await tx.missionDecision.findUniqueOrThrow({
            where: { dailyMissionId: input.dailyMissionId },
          });
          return { decision: missionDecision(decision), activity };
        }
        const now = new Date();
        const decision = await tx.missionDecision.update({
          where: { dailyMissionId: input.dailyMissionId },
          data: {
            decision: input.decision,
            rejectionReason: input.rejectionReason,
            rejectionDetail: input.rejectionDetail,
            decidedAt: now,
          },
        });
        const activity = await tx.missionActivity.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
            actorUserId: input.actorUserId,
            type,
            occurredAt: now,
            idempotencyKey: input.idempotencyKey,
            metadata: Prisma.JsonNull,
          },
        });
        return { decision: missionDecision(decision), activity: missionActivity(activity) };
      });
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.existingActivity(this.client, input);
      if (!existing) throw error;
      const activity = this.assertSameEvent(existing, { ...input, type, metadata: null });
      const decision = await this.client.missionDecision.findUniqueOrThrow({
        where: { dailyMissionId: input.dailyMissionId },
      });
      return { decision: missionDecision(decision), activity };
    }
  }
  async listActivities(input: Parameters<MissionEngagementRepository['listActivities']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    if (!(await this.mission(this.client, input))) return null;
    return (
      await this.client.missionActivity.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
        },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      })
    ).map(missionActivity);
  }
  async appendActivity(input: Parameters<MissionEngagementRepository['appendActivity']>[0]) {
    const operation = async () =>
      this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        if (!(await this.mission(tx, input))) return null;
        const existing = await this.existingActivity(tx, input);
        if (existing) return this.assertSameEvent(existing, input);
        return missionActivity(
          await tx.missionActivity.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              dailyMissionId: input.dailyMissionId,
              actorUserId: input.actorUserId,
              type: input.type,
              idempotencyKey: input.idempotencyKey,
              metadata:
                input.metadata === null
                  ? Prisma.JsonNull
                  : (input.metadata as Prisma.InputJsonValue),
            },
          }),
        );
      });
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.existingActivity(this.client, input);
      if (!existing) throw error;
      return this.assertSameEvent(existing, input);
    }
  }
  async listProgressDays(input: Parameters<MissionEngagementRepository['listProgressDays']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    return (
      await this.client.dailyMission.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          missionDate: {
            ...(input.from === null ? {} : { gte: new Date(`${input.from}T00:00:00.000Z`) }),
            lte: new Date(`${input.to}T00:00:00.000Z`),
          },
          OR: [
            { campaignId: null },
            {
              campaign: {
                group: {
                  status: 'ACTIVE',
                  memberships: {
                    some: { userId: input.actorUserId, status: 'ACTIVE' },
                  },
                },
                participations: {
                  some: {
                    participantWorkspaceId: input.workspaceId,
                    userId: input.actorUserId,
                    bunshinId: input.bunshinId,
                    status: 'ACCEPTED',
                  },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          missionDate: true,
          activities: {
            where: { actorUserId: input.actorUserId },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy: [{ missionDate: 'asc' }, { id: 'asc' }],
      })
    ).map((value) => ({
      dailyMissionId: value.id,
      missionDate: value.missionDate.toISOString().slice(0, 10),
      activities: value.activities.map(missionActivity),
    }));
  }
}

function achievementBadge(row: Prisma.AchievementBadgeGetPayload<object>): AchievementBadge {
  return row;
}

export class PrismaAchievementBadgeRepository implements AchievementBadgeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async authorized(input: { workspaceId: string; userId: string; bunshinId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.userId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }

  async list(input: Parameters<AchievementBadgeRepository['list']>[0]) {
    if (!(await this.authorized(input))) return null;
    return (
      await this.client.achievementBadge.findMany({
        where: input,
        orderBy: [{ awardedAt: 'asc' }, { id: 'asc' }],
      })
    ).map(achievementBadge);
  }

  async award(input: Parameters<AchievementBadgeRepository['award']>[0]) {
    if (!(await this.authorized(input))) return null;
    return achievementBadge(
      await this.client.achievementBadge.upsert({
        where: {
          workspaceId_userId_bunshinId_featureKey_badgeKey_ruleVersion: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            bunshinId: input.bunshinId,
            featureKey: input.featureKey,
            badgeKey: input.badgeKey,
            ruleVersion: input.ruleVersion,
          },
        },
        create: input,
        update: {},
      }),
    );
  }
}

function postRecord(row: Prisma.PostRecordGetPayload<object>): PostRecord {
  return { ...row, manualMetrics: row.manualMetrics as Record<string, unknown> | null };
}
function missionFeedback(row: Prisma.MissionFeedbackGetPayload<object>): MissionFeedback {
  return row;
}
export class PrismaMissionOutcomeRepository implements MissionOutcomeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private async authorized(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
    manage: boolean,
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
    if (!bunshin) return null;
    const role = bunshin.workspace.memberships[0]?.role;
    return !manage || (role && canManageBunshin(role, input.actorUserId, bunshin.ownerUserId))
      ? bunshin
      : null;
  }
  private mission(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; dailyMissionId: string },
  ) {
    return client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
      include: { decision: true, socialProfile: { select: { platform: true } } },
    });
  }
  private activityByKey(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; actorUserId: string; idempotencyKey: string },
  ) {
    return client.missionActivity.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }
  async getPost(input: Parameters<MissionOutcomeRepository['getPost']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const value = await this.client.postRecord.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
      },
    });
    return value ? postRecord(value) : null;
  }
  async recordPost(input: Parameters<MissionOutcomeRepository['recordPost']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const mission = await this.mission(tx, input);
      if (!mission) return null;
      if (mission.decision?.decision !== 'ACCEPTED')
        throw new ApplicationError('CONFLICT', 'mission must be accepted before posting');
      if (mission.socialProfile && mission.socialProfile.platform !== input.platform)
        throw new ApplicationError('VALIDATION_ERROR', 'platform does not match mission profile');
      const existing = await tx.postRecord.findUnique({
        where: { dailyMissionId: input.dailyMissionId },
      });
      if (existing) {
        if (existing.platform !== input.platform || existing.postUrl !== input.postUrl)
          throw new ApplicationError('CONFLICT', 'post record already exists');
        const activity = await tx.missionActivity.findFirstOrThrow({
          where: { dailyMissionId: input.dailyMissionId, type: 'POSTED' },
          orderBy: { occurredAt: 'asc' },
        });
        return { post: postRecord(existing), activity: missionActivity(activity) };
      }
      const collision = await this.activityByKey(tx, input);
      if (collision) throw new ApplicationError('CONFLICT', 'idempotency key was already used');
      const post = await tx.postRecord.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          platform: input.platform,
          postedAt: input.postedAt,
          postUrl: input.postUrl,
          externalPostId: null,
          source: 'MANUAL',
          manualMetrics: Prisma.JsonNull,
          idempotencyKey: input.idempotencyKey,
        },
      });
      const activity = await tx.missionActivity.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          type: 'POSTED',
          occurredAt: input.postedAt,
          idempotencyKey: input.idempotencyKey,
          metadata: Prisma.JsonNull,
        },
      });
      return { post: postRecord(post), activity: missionActivity(activity) };
    });
  }
  async getFeedback(input: Parameters<MissionOutcomeRepository['getFeedback']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const value = await this.client.missionFeedback.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
      },
    });
    return value ? missionFeedback(value) : null;
  }
  async recordFeedback(input: Parameters<MissionOutcomeRepository['recordFeedback']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      if (
        !(await tx.postRecord.findFirst({
          where: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
          },
        }))
      )
        return null;
      const type = `FEEDBACK_${input.rating}` as const;
      const existingActivity = await this.activityByKey(tx, input);
      if (existingActivity) {
        if (
          existingActivity.dailyMissionId !== input.dailyMissionId ||
          existingActivity.type !== type
        )
          throw new ApplicationError('CONFLICT', 'idempotency key was already used');
        const feedback = await tx.missionFeedback.findUniqueOrThrow({
          where: { dailyMissionId: input.dailyMissionId },
        });
        return { feedback: missionFeedback(feedback), activity: missionActivity(existingActivity) };
      }
      const feedback = await tx.missionFeedback.upsert({
        where: { dailyMissionId: input.dailyMissionId },
        create: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          rating: input.rating,
        },
        update: { actorUserId: input.actorUserId, rating: input.rating },
      });
      const activity = await tx.missionActivity.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          type,
          idempotencyKey: input.idempotencyKey,
          metadata: Prisma.JsonNull,
        },
      });
      return { feedback: missionFeedback(feedback), activity: missionActivity(activity) };
    });
  }
}

function workspace(row: Awaited<ReturnType<PrismaClient['workspace']['create']>>): Workspace {
  return { ...row, type: row.type, status: row.status };
}

function membership(
  row: Awaited<ReturnType<PrismaClient['workspaceMembership']['create']>>,
): WorkspaceMembership {
  return { ...row, role: row.role, status: row.status };
}

export class PrismaAccountUnitOfWork implements AccountUnitOfWork {
  constructor(private readonly client: PrismaClient = prisma) {}

  transaction<T>(operation: (transaction: AccountTransaction) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      const adapter: AccountTransaction = {
        createUser: async (input: CreateUserInput) =>
          user(
            await tx.user.create({
              data: { displayName: input.displayName, email: input.email ?? null },
            }),
          ),
        createAuthIdentity: async (input) => {
          await tx.authIdentity.create({ data: input });
        },
        createPersonalWorkspace: async (input) =>
          workspace(await tx.workspace.create({ data: { type: 'PERSONAL', name: input.name } })),
        createOwnerMembership: async (input) =>
          membership(await tx.workspaceMembership.create({ data: { ...input, role: 'OWNER' } })),
      };
      return operation(adapter);
    });
  }
}

export class PrismaCurrentUserAccountRepository implements CurrentUserAccountRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findActiveByEmailIdentity(providerUserId: string): Promise<CurrentUser | null> {
    const identity = await this.client.authIdentity.findFirst({
      where: { provider: 'EMAIL', providerUserId, user: { status: 'ACTIVE' } },
      select: { id: true, userId: true },
    });
    return identity === null ? null : { userId: identity.userId, authIdentityId: identity.id };
  }

  async emailIdentityExists(providerUserId: string): Promise<boolean> {
    return Boolean(
      await this.client.authIdentity.findFirst({
        where: { provider: 'EMAIL', providerUserId },
        select: { id: true },
      }),
    );
  }

  async provisionEmailIdentity(input: VerifiedSessionUser): Promise<CurrentUser> {
    const existing = await this.findActiveByEmailIdentity(input.providerUserId);
    if (existing !== null) return existing;
    try {
      return await this.client.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            displayName: (input.displayName ?? input.email?.split('@')[0] ?? 'BUNSHIN User').slice(
              0,
              100,
            ),
            email: input.email,
          },
        });
        const identity = await tx.authIdentity.create({
          data: {
            userId: createdUser.id,
            provider: 'EMAIL',
            providerUserId: input.providerUserId,
          },
        });
        const workspace = await tx.workspace.create({
          data: { type: 'PERSONAL', name: `${createdUser.displayName}のワークスペース` },
        });
        await tx.workspaceMembership.create({
          data: { workspaceId: workspace.id, userId: createdUser.id, role: 'OWNER' },
        });
        return { userId: createdUser.id, authIdentityId: identity.id };
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const raced = await this.findActiveByEmailIdentity(input.providerUserId);
        if (raced !== null) return raced;
      }
      throw error;
    }
  }
}

export async function listActiveWorkspacesForUser(
  userId: string,
  client: PrismaClient = prisma,
): Promise<Array<{ id: string; name: string }>> {
  return client.workspace.findMany({
    where: {
      status: 'ACTIVE',
      memberships: { some: { userId, status: 'ACTIVE' } },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
}

export class PrismaWorkspaceAccessRepository implements WorkspaceAccessRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findAccessibleWorkspace(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<Workspace | null> {
    const row = await this.client.workspace.findFirst({
      where: {
        id: input.workspaceId,
        status: 'ACTIVE',
        memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
      },
    });
    return row === null ? null : workspace(row);
  }

  async updateWorkspaceName(input: {
    actorUserId: string;
    workspaceId: string;
    name: string;
  }): Promise<Workspace | null> {
    const authorized = await this.client.workspace.findFirst({
      where: {
        id: input.workspaceId,
        memberships: {
          some: { userId: input.actorUserId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
        },
      },
      select: { id: true },
    });
    if (authorized === null) return null;
    return workspace(
      await this.client.workspace.update({
        where: { id: authorized.id },
        data: { name: input.name },
      }),
    );
  }
}

export class PrismaPlatformAdminRepository implements PlatformAdminRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async findActivePlatformAdminByUserId(userId: string): Promise<PlatformAdmin | null> {
    const row = await this.client.platformAdmin.findFirst({ where: { userId, status: 'ACTIVE' } });
    return row === null ? null : { ...row, role: row.role, status: row.status };
  }

  async listForManagement(actorUserId: string) {
    const actor = await this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
      select: { role: true },
    });
    if (!actor) return null;
    const [admins, audits] = await Promise.all([
      this.client.platformAdmin.findMany({
        include: { user: { select: { displayName: true, email: true } } },
        orderBy: [{ status: 'asc' }, { grantedAt: 'asc' }],
      }),
      this.client.platformAdminAudit.findMany({
        include: {
          target: { select: { displayName: true, email: true } },
          actor: { select: { displayName: true, email: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      }),
    ]);
    return { actorRole: actor.role, admins, audits };
  }

  async grantOrUpdate(input: {
    actorUserId: string;
    email: string;
    role: 'SUPER_ADMIN' | 'OPERATOR' | 'SUPPORT';
    reason: string;
  }): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const actor = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
      });
      if (!actor) throw new ApplicationError('FORBIDDEN', 'super admin required');
      const target = await tx.user.findFirst({
        where: { email: { equals: input.email, mode: 'insensitive' }, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!target) throw new ApplicationError('NOT_FOUND', 'active user not found');
      const current = await tx.platformAdmin.findUnique({ where: { userId: target.id } });
      if (
        current?.status === 'ACTIVE' &&
        current.role === 'SUPER_ADMIN' &&
        input.role !== 'SUPER_ADMIN'
      ) {
        const superAdminCount = await tx.platformAdmin.count({
          where: { status: 'ACTIVE', role: 'SUPER_ADMIN' },
        });
        if (superAdminCount <= 1)
          throw new ApplicationError('CONFLICT', 'last super admin cannot be demoted');
      }
      const action = current
        ? current.status === 'REVOKED'
          ? 'REACTIVATED'
          : 'ROLE_CHANGED'
        : 'GRANTED';
      await tx.platformAdmin.upsert({
        where: { userId: target.id },
        create: { userId: target.id, role: input.role, status: 'ACTIVE' },
        update: { role: input.role, status: 'ACTIVE', revokedAt: null },
      });
      await tx.platformAdminAudit.create({
        data: {
          targetUserId: target.id,
          actorUserId: input.actorUserId,
          action,
          previousRole: current?.role ?? null,
          nextRole: input.role,
          previousStatus: current?.status ?? null,
          nextStatus: 'ACTIVE',
          reason: input.reason,
        },
      });
    });
  }

  async revoke(input: { actorUserId: string; adminId: string; reason: string }): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const actor = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
      });
      if (!actor) throw new ApplicationError('FORBIDDEN', 'super admin required');
      const target = await tx.platformAdmin.findUnique({ where: { id: input.adminId } });
      if (!target || target.status !== 'ACTIVE')
        throw new ApplicationError('NOT_FOUND', 'active admin not found');
      if (target.userId === input.actorUserId)
        throw new ApplicationError('CONFLICT', 'self revocation is not allowed');
      if (target.role === 'SUPER_ADMIN') {
        const count = await tx.platformAdmin.count({
          where: { status: 'ACTIVE', role: 'SUPER_ADMIN' },
        });
        if (count <= 1)
          throw new ApplicationError('CONFLICT', 'last super admin cannot be revoked');
      }
      await tx.platformAdmin.update({
        where: { id: target.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await tx.platformAdminAudit.create({
        data: {
          targetUserId: target.userId,
          actorUserId: input.actorUserId,
          action: 'REVOKED',
          previousRole: target.role,
          nextRole: target.role,
          previousStatus: target.status,
          nextStatus: 'REVOKED',
          reason: input.reason,
        },
      });
    });
  }
}

function legalDocument(row: Prisma.LegalDocumentGetPayload<object>): LegalDocument {
  return { ...row, type: row.type, status: row.status };
}

export class PrismaLegalDocumentRepository implements LegalDocumentRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listForAdmin(actorUserId: string): Promise<LegalDocument[] | null> {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    return (
      await this.client.legalDocument.findMany({
        orderBy: [{ type: 'asc' }, { version: 'desc' }],
      })
    ).map(legalDocument);
  }

  async createDraft(input: {
    actorUserId: string;
    type: LegalDocumentType;
    title: string;
    content: string;
  }): Promise<LegalDocument | null> {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
        },
        select: { id: true },
      });
      if (!admin) return null;
      const latest = await tx.legalDocument.findFirst({
        where: { type: input.type },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      return legalDocument(
        await tx.legalDocument.create({
          data: {
            type: input.type,
            version: (latest?.version ?? 0) + 1,
            title: input.title,
            content: input.content,
            createdByUserId: input.actorUserId,
          },
        }),
      );
    });
  }

  async publish(input: {
    actorUserId: string;
    documentId: string;
    effectiveAt: Date;
  }): Promise<LegalDocument | null> {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
        },
        select: { id: true },
      });
      if (!admin) return null;
      const target = await tx.legalDocument.findFirst({
        where: { id: input.documentId, status: 'DRAFT' },
      });
      if (!target) return null;
      const now = new Date();
      await tx.legalDocument.updateMany({
        where: { type: target.type, status: 'PUBLISHED' },
        data: { status: 'RETIRED' },
      });
      return legalDocument(
        await tx.legalDocument.update({
          where: { id: target.id },
          data: { status: 'PUBLISHED', effectiveAt: input.effectiveAt, publishedAt: now },
        }),
      );
    });
  }

  async findPublished(type: LegalDocumentType): Promise<LegalDocument | null> {
    const row = await this.client.legalDocument.findFirst({
      where: { type, status: 'PUBLISHED', effectiveAt: { lte: new Date() } },
      orderBy: { version: 'desc' },
    });
    return row ? legalDocument(row) : null;
  }
}

export class PrismaLegalConsentRepository implements LegalConsentRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findRequiredForUser(userId: string): Promise<RequiredLegalConsentDocument[]> {
    const rows = await this.client.legalDocument.findMany({
      where: { status: 'PUBLISHED', effectiveAt: { lte: new Date() } },
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
      distinct: ['type'],
      include: { consents: { where: { userId }, select: { consentedAt: true }, take: 1 } },
    });
    return rows.map(({ consents, ...row }) => ({
      ...legalDocument(row),
      consentedAt: consents[0]?.consentedAt ?? null,
    }));
  }

  async acceptRequired(input: { userId: string; documentIds: string[] }): Promise<boolean> {
    return this.client.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: input.userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!user) return false;
      const current = await tx.legalDocument.findMany({
        where: { status: 'PUBLISHED', effectiveAt: { lte: new Date() } },
        orderBy: [{ type: 'asc' }, { version: 'desc' }],
        distinct: ['type'],
        select: { id: true },
      });
      const requiredIds = current.map((item) => item.id).sort();
      if (
        requiredIds.length !== input.documentIds.length ||
        requiredIds.some((id, index) => id !== [...input.documentIds].sort()[index])
      )
        return false;
      await Promise.all(
        requiredIds.map((legalDocumentId) =>
          tx.userLegalConsent.upsert({
            where: { userId_legalDocumentId: { userId: input.userId, legalDocumentId } },
            create: { userId: input.userId, legalDocumentId },
            update: {},
          }),
        ),
      );
      return true;
    });
  }

  async listConsentCountsForAdmin(actorUserId: string) {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    const rows = await this.client.legalDocument.findMany({
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
      include: { _count: { select: { consents: true } } },
    });
    return rows.map(({ _count, ...row }) => ({
      ...legalDocument(row),
      consentCount: _count.consents,
    }));
  }
}

function accountDeletionRequest(
  row: Prisma.AccountDeletionRequestGetPayload<object>,
): AccountDeletionRequest {
  return { ...row, status: row.status };
}

export class PrismaAccountDeletionRequestRepository implements AccountDeletionRequestRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async findCurrent(userId: string) {
    const row = await this.client.accountDeletionRequest.findFirst({
      where: { userId, status: { in: ['REQUESTED', 'PROCESSING', 'BLOCKED'] } },
      orderBy: { requestedAt: 'desc' },
    });
    return row ? accountDeletionRequest(row) : null;
  }
  async request(userId: string, scheduledFor: Date) {
    return this.client.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (
        !user ||
        (await tx.accountDeletionRequest.findFirst({
          where: { userId, status: { in: ['REQUESTED', 'PROCESSING', 'BLOCKED'] } },
          select: { id: true },
        }))
      )
        return null;
      return accountDeletionRequest(
        await tx.accountDeletionRequest.create({ data: { userId, scheduledFor } }),
      );
    });
  }
  async cancel(userId: string) {
    return this.client.$transaction(async (tx) => {
      const current = await tx.accountDeletionRequest.findFirst({
        where: { userId, status: 'REQUESTED' },
        orderBy: { requestedAt: 'desc' },
      });
      if (!current) return null;
      return accountDeletionRequest(
        await tx.accountDeletionRequest.update({
          where: { id: current.id },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        }),
      );
    });
  }
  async listForAdmin(actorUserId: string) {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    return (
      await this.client.accountDeletionRequest.findMany({ orderBy: { requestedAt: 'desc' } })
    ).map(accountDeletionRequest);
  }
}

export class PrismaAccountDeletionExecutionRepository implements AccountDeletionExecutionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async claimAndSuspendNext(
    input: Parameters<AccountDeletionExecutionRepository['claimAndSuspendNext']>[0],
  ) {
    return this.client.$transaction(async (tx) => {
      const candidate = await tx.accountDeletionRequest.findFirst({
        where: {
          OR: [
            { status: 'REQUESTED', scheduledFor: { lte: input.now } },
            { status: 'PROCESSING', leaseExpiresAt: { lte: input.now } },
          ],
        },
        orderBy: [{ scheduledFor: 'asc' }, { requestedAt: 'asc' }],
        select: { id: true, userId: true, status: true },
      });
      if (!candidate) return null;
      const claimed = await tx.accountDeletionRequest.updateMany({
        where: {
          id: candidate.id,
          ...(candidate.status === 'REQUESTED'
            ? { status: 'REQUESTED' as const, scheduledFor: { lte: input.now } }
            : {
                status: 'PROCESSING' as const,
                leaseExpiresAt: { lte: input.now },
              }),
        },
        data: {
          status: 'PROCESSING',
          leaseOwner: input.workerId,
          leaseExpiresAt: input.leaseExpiresAt,
          processingStartedAt: input.now,
          blockedReason: null,
          lastErrorCategory: null,
          executionVersion: input.executionVersion,
          attemptCount: { increment: 1 },
        },
      });
      if (claimed.count !== 1) return null;

      const [activeAdmin, organizationMemberships, organizationKnowledge, organizationBunshins] =
        await Promise.all([
          tx.platformAdmin.findFirst({
            where: { userId: candidate.userId, status: 'ACTIVE' },
            select: { id: true },
          }),
          tx.workspaceMembership.findMany({
            where: {
              userId: candidate.userId,
              status: 'ACTIVE',
              role: 'OWNER',
              workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
            },
            select: {
              workspaceId: true,
              workspace: {
                select: {
                  _count: {
                    select: {
                      memberships: {
                        where: { role: 'OWNER', status: 'ACTIVE' },
                      },
                    },
                  },
                },
              },
            },
          }),
          tx.ownerKnowledge.count({
            where: { ownerUserId: candidate.userId, workspace: { type: 'ORGANIZATION' } },
          }),
          tx.bunshin.count({
            where: { ownerUserId: candidate.userId, workspace: { type: 'ORGANIZATION' } },
          }),
        ]);

      const blockedReason: AccountDeletionBlockedReason | null = activeAdmin
        ? 'ACTIVE_PLATFORM_ADMIN'
        : organizationMemberships.some(({ workspace }) => workspace._count.memberships <= 1)
          ? 'SOLE_ORGANIZATION_OWNER'
          : organizationKnowledge > 0 || organizationBunshins > 0
            ? 'MANUAL_REVIEW_REQUIRED'
            : null;
      if (blockedReason) {
        const row = await tx.accountDeletionRequest.update({
          where: { id: candidate.id },
          data: {
            status: 'BLOCKED',
            blockedReason,
            leaseOwner: null,
            leaseExpiresAt: null,
            summary: { suspended: false },
          },
        });
        return {
          requestId: row.id,
          userId: row.userId,
          status: 'BLOCKED' as const,
          attemptCount: row.attemptCount,
          blockedReason,
          leaseExpiresAt: null,
        };
      }

      const user = await tx.user.findUnique({
        where: { id: candidate.userId },
        select: { status: true },
      });
      const resumableSuspension = candidate.status === 'PROCESSING' && user?.status === 'SUSPENDED';
      if (user?.status === 'ACTIVE')
        await tx.user.update({
          where: { id: candidate.userId },
          data: { status: 'SUSPENDED' },
        });
      if (user?.status !== 'ACTIVE' && !resumableSuspension) {
        const row = await tx.accountDeletionRequest.update({
          where: { id: candidate.id },
          data: {
            status: 'BLOCKED',
            blockedReason: 'MANUAL_REVIEW_REQUIRED',
            leaseOwner: null,
            leaseExpiresAt: null,
            summary: { suspended: false },
          },
        });
        return {
          requestId: row.id,
          userId: row.userId,
          status: 'BLOCKED' as const,
          attemptCount: row.attemptCount,
          blockedReason: 'MANUAL_REVIEW_REQUIRED' as const,
          leaseExpiresAt: null,
        };
      }

      const [memberships, preferences, connections, deliveries, jobs, deepLinks] =
        await Promise.all([
          tx.workspaceMembership.updateMany({
            where: { userId: candidate.userId, status: 'ACTIVE' },
            data: { status: 'SUSPENDED' },
          }),
          tx.lineNotificationPreference.updateMany({
            where: { userId: candidate.userId },
            data: { enabled: false, notificationConsentAt: null, reminderEnabled: false },
          }),
          tx.lineConnection.updateMany({
            where: { userId: candidate.userId, status: 'ACTIVE' },
            data: { status: 'DISCONNECTED', notificationConsentAt: null },
          }),
          tx.lineMessageDelivery.updateMany({
            where: {
              userId: candidate.userId,
              status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
            },
            data: {
              status: 'CANCELLED',
              cancelledAt: input.now,
              lastErrorCategory: 'ACCOUNT_DELETION_REQUESTED',
              leaseOwner: null,
              leaseExpiresAt: null,
            },
          }),
          tx.job.updateMany({
            where: {
              requestedBy: candidate.userId,
              status: { in: ['PENDING', 'LEASED', 'RETRY_SCHEDULED'] },
            },
            data: {
              status: 'CANCELLED',
              cancelledAt: input.now,
              lastErrorCategory: 'ACCOUNT_DELETION_REQUESTED',
              leaseOwner: null,
              leaseExpiresAt: null,
              nextRetryAt: null,
            },
          }),
          tx.missionDeepLinkState.updateMany({
            where: { userId: candidate.userId, consumedAt: null },
            data: { consumedAt: input.now },
          }),
        ]);
      const row = await tx.accountDeletionRequest.update({
        where: { id: candidate.id },
        data: {
          summary: {
            suspended: true,
            memberships: memberships.count,
            notificationPreferences: preferences.count,
            lineConnections: connections.count,
            deliveries: deliveries.count,
            jobs: jobs.count,
            deepLinks: deepLinks.count,
          },
        },
      });
      return {
        requestId: row.id,
        userId: row.userId,
        status: 'PROCESSING' as const,
        attemptCount: row.attemptCount,
        blockedReason: null,
        leaseExpiresAt: row.leaseExpiresAt,
      };
    });
  }
}

export class PrismaAccountDeletionPurgeRepository implements AccountDeletionPurgeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async completeAfterAuthDeletion(
    input: Parameters<AccountDeletionPurgeRepository['completeAfterAuthDeletion']>[0],
  ) {
    return this.client.$transaction(async (tx) => {
      const request = await tx.accountDeletionRequest.findFirst({
        where: {
          id: input.requestId,
          userId: input.userId,
          status: 'PROCESSING',
          leaseOwner: input.workerId,
          leaseExpiresAt: { gt: input.now },
          user: { status: 'SUSPENDED' },
        },
        select: { id: true, userId: true, summary: true },
      });
      if (!request) return null;

      const [organizationKnowledge, organizationBunshins] = await Promise.all([
        tx.ownerKnowledge.count({
          where: { ownerUserId: input.userId, workspace: { type: 'ORGANIZATION' } },
        }),
        tx.bunshin.count({
          where: { ownerUserId: input.userId, workspace: { type: 'ORGANIZATION' } },
        }),
      ]);
      if (organizationKnowledge > 0 || organizationBunshins > 0) {
        await tx.accountDeletionRequest.update({
          where: { id: request.id },
          data: {
            status: 'BLOCKED',
            blockedReason: 'MANUAL_REVIEW_REQUIRED',
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        return {
          requestId: request.id,
          userId: request.userId,
          status: 'BLOCKED' as const,
          blockedReason: 'MANUAL_REVIEW_REQUIRED' as const,
        };
      }

      const personalWorkspaces = await tx.workspaceMembership.findMany({
        where: { userId: input.userId, workspace: { type: 'PERSONAL' } },
        select: { workspaceId: true },
      });
      const workspaceIds = personalWorkspaces.map(({ workspaceId }) => workspaceId);
      const scope = { workspaceId: { in: workspaceIds } };
      const personalBunshins =
        workspaceIds.length === 0
          ? []
          : await tx.bunshin.findMany({ where: scope, select: { id: true } });
      const bunshinIds = personalBunshins.map(({ id }) => id);

      const [identities, lineConnections, linePreferences, deepLinks, posts, activities] =
        await Promise.all([
          tx.authIdentity.deleteMany({ where: { userId: input.userId } }),
          tx.lineConnection.deleteMany({ where: { userId: input.userId } }),
          tx.lineNotificationPreference.deleteMany({ where: { userId: input.userId } }),
          tx.missionDeepLinkState.deleteMany({ where: { userId: input.userId } }),
          tx.postRecord.updateMany({
            where: { actorUserId: input.userId },
            data: { postUrl: null, externalPostId: null, manualMetrics: Prisma.DbNull },
          }),
          tx.missionActivity.updateMany({
            where: { actorUserId: input.userId },
            data: { metadata: Prisma.DbNull },
          }),
        ]);

      if (workspaceIds.length > 0) {
        await Promise.all([
          tx.workspace.updateMany({
            where: { id: { in: workspaceIds }, type: 'PERSONAL' },
            data: { name: '退会済みワークスペース', status: 'ARCHIVED' },
          }),
          tx.bunshin.updateMany({
            where: scope,
            data: {
              name: '退会済みBunshin',
              objectiveSummary: '',
              audienceSummary: '',
              personalitySummary: '',
              avatarUrl: null,
              status: 'ARCHIVED',
              archivedAt: input.now,
            },
          }),
          tx.bunshinObjective.updateMany({
            where: { bunshinId: { in: bunshinIds } },
            data: {
              objectiveType: 'DELETED',
              primaryGoal: '',
              kpiName: null,
              kpiTarget: null,
              kpiPeriod: null,
              status: 'INACTIVE',
            },
          }),
          tx.bunshinAudience.updateMany({
            where: { bunshinId: { in: bunshinIds } },
            data: {
              label: '',
              ageRange: null,
              occupation: null,
              experienceLevel: null,
              painPoints: [],
              desires: [],
              excludedAudience: [],
              notes: null,
            },
          }),
          tx.bunshinPersonality.updateMany({
            where: { bunshinId: { in: bunshinIds } },
            data: {
              tone: '',
              formality: '',
              energyLevel: '',
              expertiseLevel: '',
              sentenceStyle: '',
              firstPerson: '',
              forbiddenExpressions: [],
              preferredExpressions: [],
              visualDirection: null,
            },
          }),
          tx.ownerKnowledge.updateMany({
            where: scope,
            data: {
              title: '退会済みデータ',
              content: '',
              status: 'ARCHIVED',
              archivedAt: input.now,
            },
          }),
          tx.bunshinMemory.updateMany({
            where: scope,
            data: {
              content: '',
              summary: null,
              sourceId: null,
              active: false,
              deletedAt: input.now,
            },
          }),
          tx.bunshinCapabilityAssignment.updateMany({
            where: scope,
            data: { status: 'SUSPENDED', config: {} },
          }),
          tx.socialProfile.updateMany({
            where: scope,
            data: { handle: null, profileUrl: null, purpose: '', preferredFormats: [] },
          }),
          tx.socialAccountStrategy.updateMany({
            where: scope,
            data: {
              destinationDetail: null,
              concept: '',
              positioning: '',
              targetSummary: '',
              profileDraft: '',
              ctaStrategy: '',
              postingPolicy: '',
            },
          }),
          tx.contentPillar.updateMany({
            where: scope,
            data: { description: null, active: false, deletedAt: input.now },
          }),
          tx.weeklyPlan.updateMany({ where: scope, data: { strategySummary: null } }),
          tx.weeklyPlanItem.updateMany({
            where: scope,
            data: { goal: '', angle: '', notes: null },
          }),
          tx.dailyMission.updateMany({
            where: scope,
            data: { topic: '', angle: '', reason: '' },
          }),
          tx.missionContent.updateMany({ where: scope, data: { contentJson: {} } }),
          tx.missionDecision.updateMany({ where: scope, data: { rejectionDetail: null } }),
          tx.missionActivity.updateMany({ where: scope, data: { metadata: Prisma.DbNull } }),
          tx.postRecord.updateMany({
            where: scope,
            data: { postUrl: null, externalPostId: null, manualMetrics: Prisma.DbNull },
          }),
        ]);
        const contentPillars = await tx.contentPillar.findMany({
          where: scope,
          select: { id: true },
        });
        await Promise.all([
          ...personalBunshins.map(({ id }) =>
            tx.bunshin.update({ where: { id }, data: { slug: `deleted-${id}` } }),
          ),
          ...contentPillars.map(({ id }) =>
            tx.contentPillar.update({ where: { id }, data: { title: `deleted-${id}` } }),
          ),
        ]);
      }

      const memberships = await tx.workspaceMembership.updateMany({
        where: { userId: input.userId },
        data: { status: 'REVOKED' },
      });
      await tx.user.update({
        where: { id: input.userId },
        data: { status: 'DELETED', email: null, displayName: '退会済みユーザー' },
      });
      await tx.accountDeletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'COMPLETED',
          completedAt: input.now,
          leaseOwner: null,
          leaseExpiresAt: null,
          blockedReason: null,
          lastErrorCategory: null,
          summary: {
            identitiesDeleted: identities.count,
            lineConnectionsDeleted: lineConnections.count,
            linePreferencesDeleted: linePreferences.count,
            deepLinksDeleted: deepLinks.count,
            postRecordsSanitized: posts.count,
            activitiesSanitized: activities.count,
            membershipsRevoked: memberships.count,
            personalWorkspacesArchived: workspaceIds.length,
          },
        },
      });
      return {
        requestId: request.id,
        userId: request.userId,
        status: 'COMPLETED' as const,
        blockedReason: null,
      };
    });
  }
}

export class PrismaAccountDeletionOrchestrationRepository implements AccountDeletionOrchestrationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findEmailIdentity(
    input: Parameters<AccountDeletionOrchestrationRepository['findEmailIdentity']>[0],
  ) {
    const request = await this.client.accountDeletionRequest.findFirst({
      where: {
        id: input.requestId,
        userId: input.userId,
        status: 'PROCESSING',
        leaseOwner: input.workerId,
        leaseExpiresAt: { gt: input.now },
        user: { status: 'SUSPENDED' },
      },
      select: {
        user: {
          select: {
            identities: {
              where: { provider: 'EMAIL' },
              select: { providerUserId: true },
              take: 1,
            },
          },
        },
      },
    });
    return request?.user.identities[0] ?? null;
  }

  async recordAuthFailure(
    input: Parameters<AccountDeletionOrchestrationRepository['recordAuthFailure']>[0],
  ) {
    const base = {
      id: input.requestId,
      userId: input.userId,
      status: 'PROCESSING' as const,
      leaseOwner: input.workerId,
      leaseExpiresAt: { gt: input.now },
    };
    if (input.retryable) {
      const result = await this.client.accountDeletionRequest.updateMany({
        where: base,
        data: {
          lastErrorCategory: input.category,
          leaseExpiresAt: new Date(input.now.getTime() + 5 * 60 * 1_000),
        },
      });
      return result.count === 1;
    }
    const blockedReason: AccountDeletionBlockedReason =
      input.category === 'AUTH_ENVIRONMENT_MISMATCH'
        ? 'AUTH_ENVIRONMENT_MISMATCH'
        : 'AUTH_CONFIGURATION_UNAVAILABLE';
    const result = await this.client.accountDeletionRequest.updateMany({
      where: base,
      data: {
        status: 'BLOCKED',
        blockedReason,
        lastErrorCategory: input.category,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }

  async inspect(now: Date) {
    const [due, processing, blocked] = await Promise.all([
      this.client.accountDeletionRequest.count({
        where: { status: 'REQUESTED', scheduledFor: { lte: now } },
      }),
      this.client.accountDeletionRequest.count({ where: { status: 'PROCESSING' } }),
      this.client.accountDeletionRequest.count({ where: { status: 'BLOCKED' } }),
    ]);
    return { due, processing, blocked };
  }
}

export class PrismaAccountDeletionAdminOperationsRepository implements AccountDeletionAdminOperationsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async retryBlocked(
    input: Parameters<AccountDeletionAdminOperationsRepository['retryBlocked']>[0],
  ) {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!admin) return null;
      const request = await tx.accountDeletionRequest.findFirst({
        where: { id: input.requestId, status: 'BLOCKED' },
        select: { id: true, status: true },
      });
      if (!request) return false;
      const updated = await tx.accountDeletionRequest.updateMany({
        where: { id: request.id, status: 'BLOCKED' },
        data: {
          status: 'REQUESTED',
          scheduledFor: input.now,
          blockedReason: null,
          lastErrorCategory: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (updated.count !== 1) return false;
      await tx.accountDeletionOperationAudit.create({
        data: {
          requestId: request.id,
          actorUserId: input.actorUserId,
          action: 'RETRY_BLOCKED',
          reason: input.reason,
          previousStatus: 'BLOCKED',
          nextStatus: 'REQUESTED',
        },
      });
      return true;
    });
  }
}

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
            changeReason: '分身作成時の初期人格',
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
          { groupId: null },
          {
            group: {
              status: 'ACTIVE',
              memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
            },
          },
        ],
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
    return row.personality;
  }

  async create(input: Parameters<PersonalityLearningProposalRepository['create']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const personality = await this.access(tx, input);
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
      if (!(await this.access(tx, input))) return null;
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
      const personality = await this.access(tx, input);
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
      const personality = await this.access(tx, input);
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
    await client.$queryRaw`SELECT 1`;
  } catch (error) {
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
  constructor(private readonly client: PrismaClient = prisma) {}
  private async managed(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
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
  private managed(
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
          memberships: {
            some: { userId: input.actorUserId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
          },
        },
      },
      select: { id: true },
    });
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
    const accessible = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        workspace: {
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
    if (accessible === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    await this.client.aiUsageEvent.upsert({
      where: {
        workspaceId_actorUserId_idempotencyKey: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        ...input,
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
    attentionReason = 'BUNSHINが未作成';
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
      failedDeliveries,
      lineJobs,
      otherDeadJobs,
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
      this.client.accountDeletionRequest.count({ where: { status: 'BLOCKED' } }),
      this.client.supportCase.count({ where: { status: 'OPEN' } }),
      this.client.supportCase.count({ where: { status: 'OPEN', priority: 'URGENT' } }),
    ]);
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
        const required = [
          'BACKUP_RESTORE',
          'MIGRATION_HEALTH',
          'AUTH_SMOKE',
          'FREE_MVP_SMOKE',
          'ACCOUNT_DELETION_DRY_RUN',
          'LINE_GO_NO_GO',
          'TREND_RESEARCH_SMOKE',
          'EXTERNAL_TRACKING_SMOKE',
        ] as const;
        if (!required.every((key) => latest.get(key) === 'RECORDED')) return null;
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

const groupRecord = (row: Prisma.GroupGetPayload<object>): Group => ({ ...row });
const groupMembershipRecord = (row: Prisma.GroupMembershipGetPayload<object>): GroupMembership => ({
  ...row,
});
const groupInvitationRecord = (row: Prisma.GroupInvitationGetPayload<object>): GroupInvitation => ({
  ...row,
});

const serviceFoundationRecord = (
  row: Prisma.ServiceConfigurationGetPayload<{ include: { brand: true; registration: true } }>,
): ServiceFoundationRecord => {
  if (row.brand === null || row.registration === null)
    throw new Error('service foundation aggregate is incomplete');
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    groupId: row.groupId,
    slug: row.slug,
    displayName: row.displayName,
    description: row.description,
    operatorName: row.operatorName,
    contactEmail: row.contactEmail,
    visibility: row.visibility,
    poweredByEnabled: row.poweredByEnabled,
    trendResearchEnabled: row.trendResearchEnabled,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    termsUrl: row.termsUrl,
    privacyUrl: row.privacyUrl,
    brand: {
      logoUrl: row.brand.logoUrl,
      iconUrl: row.brand.iconUrl,
      faviconUrl: row.brand.faviconUrl,
      primaryColor: row.brand.primaryColor,
      secondaryColor: row.brand.secondaryColor,
      fontFamily: row.brand.fontFamily,
    },
    registration: {
      mode: row.registration.mode,
      emailEnabled: row.registration.emailEnabled,
      lineEnabled: row.registration.lineEnabled,
      inviteCodeEnabled: row.registration.inviteCodeEnabled,
      referralEnabled: row.registration.referralEnabled,
      onboardingConfig: row.registration.onboardingConfig,
      surveyConfig: row.registration.surveyConfig,
    },
  };
};

const serviceStaffRoleRecord = (row: {
  id: string;
  workspaceId: string;
  groupId: string;
  userId: string;
  serviceRole: 'SERVICE_OWNER' | 'SERVICE_ADMIN' | 'CONTENT_EDITOR' | 'PARTICIPANT';
  status: string;
}) => ({
  membershipId: row.id,
  workspaceId: row.workspaceId,
  groupId: row.groupId,
  userId: row.userId,
  serviceRole: row.serviceRole,
  status: row.status as 'ACTIVE' | 'SUSPENDED' | 'REVOKED',
});

export class PrismaProgramCoreRepository implements ProgramCoreRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async platformAdmin(actorUserId: string) {
    return (
      (await this.client.platformAdmin.findFirst({
        where: { userId: actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      })) !== null
    );
  }

  private async serviceManager(workspaceId: string, groupId: string, actorUserId: string) {
    return (
      (await this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          status: 'ACTIVE',
          serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
          group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
        },
        select: { id: true },
      })) !== null
    );
  }

  async createTemplate(input: Parameters<ProgramCoreRepository['createTemplate']>[0]) {
    const allowed =
      input.visibility === 'PLATFORM'
        ? await this.platformAdmin(input.actorUserId)
        : input.ownerGroupId !== null &&
          (await this.serviceManager(input.workspaceId, input.ownerGroupId, input.actorUserId));
    if (!allowed) return null;
    return this.client.$transaction(async (tx) => {
      const row = await tx.programTemplate.create({
        data: {
          workspaceId: input.workspaceId,
          ownerGroupId: input.ownerGroupId,
          name: input.name,
          description: input.description,
          category: input.category,
          targetAudience: input.targetAudience,
          visibility: input.visibility,
          createdByUserId: input.actorUserId,
        },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.ownerGroupId,
          resourceType: 'PROGRAM_TEMPLATE',
          resourceId: row.id,
          action: 'CREATED',
          afterData: row,
          performedByUserId: input.actorUserId,
        },
      });
      return row;
    });
  }

  async createTemplateVersion(
    input: Parameters<ProgramCoreRepository['createTemplateVersion']>[0],
  ) {
    return this.client.$transaction(async (tx) => {
      const template = await tx.programTemplate.findFirst({
        where: { id: input.programTemplateId, workspaceId: input.workspaceId },
      });
      if (template === null) return null;
      const allowed =
        template.visibility === 'PLATFORM'
          ? await this.platformAdmin(input.actorUserId)
          : template.ownerGroupId !== null &&
            (await this.serviceManager(
              input.workspaceId,
              template.ownerGroupId,
              input.actorUserId,
            ));
      if (!allowed) return null;
      const latest = await tx.programTemplateVersion.aggregate({
        where: { workspaceId: input.workspaceId, programTemplateId: template.id },
        _max: { version: true },
      });
      const row = await tx.programTemplateVersion.create({
        data: {
          workspaceId: input.workspaceId,
          programTemplateId: template.id,
          version: (latest._max.version ?? 0) + 1,
          status: input.publish ? 'PUBLISHED' : 'DRAFT',
          definition: input.definition as Prisma.InputJsonValue,
          createdByUserId: input.actorUserId,
          publishedAt: input.publish ? new Date() : null,
        },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: template.ownerGroupId,
          resourceType: 'PROGRAM_TEMPLATE_VERSION',
          resourceId: row.id,
          action: input.publish ? 'PUBLISHED' : 'CREATED',
          afterData: row,
          performedByUserId: input.actorUserId,
        },
      });
      return row;
    });
  }

  async adoptProgram(input: Parameters<ProgramCoreRepository['adoptProgram']>[0]) {
    if (!(await this.serviceManager(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    return this.client.$transaction(async (tx) => {
      const version = await tx.programTemplateVersion.findFirst({
        where: {
          id: input.programTemplateVersionId,
          workspaceId: input.workspaceId,
          status: 'PUBLISHED',
        },
      });
      if (version === null) return null;
      const template = await tx.programTemplate.findFirst({
        where: {
          id: version.programTemplateId,
          workspaceId: input.workspaceId,
          OR: [{ visibility: 'PLATFORM' }, { ownerGroupId: input.groupId }],
        },
        select: { id: true },
      });
      if (template === null) return null;
      const row = await tx.serviceProgram.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programTemplateVersionId: version.id,
          displayName: input.displayName,
          description: input.description,
          settings: input.settings as Prisma.InputJsonValue,
          createdByUserId: input.actorUserId,
        },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          resourceType: 'SERVICE_PROGRAM',
          resourceId: row.id,
          action: 'ADOPTED',
          afterData: row,
          performedByUserId: input.actorUserId,
        },
      });
      return row;
    });
  }

  async createOffering(input: Parameters<ProgramCoreRepository['createOffering']>[0]) {
    if (!(await this.serviceManager(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    return this.client.$transaction(async (tx) => {
      const program = await tx.serviceProgram.findFirst({
        where: {
          id: input.serviceProgramId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
        },
      });
      if (program === null) return null;
      const latest = await tx.programOffering.aggregate({
        where: { serviceProgramId: program.id },
        _max: { version: true },
      });
      const row = await tx.programOffering.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          serviceProgramId: program.id,
          version: (latest._max.version ?? 0) + 1,
          isFree: input.isFree,
          priceReference: input.priceReference,
          ...input.responsibilities,
          termsSnapshot: input.termsSnapshot as Prisma.InputJsonValue,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          createdByUserId: input.actorUserId,
        },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          resourceType: 'PROGRAM_OFFERING',
          resourceId: row.id,
          action: 'CREATED',
          afterData: row,
          performedByUserId: input.actorUserId,
        },
      });
      return {
        ...row,
        responsibilities: {
          seller: row.seller,
          priceOwner: row.priceOwner,
          paymentOwner: row.paymentOwner,
          apiCostOwner: row.apiCostOwner,
          supportOwner: row.supportOwner,
          contentOwner: row.contentOwner,
          characterOwner: row.characterOwner,
        },
      };
    });
  }

  async enroll(input: Parameters<ProgramCoreRepository['enroll']>[0]) {
    if (!(await this.serviceManager(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    return this.client.$transaction(async (tx) => {
      const [membership, program, offering] = await Promise.all([
        tx.groupMembership.findFirst({
          where: {
            id: input.groupMembershipId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            status: 'ACTIVE',
          },
        }),
        tx.serviceProgram.findFirst({
          where: {
            id: input.serviceProgramId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
          },
        }),
        tx.programOffering.findFirst({
          where: {
            id: input.programOfferingId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            serviceProgramId: input.serviceProgramId,
          },
        }),
      ]);
      if (membership === null || program === null || offering === null) return null;
      const offeringSnapshot = {
        version: offering.version,
        isFree: offering.isFree,
        priceReference: offering.priceReference,
        seller: offering.seller,
        priceOwner: offering.priceOwner,
        paymentOwner: offering.paymentOwner,
        apiCostOwner: offering.apiCostOwner,
        supportOwner: offering.supportOwner,
        contentOwner: offering.contentOwner,
        characterOwner: offering.characterOwner,
        terms: offering.termsSnapshot,
      };
      const row = await tx.programEnrollment.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: membership.id,
          serviceProgramId: program.id,
          programOfferingId: offering.id,
          supportMode: input.supportMode,
          goalSnapshot: input.goalSnapshot as Prisma.InputJsonValue,
          offeringSnapshot: offeringSnapshot,
          invitedByUserId: input.actorUserId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          resourceType: 'PROGRAM_ENROLLMENT',
          resourceId: row.id,
          action: 'INVITED',
          afterData: row,
          performedByUserId: input.actorUserId,
        },
      });
      return row;
    });
  }

  async findEnrollment(input: Parameters<ProgramCoreRepository['findEnrollment']>[0]) {
    const actorMembership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
      },
    });
    if (actorMembership === null) return null;
    const canReadOther = ['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(actorMembership.serviceRole);
    if (!canReadOther && actorMembership.id !== input.groupMembershipId) return null;
    return this.client.programEnrollment.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        serviceProgramId: input.serviceProgramId,
      },
    });
  }
}

export class PrismaServiceStaffRoleRepository implements ServiceStaffRoleRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async canManage(workspaceId: string, groupId: string, actorUserId: string) {
    const [platformAdmin, owner] = await Promise.all([
      this.client.platformAdmin.findFirst({
        where: { userId: actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      }),
      this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          status: 'ACTIVE',
          serviceRole: 'SERVICE_OWNER',
          group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
        },
        select: { id: true },
      }),
    ]);
    return platformAdmin !== null || owner !== null;
  }

  async list(input: Parameters<ServiceStaffRoleRepository['list']>[0]) {
    if (!(await this.canManage(input.workspaceId, input.groupId, input.actorUserId))) return null;
    const rows = await this.client.groupMembership.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      orderBy: [{ serviceRole: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(serviceStaffRoleRecord);
  }

  async set(input: Parameters<ServiceStaffRoleRepository['set']>[0]) {
    return this.client.$transaction(async (tx) => {
      const [platformAdmin, owner] = await Promise.all([
        tx.platformAdmin.findFirst({
          where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
          select: { id: true },
        }),
        tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.actorUserId,
            status: 'ACTIVE',
            serviceRole: 'SERVICE_OWNER',
            group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
          },
          select: { id: true },
        }),
      ]);
      if (platformAdmin === null && owner === null) return null;
      const target = await tx.groupMembership.findFirst({
        where: {
          id: input.membershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { in: ['ACTIVE', 'SUSPENDED'] },
          group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
        },
      });
      if (target === null || target.serviceRole === input.serviceRole)
        return target === null ? null : serviceStaffRoleRecord(target);
      if (target.serviceRole === 'SERVICE_OWNER' && input.serviceRole !== 'SERVICE_OWNER') {
        const owners = await tx.groupMembership.count({
          where: {
            groupId: input.groupId,
            serviceRole: 'SERVICE_OWNER',
            status: 'ACTIVE',
          },
        });
        if (owners <= 1) return null;
      }
      const legacyRole = ['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(input.serviceRole)
        ? 'MANAGER'
        : 'PARTICIPANT';
      const updated = await tx.groupMembership.update({
        where: { id: target.id },
        data: { serviceRole: input.serviceRole, role: legacyRole },
      });
      await tx.groupMembershipAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: target.id,
          action: 'ROLE_CHANGED',
          beforeData: { role: target.role, serviceRole: target.serviceRole, status: target.status },
          afterData: {
            role: updated.role,
            serviceRole: updated.serviceRole,
            status: updated.status,
          },
          reason: input.reason,
          performedByUserId: input.actorUserId,
          occurredAt: input.now,
        },
      });
      return serviceStaffRoleRecord(updated);
    });
  }
}

export class PrismaServiceFoundationRepository implements ServiceFoundationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async create(input: Parameters<ServiceFoundationRepository['create']>[0]) {
    return this.client.$transaction(async (tx) => {
      const [admin, workspace, existingGroup] = await Promise.all([
        tx.platformAdmin.findFirst({
          where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
          select: { id: true },
        }),
        tx.workspace.findFirst({
          where: { id: input.workspaceId, type: 'ORGANIZATION', status: 'ACTIVE' },
          select: { id: true },
        }),
        input.groupId
          ? tx.group.findFirst({
              where: {
                id: input.groupId,
                workspaceId: input.workspaceId,
                status: 'ACTIVE',
                serviceConfiguration: { is: null },
              },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);
      if (admin === null || workspace === null || (input.groupId && existingGroup === null))
        return null;
      const now = new Date();
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: input.workspaceId },
        select: {
          maxGroups: true,
          maxServices: true,
          oemEnabled: true,
          suspended: true,
          startsAt: true,
          endsAt: true,
        },
      });
      if (
        entitlement?.suspended ||
        (entitlement?.startsAt && entitlement.startsAt > now) ||
        (entitlement?.endsAt && entitlement.endsAt <= now)
      )
        return null;
      const [groupCount, serviceCount] = await Promise.all([
        entitlement?.maxGroups
          ? tx.group.count({ where: { workspaceId: input.workspaceId, status: 'ACTIVE' } })
          : Promise.resolve(0),
        entitlement?.maxServices
          ? tx.serviceConfiguration.count({ where: { workspaceId: input.workspaceId } })
          : Promise.resolve(0),
      ]);
      if (!input.groupId && entitlement?.maxGroups && groupCount >= entitlement.maxGroups)
        return null;
      if (entitlement?.maxServices && serviceCount >= entitlement.maxServices) return null;
      const value = input.configuration;
      if (entitlement && !entitlement.oemEnabled && !value.poweredByEnabled) return null;
      const group = existingGroup
        ? existingGroup
        : await tx.group.create({
            data: {
              workspaceId: input.workspaceId,
              name: value.displayName,
              memberships: {
                create: {
                  workspaceId: input.workspaceId,
                  userId: input.actorUserId,
                  role: 'MANAGER',
                  serviceRole: 'SERVICE_OWNER',
                  status: 'ACTIVE',
                  consentedAt: new Date(),
                },
              },
            },
          });
      if (existingGroup) {
        await tx.groupMembership.upsert({
          where: { groupId_userId: { groupId: group.id, userId: input.actorUserId } },
          create: {
            workspaceId: input.workspaceId,
            groupId: group.id,
            userId: input.actorUserId,
            role: 'MANAGER',
            serviceRole: 'SERVICE_OWNER',
            status: 'ACTIVE',
            consentedAt: now,
          },
          update: {
            role: 'MANAGER',
            serviceRole: 'SERVICE_OWNER',
            status: 'ACTIVE',
            consentedAt: now,
            declinedAt: null,
            revokedAt: null,
          },
        });
      }
      const configuration = await tx.serviceConfiguration.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: group.id,
          slug: value.slug,
          displayName: value.displayName,
          description: value.description,
          operatorName: value.operatorName,
          contactEmail: value.contactEmail,
          visibility: value.visibility,
          poweredByEnabled: value.poweredByEnabled,
          trendResearchEnabled: value.trendResearchEnabled ?? true,
          startsAt: value.startsAt,
          endsAt: value.endsAt,
          termsUrl: value.termsUrl,
          privacyUrl: value.privacyUrl,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
      });
      await Promise.all([
        tx.serviceBrand.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: group.id,
            configurationId: configuration.id,
            ...value.brand,
          },
        }),
        tx.serviceRegistrationPolicy.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: group.id,
            configurationId: configuration.id,
            ...value.registration,
            onboardingConfig: value.registration.onboardingConfig as Prisma.InputJsonValue,
            surveyConfig: value.registration.surveyConfig as Prisma.InputJsonValue,
          },
        }),
      ]);
      const saved = await tx.serviceConfiguration.findUniqueOrThrow({
        where: { id: configuration.id },
        include: { brand: true, registration: true },
      });
      const record = serviceFoundationRecord(saved);
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: group.id,
          configurationId: configuration.id,
          action: 'CREATED',
          afterData: record as unknown as Prisma.InputJsonValue,
          reason: input.reason,
          performedByUserId: input.actorUserId,
        },
      });
      return record;
    });
  }

  async save(input: Parameters<ServiceFoundationRepository['save']>[0]) {
    return this.client.$transaction(async (tx) => {
      const [admin, group, manager, existing, entitlement] = await Promise.all([
        tx.platformAdmin.findFirst({
          where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
          select: { id: true },
        }),
        tx.group.findFirst({
          where: { id: input.groupId, workspaceId: input.workspaceId },
          select: { id: true },
        }),
        tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.actorUserId,
            role: 'MANAGER',
            status: 'ACTIVE',
            group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
          },
          select: { id: true },
        }),
        tx.serviceConfiguration.findUnique({
          where: { groupId: input.groupId },
          include: { brand: true, registration: true },
        }),
        tx.organizationEntitlement.findUnique({
          where: { workspaceId: input.workspaceId },
          select: { oemEnabled: true, suspended: true, startsAt: true, endsAt: true },
        }),
      ]);
      if ((admin === null && manager === null) || group === null) return null;
      const value = input.configuration;
      const now = new Date();
      if (
        entitlement?.suspended ||
        (entitlement?.startsAt && entitlement.startsAt > now) ||
        (entitlement?.endsAt && entitlement.endsAt <= now) ||
        (entitlement && !entitlement.oemEnabled && !value.poweredByEnabled)
      )
        return null;
      if (
        admin === null &&
        (existing === null ||
          value.slug !== existing.slug ||
          value.visibility !== existing.visibility ||
          value.poweredByEnabled !== existing.poweredByEnabled ||
          value.startsAt?.getTime() !== existing.startsAt?.getTime() ||
          value.endsAt?.getTime() !== existing.endsAt?.getTime())
      )
        return null;
      const configuration = await tx.serviceConfiguration.upsert({
        where: { groupId: input.groupId },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          slug: value.slug,
          displayName: value.displayName,
          description: value.description,
          operatorName: value.operatorName,
          contactEmail: value.contactEmail,
          visibility: value.visibility,
          poweredByEnabled: value.poweredByEnabled,
          trendResearchEnabled: value.trendResearchEnabled ?? true,
          startsAt: value.startsAt,
          endsAt: value.endsAt,
          termsUrl: value.termsUrl,
          privacyUrl: value.privacyUrl,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
        update: {
          slug: value.slug,
          displayName: value.displayName,
          description: value.description,
          operatorName: value.operatorName,
          contactEmail: value.contactEmail,
          visibility: value.visibility,
          poweredByEnabled: value.poweredByEnabled,
          trendResearchEnabled: value.trendResearchEnabled ?? true,
          startsAt: value.startsAt,
          endsAt: value.endsAt,
          termsUrl: value.termsUrl,
          privacyUrl: value.privacyUrl,
          updatedByUserId: input.actorUserId,
        },
      });
      await Promise.all([
        tx.group.update({
          where: { id: input.groupId },
          data: { name: value.displayName },
        }),
        tx.serviceBrand.upsert({
          where: { groupId: input.groupId },
          create: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            configurationId: configuration.id,
            ...value.brand,
          },
          update: value.brand,
        }),
        tx.serviceRegistrationPolicy.upsert({
          where: { groupId: input.groupId },
          create: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            configurationId: configuration.id,
            ...value.registration,
            onboardingConfig: value.registration.onboardingConfig as Prisma.InputJsonValue,
            surveyConfig: value.registration.surveyConfig as Prisma.InputJsonValue,
          },
          update: {
            ...value.registration,
            onboardingConfig: value.registration.onboardingConfig as Prisma.InputJsonValue,
            surveyConfig: value.registration.surveyConfig as Prisma.InputJsonValue,
          },
        }),
      ]);
      const saved = await tx.serviceConfiguration.findUniqueOrThrow({
        where: { id: configuration.id },
        include: { brand: true, registration: true },
      });
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          configurationId: configuration.id,
          action: existing === null ? 'CREATED' : 'UPDATED',
          ...(existing === null
            ? {}
            : {
                beforeData: serviceFoundationRecord(existing) as unknown as Prisma.InputJsonValue,
              }),
          afterData: serviceFoundationRecord(saved) as unknown as Prisma.InputJsonValue,
          reason: input.reason,
          performedByUserId: input.actorUserId,
        },
      });
      return serviceFoundationRecord(saved);
    });
  }

  async findByGroup(input: Parameters<ServiceFoundationRepository['findByGroup']>[0]) {
    const [platformAdmin, access] = await Promise.all([
      this.client.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.client.group.findFirst({
        where: {
          id: input.groupId,
          workspaceId: input.workspaceId,
          OR: [
            {
              memberships: {
                some: { userId: input.actorUserId, role: 'MANAGER', status: 'ACTIVE' },
              },
            },
            {
              workspace: {
                memberships: {
                  some: {
                    userId: input.actorUserId,
                    role: { in: ['OWNER', 'ADMIN'] },
                    status: 'ACTIVE',
                  },
                },
              },
            },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (platformAdmin === null && access === null) return null;
    const value = await this.client.serviceConfiguration.findFirst({
      where: { workspaceId: input.workspaceId, groupId: input.groupId },
      include: { brand: true, registration: true },
    });
    return value === null ? null : serviceFoundationRecord(value);
  }

  async findPublicBySlug(input: Parameters<ServiceFoundationRepository['findPublicBySlug']>[0]) {
    const value = await this.client.serviceConfiguration.findFirst({
      where: {
        slug: input.slug,
        visibility: 'PUBLIC',
        group: { status: 'ACTIVE' },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
        ],
      },
      include: { brand: true, registration: true },
    });
    return value === null ? null : serviceFoundationRecord(value);
  }
}

export class PrismaServiceParticipationRepository implements ServiceParticipationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findView(input: Parameters<ServiceParticipationRepository['findView']>[0]) {
    const configuration = await this.client.serviceConfiguration.findFirst({
      where: {
        slug: input.slug,
        visibility: 'PUBLIC',
        group: { status: 'ACTIVE' },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
        ],
      },
      include: { registration: true },
    });
    if (configuration?.registration === null || configuration === null) return null;
    const documents = await this.client.serviceLegalDocument.findMany({
      where: {
        workspaceId: configuration.workspaceId,
        groupId: configuration.groupId,
        status: 'PUBLISHED',
        effectiveAt: { lte: input.now },
      },
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
    });
    const legalDocuments = [
      ...new Map(documents.map((document) => [document.type, document])).values(),
    ].map(({ id, type, version, title, content }) => ({ id, type, version, title, content }));
    const membership =
      input.actorUserId === null
        ? null
        : await this.client.groupMembership.findUnique({
            where: {
              groupId_userId: {
                groupId: configuration.groupId,
                userId: input.actorUserId,
              },
            },
          });
    return {
      registrationMode: configuration.registration.mode,
      membership: membership === null ? null : groupMembershipRecord(membership),
      legalDocuments,
    };
  }

  async request(input: Parameters<ServiceParticipationRepository['request']>[0]) {
    return this.client.$transaction(async (tx) => {
      const configuration = await tx.serviceConfiguration.findFirst({
        where: {
          slug: input.slug,
          visibility: 'PUBLIC',
          group: { status: 'ACTIVE' },
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
          ],
        },
        include: { registration: true },
      });
      if (
        configuration?.registration === null ||
        configuration === null ||
        ['INVITATION_ONLY', 'CLOSED'].includes(configuration.registration.mode)
      )
        return null;

      const published = await tx.serviceLegalDocument.findMany({
        where: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          status: 'PUBLISHED',
          effectiveAt: { lte: input.now },
        },
        orderBy: [{ type: 'asc' }, { version: 'desc' }],
      });
      const latest = [...new Map(published.map((document) => [document.type, document])).values()];
      const requiredIds = latest.map(({ id }) => id).sort();
      if (requiredIds.join(':') !== [...input.legalDocumentIds].sort().join(':')) return null;

      const workspaceMembership = await tx.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: configuration.workspaceId,
            userId: input.actorUserId,
          },
        },
      });
      if (workspaceMembership !== null && workspaceMembership.status !== 'ACTIVE') return null;
      if (workspaceMembership === null)
        await tx.workspaceMembership.create({
          data: {
            workspaceId: configuration.workspaceId,
            userId: input.actorUserId,
            role: 'MEMBER',
          },
        });

      const existing = await tx.groupMembership.findUnique({
        where: {
          groupId_userId: { groupId: configuration.groupId, userId: input.actorUserId },
        },
      });
      if (existing !== null && !['ACTIVE', 'PENDING_APPROVAL'].includes(existing.status))
        return null;
      const status = configuration.registration.mode === 'PUBLIC' ? 'ACTIVE' : 'PENDING_APPROVAL';
      const membership = await tx.groupMembership.upsert({
        where: {
          groupId_userId: { groupId: configuration.groupId, userId: input.actorUserId },
        },
        create: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          userId: input.actorUserId,
          role: 'PARTICIPANT',
          status,
          consentedAt: input.now,
        },
        update: { status, consentedAt: input.now, declinedAt: null, revokedAt: null },
      });
      if (configuration.registration.referralEnabled && input.referralCode !== null) {
        const referralCode = await tx.serviceReferralCode.findFirst({
          where: {
            workspaceId: configuration.workspaceId,
            groupId: configuration.groupId,
            code: input.referralCode,
            status: 'ACTIVE',
            groupMembership: { status: 'ACTIVE' },
          },
          select: { id: true, groupMembershipId: true, userId: true },
        });
        if (
          referralCode !== null &&
          referralCode.groupMembershipId !== membership.id &&
          referralCode.userId !== input.actorUserId
        ) {
          const existingReferral = await tx.serviceReferral.findFirst({
            where: {
              workspaceId: configuration.workspaceId,
              groupId: configuration.groupId,
              referredMembershipId: membership.id,
            },
            select: { id: true },
          });
          if (existingReferral === null) {
            const click =
              input.referralClickId === null
                ? null
                : await tx.serviceReferralClick.findFirst({
                    where: {
                      id: input.referralClickId,
                      workspaceId: configuration.workspaceId,
                      groupId: configuration.groupId,
                      referralCodeId: referralCode.id,
                      expiresAt: { gt: input.now },
                    },
                    select: { id: true },
                  });
            const referralClick =
              click ??
              (await tx.serviceReferralClick.create({
                data: {
                  workspaceId: configuration.workspaceId,
                  groupId: configuration.groupId,
                  referralCodeId: referralCode.id,
                  expiresAt: new Date(input.now.getTime() + 30 * 24 * 60 * 60 * 1000),
                },
                select: { id: true },
              }));
            await tx.serviceReferral.createMany({
              data: [
                {
                  workspaceId: configuration.workspaceId,
                  groupId: configuration.groupId,
                  referralCodeId: referralCode.id,
                  referralClickId: referralClick.id,
                  referredMembershipId: membership.id,
                  referredUserId: input.actorUserId,
                  status: 'REGISTERED',
                  registeredAt: input.now,
                },
              ],
              skipDuplicates: true,
            });
          }
        }
      }
      if (latest.length > 0)
        await tx.serviceLegalConsent.createMany({
          data: latest.map(({ id }) => ({
            workspaceId: configuration.workspaceId,
            groupId: configuration.groupId,
            groupMembershipId: membership.id,
            userId: input.actorUserId,
            legalDocumentId: id,
            consentedAt: input.now,
          })),
          skipDuplicates: true,
        });
      await tx.groupMembershipAuditLog.create({
        data: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          groupMembershipId: membership.id,
          action: status === 'ACTIVE' ? 'APPROVED' : 'REQUESTED',
          beforeData: existing === null ? {} : { status: existing.status },
          afterData: { role: membership.role, status: membership.status },
          reason:
            status === 'ACTIVE' ? 'public service registration' : 'service participation requested',
          performedByUserId: input.actorUserId,
          occurredAt: input.now,
        },
      });
      return groupMembershipRecord(membership);
    });
  }

  async approve(input: Parameters<ServiceParticipationRepository['approve']>[0]) {
    return this.client.$transaction(async (tx) => {
      const [manager, workspaceManager, platformAdmin] = await Promise.all([
        tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.serviceId,
            userId: input.actorUserId,
            role: 'MANAGER',
            status: 'ACTIVE',
            group: { status: 'ACTIVE' },
          },
          select: { id: true },
        }),
        tx.workspaceMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            role: { in: ['OWNER', 'ADMIN'] },
            status: 'ACTIVE',
            workspace: { status: 'ACTIVE' },
          },
          select: { id: true },
        }),
        tx.platformAdmin.findFirst({
          where: {
            userId: input.actorUserId,
            role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
      ]);
      if (manager === null && workspaceManager === null && platformAdmin === null) return null;
      const target = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.serviceId,
          status: 'PENDING_APPROVAL',
        },
      });
      if (target === null) return null;
      const updated = await tx.groupMembership.update({
        where: { id: target.id },
        data: { status: 'ACTIVE' },
      });
      await tx.groupMembershipAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.serviceId,
          groupMembershipId: target.id,
          action: 'APPROVED',
          beforeData: { role: target.role, status: target.status },
          afterData: { role: updated.role, status: updated.status },
          reason: input.reason,
          performedByUserId: input.actorUserId,
          occurredAt: input.now,
        },
      });
      return groupMembershipRecord(updated);
    });
  }
}

export class PrismaServiceReferralRewardRepository implements ServiceReferralRewardRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async completeMilestone(
    input: Parameters<ServiceReferralRewardRepository['completeMilestone']>[0],
  ): Promise<ServiceReferralRewardGrant[]> {
    return this.client.$transaction(async (tx) => {
      const referredMembership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.referredUserId,
          status: 'ACTIVE',
          group: { status: 'ACTIVE' },
        },
        select: { id: true, userId: true },
      });
      if (referredMembership === null) return [];
      const referral = await tx.serviceReferral.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          referredMembershipId: referredMembership.id,
          status: { not: 'REJECTED' },
        },
        include: { referralCode: { select: { groupMembershipId: true, userId: true } } },
      });
      if (referral === null) return [];

      await tx.serviceReferral.update({
        where: { id: referral.id },
        data:
          input.milestone === 'ONBOARDING_COMPLETED'
            ? {
                status:
                  referral.firstPostReportedAt === null
                    ? 'ONBOARDING_COMPLETED'
                    : 'FIRST_POST_REPORTED',
                onboardingCompletedAt: referral.onboardingCompletedAt ?? input.now,
              }
            : {
                status: 'FIRST_POST_REPORTED',
                firstPostReportedAt: referral.firstPostReportedAt ?? input.now,
              },
      });

      const rules = await tx.serviceReferralRewardRule.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'ACTIVE',
          milestone: input.milestone,
        },
        orderBy: { createdAt: 'asc' },
      });
      const grants: ServiceReferralRewardGrant[] = [];
      const monthStart = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1));

      for (const rule of rules) {
        const beneficiary =
          rule.recipient === 'REFERRED'
            ? referredMembership
            : await tx.groupMembership.findFirst({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  id: referral.referralCode.groupMembershipId,
                  userId: referral.referralCode.userId,
                  status: 'ACTIVE',
                },
                select: { id: true, userId: true },
              });
        if (beneficiary === null) continue;
        if (rule.monthlyGrantLimit !== null) {
          const alreadyGranted = await tx.serviceReferralReward.count({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              ruleId: rule.id,
              beneficiaryMembershipId: beneficiary.id,
              status: 'GRANTED',
              grantedAt: { gte: monthStart },
            },
          });
          if (alreadyGranted >= rule.monthlyGrantLimit) continue;
        }

        const account = await tx.serviceCreditAccount.upsert({
          where: {
            workspaceId_groupId_groupMembershipId: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: beneficiary.id,
            },
          },
          create: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: beneficiary.id,
            userId: beneficiary.userId,
          },
          update: {},
          select: { id: true },
        });
        const reward = await tx.serviceReferralReward.createMany({
          data: [
            {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              referralId: referral.id,
              ruleId: rule.id,
              beneficiaryAccountId: account.id,
              beneficiaryUserId: beneficiary.userId,
              beneficiaryMembershipId: beneficiary.id,
              status: 'GRANTED',
              creditAmount: rule.creditAmount,
              grantedAt: input.now,
            },
          ],
          skipDuplicates: true,
        });
        if (reward.count === 0) continue;
        const updatedAccount = await tx.serviceCreditAccount.update({
          where: { id: account.id },
          data: { availableCredits: { increment: rule.creditAmount }, revision: { increment: 1 } },
          select: { availableCredits: true },
        });
        await tx.serviceCreditLedger.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            accountId: account.id,
            userId: beneficiary.userId,
            type: 'GRANT',
            amount: rule.creditAmount,
            balanceAfter: updatedAccount.availableCredits,
            sourceType: 'REFERRAL',
            sourceId: referral.id,
            idempotencyKey: `referral:${referral.id}:rule:${rule.id}:membership:${beneficiary.id}`,
            expiresAt:
              rule.expiresAfterDays === null
                ? null
                : new Date(input.now.getTime() + rule.expiresAfterDays * 24 * 60 * 60 * 1000),
          },
        });
        grants.push({
          ruleId: rule.id,
          beneficiaryMembershipId: beneficiary.id,
          creditAmount: rule.creditAmount,
        });
      }
      return grants;
    });
  }
}

/**
 * The account is optional so legacy services can keep their point or badge
 * entitlement flow. Once a member has a service credit account, a social
 * image request consumes exactly one credit under a request-specific key.
 */
export class PrismaServiceCreditConsumptionRepository implements ServiceCreditConsumptionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async consumeForSocialImage(
    input: Parameters<ServiceCreditConsumptionRepository['consumeForSocialImage']>[0],
  ): Promise<ServiceCreditConsumptionResult> {
    return this.client.$transaction(async (tx) => {
      const account = await tx.serviceCreditAccount.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          userId: input.userId,
        },
        select: { id: true, availableCredits: true },
      });
      if (account === null) return { status: 'NOT_CONFIGURED' };

      const existing = await tx.serviceCreditLedger.findUnique({
        where: {
          accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey },
        },
        select: { type: true, balanceAfter: true },
      });
      if (existing?.type === 'CONSUME')
        return { status: 'CONSUMED', availableCredits: existing.balanceAfter };
      if (existing !== null) throw new Error('service credit idempotency key conflict');

      const consumed = await tx.serviceCreditAccount.updateMany({
        where: {
          id: account.id,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          userId: input.userId,
          availableCredits: { gte: 1 },
        },
        data: { availableCredits: { decrement: 1 }, revision: { increment: 1 } },
      });
      if (consumed.count === 0) return { status: 'INSUFFICIENT' };
      const updated = await tx.serviceCreditAccount.findUniqueOrThrow({
        where: { id: account.id },
        select: { availableCredits: true },
      });
      await tx.serviceCreditLedger.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          accountId: account.id,
          userId: input.userId,
          type: 'CONSUME',
          amount: -1,
          balanceAfter: updated.availableCredits,
          sourceType: 'SYSTEM',
          sourceId: input.imageRequestId,
          idempotencyKey: input.idempotencyKey,
          expiresAt: null,
          createdAt: input.now,
        },
      });
      return { status: 'CONSUMED', availableCredits: updated.availableCredits };
    });
  }

  async refundSocialImage(
    input: Parameters<ServiceCreditConsumptionRepository['refundSocialImage']>[0],
  ): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const account = await tx.serviceCreditAccount.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          userId: input.userId,
        },
        select: { id: true },
      });
      if (account === null) return;
      const alreadyRefunded = await tx.serviceCreditLedger.findUnique({
        where: {
          accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey },
        },
        select: { id: true },
      });
      if (alreadyRefunded !== null) return;
      const sourceConsumption = await tx.serviceCreditLedger.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          accountId: account.id,
          userId: input.userId,
          type: 'CONSUME',
          sourceId: input.imageRequestId,
        },
        select: { id: true },
      });
      if (sourceConsumption === null) return;
      const updated = await tx.serviceCreditAccount.update({
        where: { id: account.id },
        data: { availableCredits: { increment: 1 }, revision: { increment: 1 } },
        select: { availableCredits: true },
      });
      await tx.serviceCreditLedger.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          accountId: account.id,
          userId: input.userId,
          type: 'REFUND',
          amount: 1,
          balanceAfter: updated.availableCredits,
          sourceType: 'SYSTEM',
          sourceId: input.imageRequestId,
          idempotencyKey: input.idempotencyKey,
          expiresAt: null,
          createdAt: input.now,
        },
      });
    });
  }
}

/** Expiry is derived from append-only entries so a spent grant is never expired twice. */
export class PrismaServiceCreditExpirationRepository implements ServiceCreditExpirationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async expire(input: Parameters<ServiceCreditExpirationRepository['expire']>[0]) {
    const accounts = await this.client.serviceCreditAccount.findMany({
      where: {
        ledgerEntries: { some: { type: 'GRANT', expiresAt: { lte: input.now } } },
      },
      select: { id: true, workspaceId: true, groupId: true, groupMembershipId: true, userId: true },
      take: input.limit,
    });
    let expired = 0;
    for (const account of accounts) {
      expired += await this.client.$transaction(
        async (tx) => {
          const entries = await tx.serviceCreditLedger.findMany({
            where: {
              accountId: account.id,
              workspaceId: account.workspaceId,
              groupId: account.groupId,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, type: true, amount: true, expiresAt: true, sourceId: true },
          });
          const lots = new Map<string, { remaining: number; expiresAt: Date | null }>();
          const consume = (amount: number) => {
            let remaining = amount;
            const candidates = [...lots.entries()]
              .filter(([, lot]) => lot.remaining > 0)
              .sort(([, left], [, right]) => {
                if (left.expiresAt === null) return right.expiresAt === null ? 0 : 1;
                if (right.expiresAt === null) return -1;
                return left.expiresAt.getTime() - right.expiresAt.getTime();
              });
            for (const [, lot] of candidates) {
              const used = Math.min(lot.remaining, remaining);
              lot.remaining -= used;
              remaining -= used;
              if (remaining === 0) break;
            }
          };
          for (const entry of entries) {
            if (entry.type === 'GRANT')
              lots.set(entry.id, { remaining: entry.amount, expiresAt: entry.expiresAt });
            else if (entry.type === 'CONSUME' || (entry.type === 'ADJUST' && entry.amount < 0))
              consume(-entry.amount);
            else if (entry.type === 'REFUND' || (entry.type === 'ADJUST' && entry.amount > 0))
              lots.set(entry.id, { remaining: entry.amount, expiresAt: null });
            else if (entry.type === 'EXPIRE' && entry.sourceId?.startsWith('grant:')) {
              const grant = lots.get(entry.sourceId.slice('grant:'.length));
              if (grant) grant.remaining = Math.max(0, grant.remaining + entry.amount);
            }
          }
          const expiredLots = [...lots.entries()].filter(
            ([, lot]) => lot.remaining > 0 && lot.expiresAt !== null && lot.expiresAt <= input.now,
          );
          const amount = expiredLots.reduce((sum, [, lot]) => sum + lot.remaining, 0);
          if (amount === 0) return 0;
          const updated = await tx.serviceCreditAccount.update({
            where: { id: account.id },
            data: { availableCredits: { decrement: amount }, revision: { increment: 1 } },
            select: { availableCredits: true },
          });
          for (const [grantId, lot] of expiredLots) {
            await tx.serviceCreditLedger.create({
              data: {
                workspaceId: account.workspaceId,
                groupId: account.groupId,
                accountId: account.id,
                userId: account.userId,
                type: 'EXPIRE',
                amount: -lot.remaining,
                balanceAfter: updated.availableCredits,
                sourceType: 'SYSTEM',
                sourceId: `grant:${grantId}`,
                idempotencyKey: `expire:grant:${grantId}`,
                expiresAt: null,
                createdAt: input.now,
              },
            });
          }
          return amount;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }
    return expired;
  }
}

export class PrismaServiceCreditAdjustmentRepository implements ServiceCreditAdjustmentRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async adjust(input: Parameters<ServiceCreditAdjustmentRepository['adjust']>[0]) {
    return this.client.$transaction(async (tx) => {
      const actor = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
        },
        select: { id: true },
      });
      const member = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          id: input.membershipId,
          status: 'ACTIVE',
          serviceRole: 'PARTICIPANT',
        },
        select: { id: true, userId: true },
      });
      if (!actor || !member) return null;
      let account = await tx.serviceCreditAccount.findUnique({
        where: {
          workspaceId_groupId_groupMembershipId: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: member.id,
          },
        },
        select: { id: true, availableCredits: true },
      });
      if (!account && input.amount < 0) return null;
      if (!account) {
        account = await tx.serviceCreditAccount.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: member.id,
            userId: member.userId,
          },
          select: { id: true, availableCredits: true },
        });
      }
      if (account.availableCredits + input.amount < 0) return null;
      const existing = await tx.serviceCreditLedger.findUnique({
        where: {
          accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey },
        },
        select: { balanceAfter: true },
      });
      if (existing) return { availableCredits: existing.balanceAfter };
      const updated = await tx.serviceCreditAccount.update({
        where: { id: account.id },
        data: { availableCredits: { increment: input.amount }, revision: { increment: 1 } },
        select: { availableCredits: true },
      });
      await tx.serviceCreditLedger.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          accountId: account.id,
          userId: member.userId,
          type: 'ADJUST',
          amount: input.amount,
          balanceAfter: updated.availableCredits,
          sourceType: 'ADMIN',
          sourceId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          expiresAt: null,
          createdAt: input.now,
        },
      });
      const configuration = await tx.serviceConfiguration.findFirst({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        select: { id: true },
      });
      if (configuration)
        await tx.serviceConfigurationAudit.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            configurationId: configuration.id,
            action: 'SERVICE_CREDIT_ADJUSTED',
            beforeData: { availableCredits: account.availableCredits },
            afterData: {
              membershipId: member.id,
              amount: input.amount,
              availableCredits: updated.availableCredits,
            },
            reason: input.reason,
            performedByUserId: input.actorUserId,
            occurredAt: input.now,
          },
        });
      return updated;
    });
  }
}

export class PrismaServiceReferralRewardRuleRepository implements ServiceReferralRewardRuleRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listCurrent(input: { workspaceId: string; groupId: string }) {
    const rows = await this.client.serviceReferralRewardRule.findMany({
      where: { workspaceId: input.workspaceId, groupId: input.groupId },
      orderBy: [{ ruleKey: 'asc' }, { version: 'desc' }],
    });
    const current = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!current.has(row.ruleKey)) current.set(row.ruleKey, row);
    }
    return [...current.values()].map((row) => ({
      id: row.id,
      ruleKey: row.ruleKey,
      version: row.version,
      status: row.status as ServiceReferralRewardRuleRecord['status'],
      milestone: row.milestone,
      recipient: row.recipient,
      creditAmount: row.creditAmount,
      expiresAfterDays: row.expiresAfterDays,
      monthlyGrantLimit: row.monthlyGrantLimit,
      createdAt: row.createdAt,
    }));
  }

  async saveVersion(
    input: Parameters<ServiceReferralRewardRuleRepository['saveVersion']>[0],
  ): Promise<ServiceReferralRewardRuleRecord> {
    return this.client.$transaction(async (tx) => {
      const latest = await tx.serviceReferralRewardRule.aggregate({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ruleKey: input.rule.ruleKey,
        },
        _max: { version: true },
      });
      await tx.serviceReferralRewardRule.updateMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ruleKey: input.rule.ruleKey,
          status: { in: ['DRAFT', 'ACTIVE', 'SUSPENDED'] },
        },
        data: { status: 'SUPERSEDED', supersededAt: input.now },
      });
      const created = await tx.serviceReferralRewardRule.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ruleKey: input.rule.ruleKey,
          version: (latest._max.version ?? 0) + 1,
          status: input.status,
          milestone: input.rule.milestone,
          recipient: input.rule.recipient,
          creditAmount: input.rule.creditAmount,
          expiresAfterDays: input.rule.expiresAfterDays ?? null,
          monthlyGrantLimit: input.rule.monthlyGrantLimit ?? null,
          createdByUserId: input.actorUserId,
        },
      });
      return {
        id: created.id,
        ruleKey: created.ruleKey,
        version: created.version,
        status: created.status as ServiceReferralRewardRuleRecord['status'],
        milestone: created.milestone,
        recipient: created.recipient,
        creditAmount: created.creditAmount,
        expiresAfterDays: created.expiresAfterDays,
        monthlyGrantLimit: created.monthlyGrantLimit,
        createdAt: created.createdAt,
      };
    });
  }
}

export class PrismaGroupParticipationRepository implements GroupParticipationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async canManageWorkspace(workspaceId: string, actorUserId: string) {
    return this.client.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: actorUserId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
        workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  private async canManageGroup(workspaceId: string, groupId: string, actorUserId: string) {
    const [workspaceManager, platformAdmin] = await Promise.all([
      this.canManageWorkspace(workspaceId, actorUserId),
      this.client.platformAdmin.findFirst({
        where: {
          userId: actorUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
        },
        select: { id: true },
      }),
    ]);
    if (workspaceManager !== null || platformAdmin !== null) return true;
    return Boolean(
      await this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          OR: [
            { role: 'MANAGER' },
            {
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
              group: { serviceConfiguration: { isNot: null } },
            },
          ],
          status: 'ACTIVE',
          group: { workspaceId, status: 'ACTIVE' },
          workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
        },
        select: { id: true },
      }),
    );
  }

  async createGroup(input: Parameters<GroupParticipationRepository['createGroup']>[0]) {
    if ((await this.canManageWorkspace(input.workspaceId, input.actorUserId)) === null) return null;
    const created = await this.client.$transaction(
      async (tx) => {
        const now = new Date();
        const entitlement = await tx.organizationEntitlement.findUnique({
          where: { workspaceId: input.workspaceId },
          select: { maxGroups: true, suspended: true, startsAt: true, endsAt: true },
        });
        if (
          entitlement?.suspended ||
          (entitlement?.startsAt && entitlement.startsAt > now) ||
          (entitlement?.endsAt && entitlement.endsAt <= now)
        )
          return null;
        if (entitlement?.maxGroups !== null && entitlement?.maxGroups !== undefined) {
          const count = await tx.group.count({
            where: { workspaceId: input.workspaceId, status: 'ACTIVE' },
          });
          if (count >= entitlement.maxGroups) return null;
        }
        const group = await tx.group.create({
          data: { workspaceId: input.workspaceId, name: input.name },
        });
        await tx.groupMembership.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: group.id,
            userId: input.actorUserId,
            role: 'MANAGER',
            serviceRole: 'SERVICE_OWNER',
            status: 'ACTIVE',
            consentedAt: new Date(),
          },
        });
        return group;
      },
      { isolationLevel: 'Serializable' },
    );
    return created ? groupRecord(created) : null;
  }

  async createInvitation(input: Parameters<GroupParticipationRepository['createInvitation']>[0]) {
    if (!(await this.canManageGroup(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    const group = await this.client.group.findFirst({
      where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (group === null) return null;
    const created = await this.client.groupInvitation.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        tokenHash: input.tokenHash,
        role: input.role,
        expiresAt: input.expiresAt,
        maxUses: input.maxUses,
        createdByUserId: input.actorUserId,
      },
    });
    return groupInvitationRecord(created);
  }

  async acceptInvitation(input: Parameters<GroupParticipationRepository['acceptInvitation']>[0]) {
    return this.client.$transaction(async (tx) => {
      const invitation = await tx.groupInvitation.findFirst({
        where: {
          tokenHash: input.tokenHash,
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          expiresAt: { gt: input.now },
          group: { status: 'ACTIVE' },
        },
      });
      if (invitation === null || invitation.usedCount >= invitation.maxUses) return null;
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: input.workspaceId },
        select: { maxMembers: true, suspended: true, startsAt: true, endsAt: true },
      });
      if (
        entitlement?.suspended ||
        (entitlement?.startsAt && entitlement.startsAt > input.now) ||
        (entitlement?.endsAt && entitlement.endsAt <= input.now)
      )
        return null;
      const existingActiveGroupMembership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (entitlement?.maxMembers && existingActiveGroupMembership === null) {
        const activeMembers = await tx.groupMembership.findMany({
          where: { workspaceId: input.workspaceId, status: 'ACTIVE' },
          distinct: ['userId'],
          select: { userId: true },
        });
        if (activeMembers.length >= entitlement.maxMembers) return null;
      }
      const existingWorkspaceMembership = await tx.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
          },
        },
      });
      if (existingWorkspaceMembership !== null && existingWorkspaceMembership.status !== 'ACTIVE')
        return null;
      if (existingWorkspaceMembership === null) {
        await tx.workspaceMembership.create({
          data: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            role: 'MEMBER',
          },
        });
      }
      const consumed = await tx.groupInvitation.updateMany({
        where: { id: invitation.id, status: 'ACTIVE', usedCount: invitation.usedCount },
        data: { usedCount: { increment: 1 } },
      });
      if (consumed.count !== 1) return null;
      const nextUses = invitation.usedCount + 1;
      if (nextUses >= invitation.maxUses) {
        await tx.groupInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXHAUSTED' },
        });
      }
      const membership = await tx.groupMembership.upsert({
        where: { groupId_userId: { groupId: invitation.groupId, userId: input.actorUserId } },
        create: {
          workspaceId: input.workspaceId,
          groupId: invitation.groupId,
          userId: input.actorUserId,
          role: invitation.role,
          serviceRole: invitation.role === 'MANAGER' ? 'SERVICE_ADMIN' : 'PARTICIPANT',
          status: 'ACTIVE',
          consentedAt: input.now,
        },
        update: {
          role: invitation.role,
          serviceRole: invitation.role === 'MANAGER' ? 'SERVICE_ADMIN' : 'PARTICIPANT',
          status: 'ACTIVE',
          consentedAt: input.now,
          declinedAt: null,
          revokedAt: null,
        },
      });
      return groupMembershipRecord(membership);
    });
  }

  async declineInvitation(input: Parameters<GroupParticipationRepository['declineInvitation']>[0]) {
    return this.client.$transaction(async (tx) => {
      const invitation = await tx.groupInvitation.findFirst({
        where: {
          tokenHash: input.tokenHash,
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          expiresAt: { gt: input.now },
        },
      });
      if (invitation === null || invitation.usedCount >= invitation.maxUses) return null;
      const consumed = await tx.groupInvitation.updateMany({
        where: { id: invitation.id, status: 'ACTIVE', usedCount: invitation.usedCount },
        data: { usedCount: { increment: 1 }, status: 'EXHAUSTED' },
      });
      if (consumed.count !== 1) return null;
      const membership = await tx.groupMembership.upsert({
        where: { groupId_userId: { groupId: invitation.groupId, userId: input.actorUserId } },
        create: {
          workspaceId: input.workspaceId,
          groupId: invitation.groupId,
          userId: input.actorUserId,
          role: invitation.role,
          status: 'DECLINED',
          declinedAt: input.now,
        },
        update: { status: 'DECLINED', consentedAt: null, declinedAt: input.now },
      });
      return groupMembershipRecord(membership);
    });
  }

  async leaveGroup(input: Parameters<GroupParticipationRepository['leaveGroup']>[0]) {
    const membership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
      },
    });
    if (membership === null) return null;
    return groupMembershipRecord(
      await this.client.groupMembership.update({
        where: { id: membership.id },
        data: { status: 'REVOKED', revokedAt: input.now },
      }),
    );
  }

  async listMemberships(input: Parameters<GroupParticipationRepository['listMemberships']>[0]) {
    const workspaceMembership = await this.client.workspaceMembership.findFirst({
      where: { workspaceId: input.workspaceId, userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (workspaceMembership === null) return null;
    const rows = await this.client.groupMembership.findMany({
      where: { workspaceId: input.workspaceId, userId: input.actorUserId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(groupMembershipRecord);
  }

  async updateMembership(input: Parameters<GroupParticipationRepository['updateMembership']>[0]) {
    return this.client.$transaction(async (tx) => {
      const [workspaceManager, platformAdmin, groupManager] = await Promise.all([
        tx.workspaceMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            status: 'ACTIVE',
            role: { in: ['OWNER', 'ADMIN'] },
          },
          select: { id: true },
        }),
        tx.platformAdmin.findFirst({
          where: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
          },
          select: { id: true },
        }),
        tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.actorUserId,
            role: 'MANAGER',
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
      ]);
      const elevated = workspaceManager !== null || platformAdmin !== null;
      if (!elevated && groupManager === null) return null;

      const target = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          group: { status: 'ACTIVE' },
        },
      });
      if (target === null) return null;

      // A group manager can suspend/restart participants, but only an organization or
      // system administrator can appoint managers or change another manager.
      if (!elevated && (target.role === 'MANAGER' || input.role === 'MANAGER')) return null;

      const removesActiveManager =
        target.role === 'MANAGER' &&
        target.status === 'ACTIVE' &&
        (input.role !== 'MANAGER' || input.status !== 'ACTIVE');
      if (removesActiveManager) {
        const activeManagers = await tx.groupMembership.count({
          where: { groupId: input.groupId, role: 'MANAGER', status: 'ACTIVE' },
        });
        if (activeManagers <= 1) return null;
      }

      const updated = await tx.groupMembership.update({
        where: { id: target.id },
        data: {
          role: input.role,
          status: input.status,
          revokedAt: input.status === 'REVOKED' ? input.now : null,
        },
      });
      const action =
        input.status === 'SUSPENDED'
          ? 'SUSPENDED'
          : input.status === 'REVOKED'
            ? 'REVOKED'
            : target.status !== 'ACTIVE'
              ? 'REACTIVATED'
              : 'ROLE_CHANGED';
      await tx.groupMembershipAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: target.id,
          action,
          beforeData: { role: target.role, status: target.status },
          afterData: { role: updated.role, status: updated.status },
          reason: input.reason,
          performedByUserId: input.actorUserId,
          occurredAt: input.now,
        },
      });
      return groupMembershipRecord(updated);
    });
  }
}

const featurePolicyRecord = (
  row: Prisma.GroupFeaturePolicyGetPayload<object>,
): GroupFeaturePolicyRecord => ({ ...row, config: row.config });

const memberFeatureAssignmentRecord = (
  row: Prisma.GroupMemberFeatureAssignmentGetPayload<object>,
): GroupMemberFeatureAssignmentRecord => ({ ...row, config: row.config });

const activeAt = (startsAt: Date | null, endsAt: Date | null, now: Date) =>
  (startsAt === null || startsAt <= now) && (endsAt === null || endsAt > now);

const lowestLimit = (values: Array<number | null>) => {
  const limits = values.filter((value): value is number => value !== null);
  return limits.length === 0 ? null : Math.min(...limits);
};

export class PrismaGroupFeatureEntitlementRepository implements GroupFeatureEntitlementRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listDefinitions() {
    return this.client.featureDefinition.findMany({
      select: { key: true, parentKey: true, name: true, description: true, status: true },
      orderBy: [{ parentKey: 'asc' }, { key: 'asc' }],
    });
  }

  async setGroupPolicy(input: Parameters<GroupFeatureEntitlementRepository['setGroupPolicy']>[0]) {
    const [admin, group, feature] = await Promise.all([
      this.client.platformAdmin.findFirst({
        where: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
        },
        select: { id: true },
      }),
      this.client.group.findFirst({
        where: {
          id: input.groupId,
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
        },
        select: { id: true },
      }),
      this.client.featureDefinition.findFirst({
        where: { key: input.featureKey, status: 'ACTIVE' },
        select: { key: true },
      }),
    ]);
    if (!admin || !group || !feature) return null;
    return this.client.$transaction(async (tx) => {
      const before = await tx.groupFeaturePolicy.findUnique({
        where: { groupId_featureKey: { groupId: input.groupId, featureKey: input.featureKey } },
      });
      const policy = await tx.groupFeaturePolicy.upsert({
        where: { groupId_featureKey: { groupId: input.groupId, featureKey: input.featureKey } },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          featureKey: input.featureKey,
          status: input.status,
          dailyLimit: input.dailyLimit ?? null,
          monthlyLimit: input.monthlyLimit ?? null,
          config: input.config as Prisma.InputJsonValue,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          setByUserId: input.actorUserId,
        },
        update: {
          status: input.status,
          dailyLimit: input.dailyLimit ?? null,
          monthlyLimit: input.monthlyLimit ?? null,
          config: input.config as Prisma.InputJsonValue,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          setByUserId: input.actorUserId,
        },
      });
      await tx.groupFeatureAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          featureKey: input.featureKey,
          action: 'GROUP_POLICY_SET',
          beforeData: before
            ? {
                status: before.status,
                dailyLimit: before.dailyLimit,
                monthlyLimit: before.monthlyLimit,
              }
            : Prisma.JsonNull,
          afterData: {
            status: policy.status,
            dailyLimit: policy.dailyLimit,
            monthlyLimit: policy.monthlyLimit,
          },
          reason: input.reason,
          performedByUserId: input.actorUserId,
        },
      });
      return featurePolicyRecord(policy);
    });
  }

  async setMemberAssignment(
    input: Parameters<GroupFeatureEntitlementRepository['setMemberAssignment']>[0],
  ) {
    const [manager, target, policy] = await Promise.all([
      this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          OR: [
            { role: 'MANAGER' },
            {
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
              group: { serviceConfiguration: { isNot: null } },
            },
          ],
          status: 'ACTIVE',
          group: { status: 'ACTIVE' },
          workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
        },
        select: { id: true },
      }),
      this.client.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
      this.client.groupFeaturePolicy.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          featureKey: input.featureKey,
          feature: { status: 'ACTIVE' },
        },
      }),
    ]);
    if (!manager || !target || !policy) return null;
    if (input.status === 'ENABLED' && policy.status !== 'ENABLED') return null;
    if (
      (policy.dailyLimit !== null &&
        input.dailyLimit !== null &&
        input.dailyLimit !== undefined &&
        input.dailyLimit > policy.dailyLimit) ||
      (policy.monthlyLimit !== null &&
        input.monthlyLimit !== null &&
        input.monthlyLimit !== undefined &&
        input.monthlyLimit > policy.monthlyLimit)
    )
      return null;
    return this.client.$transaction(async (tx) => {
      const before = await tx.groupMemberFeatureAssignment.findUnique({
        where: {
          groupMembershipId_featureKey: {
            groupMembershipId: input.groupMembershipId,
            featureKey: input.featureKey,
          },
        },
      });
      const assignment = await tx.groupMemberFeatureAssignment.upsert({
        where: {
          groupMembershipId_featureKey: {
            groupMembershipId: input.groupMembershipId,
            featureKey: input.featureKey,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          featureKey: input.featureKey,
          status: input.status,
          dailyLimit: input.dailyLimit ?? null,
          monthlyLimit: input.monthlyLimit ?? null,
          config: input.config as Prisma.InputJsonValue,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          assignedByUserId: input.actorUserId,
        },
        update: {
          status: input.status,
          dailyLimit: input.dailyLimit ?? null,
          monthlyLimit: input.monthlyLimit ?? null,
          config: input.config as Prisma.InputJsonValue,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          assignedByUserId: input.actorUserId,
        },
      });
      await tx.groupFeatureAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          featureKey: input.featureKey,
          action: 'MEMBER_ASSIGNMENT_SET',
          beforeData: before
            ? {
                status: before.status,
                dailyLimit: before.dailyLimit,
                monthlyLimit: before.monthlyLimit,
              }
            : Prisma.JsonNull,
          afterData: {
            status: assignment.status,
            dailyLimit: assignment.dailyLimit,
            monthlyLimit: assignment.monthlyLimit,
          },
          reason: input.reason,
          performedByUserId: input.actorUserId,
        },
      });
      return memberFeatureAssignmentRecord(assignment);
    });
  }

  async resolveAccess(
    input: Parameters<GroupFeatureEntitlementRepository['resolveAccess']>[0],
  ): Promise<EffectiveGroupFeatureAccess | null> {
    return this.resolveAccessWith(this.client, input);
  }

  private async resolveAccessWith(
    client: PrismaClient | Prisma.TransactionClient,
    input: Parameters<GroupFeatureEntitlementRepository['resolveAccess']>[0],
  ): Promise<EffectiveGroupFeatureAccess | null> {
    const membership = await client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        group: { status: 'ACTIVE' },
        workspace: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!membership) return null;
    const requiredKeys: string[] = [];
    const visitedKeys = new Set<string>();
    let currentKey: string | null = input.featureKey;
    while (currentKey) {
      if (visitedKeys.has(currentKey) || requiredKeys.length >= 16)
        return this.denied('FEATURE_UNAVAILABLE');
      visitedKeys.add(currentKey);
      const definition: {
        key: string;
        parentKey: string | null;
        status: 'ACTIVE' | 'RETIRED';
      } | null = await client.featureDefinition.findUnique({
        where: { key: currentKey },
        select: { key: true, parentKey: true, status: true },
      });
      if (!definition || definition.status !== 'ACTIVE') return this.denied('FEATURE_UNAVAILABLE');
      requiredKeys.push(definition.key);
      currentKey = definition.parentKey;
    }
    const [policies, assignments] = await Promise.all([
      client.groupFeaturePolicy.findMany({
        where: { groupId: input.groupId, featureKey: { in: requiredKeys } },
      }),
      client.groupMemberFeatureAssignment.findMany({
        where: { groupMembershipId: membership.id, featureKey: { in: requiredKeys } },
      }),
    ]);
    if (
      requiredKeys.some(
        (key) => !policies.some((value) => value.featureKey === key && value.status === 'ENABLED'),
      )
    )
      return this.denied('GROUP_NOT_ALLOWED');
    if (
      requiredKeys.some(
        (key) =>
          !assignments.some((value) => value.featureKey === key && value.status === 'ENABLED'),
      )
    )
      return this.denied('MEMBER_NOT_ALLOWED');
    if (
      [...policies, ...assignments].some(
        ({ startsAt, endsAt }) => !activeAt(startsAt, endsAt, input.now),
      )
    )
      return this.denied('OUTSIDE_VALIDITY_PERIOD');
    return {
      allowed: true,
      reason: 'ALLOWED',
      dailyLimit: lowestLimit([
        ...policies.map(({ dailyLimit }) => dailyLimit),
        ...assignments.map(({ dailyLimit }) => dailyLimit),
      ]),
      monthlyLimit: lowestLimit([
        ...policies.map(({ monthlyLimit }) => monthlyLimit),
        ...assignments.map(({ monthlyLimit }) => monthlyLimit),
      ]),
    };
  }

  async consumeAccess(
    input: Parameters<GroupFeatureEntitlementRepository['consumeAccess']>[0],
  ): Promise<EffectiveGroupFeatureAccess | null> {
    return this.client.$transaction(
      async (tx) => {
        const membership = await tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.actorUserId,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (!membership) return null;
        const existing = await tx.groupFeatureUsageEvent.findUnique({
          where: {
            groupMembershipId_featureKey_operationKey: {
              groupMembershipId: membership.id,
              featureKey: input.featureKey,
              operationKey: input.operationKey,
            },
          },
        });
        const access = await this.resolveAccessWith(tx, input);
        if (!access || !access.allowed) return access;
        const localMonth = input.localDate.slice(0, 7);
        const [dailyUsed, monthlyUsed] = await Promise.all([
          tx.groupFeatureUsageEvent.count({
            where: {
              groupMembershipId: membership.id,
              featureKey: input.featureKey,
              localDate: input.localDate,
            },
          }),
          tx.groupFeatureUsageEvent.count({
            where: {
              groupMembershipId: membership.id,
              featureKey: input.featureKey,
              localMonth,
            },
          }),
        ]);
        if (existing)
          return {
            ...access,
            dailyUsed,
            monthlyUsed,
            alreadyConsumed: true,
          };
        if (access.dailyLimit !== null && dailyUsed >= access.dailyLimit)
          return {
            ...this.denied('DAILY_LIMIT_REACHED'),
            dailyUsed,
            monthlyUsed,
          };
        if (access.monthlyLimit !== null && monthlyUsed >= access.monthlyLimit)
          return {
            ...this.denied('MONTHLY_LIMIT_REACHED'),
            dailyUsed,
            monthlyUsed,
          };
        await tx.groupFeatureUsageEvent.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: membership.id,
            featureKey: input.featureKey,
            actorUserId: input.actorUserId,
            operationKey: input.operationKey,
            localDate: input.localDate,
            localMonth,
            occurredAt: input.now,
          },
        });
        return {
          ...access,
          dailyUsed: dailyUsed + 1,
          monthlyUsed: monthlyUsed + 1,
          alreadyConsumed: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private denied(reason: EffectiveGroupFeatureAccess['reason']): EffectiveGroupFeatureAccess {
    return { allowed: false, reason, dailyLimit: null, monthlyLimit: null };
  }
}

export class PrismaExternalTrackingLinkRepository implements ExternalTrackingLinkRepository {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly serviceId?: string,
  ) {}

  private async manage(workspaceId: string, actorUserId: string) {
    const workspaceManager = await this.client.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: actorUserId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
        workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (workspaceManager) return true;
    if (!this.serviceId) return false;
    return Boolean(
      await this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId: this.serviceId,
          userId: actorUserId,
          role: 'MANAGER',
          status: 'ACTIVE',
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      }),
    );
  }

  private serviceMatches(groupId: string) {
    return !this.serviceId || this.serviceId === groupId;
  }

  async listConfiguration(
    input: Parameters<ExternalTrackingLinkRepository['listConfiguration']>[0],
  ) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    if (!this.serviceMatches(input.groupId)) return null;
    const group = await this.client.group.findFirst({
      where: { id: input.groupId, workspaceId: input.workspaceId },
      select: { id: true, name: true, status: true },
    });
    if (!group) return null;
    const [systems, identities, links, audits, members, usages, products, campaigns] =
      await this.client.$transaction([
        this.client.externalTrackingSystem.findMany({
          where: { workspaceId: input.workspaceId, groupId: input.groupId },
          include: { allowedDomains: { orderBy: { hostname: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        }),
        this.client.externalTrackingMemberIdentity.findMany({
          where: { workspaceId: input.workspaceId, groupId: input.groupId },
          include: {
            groupMembership: { select: { id: true, userId: true, role: true, status: true } },
          },
          orderBy: { updatedAt: 'desc' },
        }),
        this.client.externalTrackingLink.findMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            status: { not: 'DELETED' },
          },
          include: {
            system: { select: { id: true, name: true, status: true } },
            allowedDomain: { select: { id: true, hostname: true, status: true } },
            memberIdentity: { select: { id: true, groupMembershipId: true } },
            productPack: { select: { id: true, name: true } },
            campaign: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: 'desc' },
        }),
        this.client.externalTrackingAuditLog.findMany({
          where: { workspaceId: input.workspaceId, groupId: input.groupId },
          orderBy: { performedAt: 'desc' },
          take: 100,
        }),
        this.client.groupMembership.findMany({
          where: { workspaceId: input.workspaceId, groupId: input.groupId, status: 'ACTIVE' },
          select: {
            id: true,
            role: true,
            consentedAt: true,
            user: { select: { id: true, displayName: true, email: true } },
          },
          orderBy: { user: { displayName: 'asc' } },
        }),
        this.client.contentLinkUsage.findMany({
          where: { workspaceId: input.workspaceId, groupId: input.groupId },
          select: {
            id: true,
            createdAt: true,
            insertedUrlSnapshot: true,
            linkNameSnapshot: true,
            expiresAtSnapshot: true,
            advertisingClassification: true,
            groupMembership: {
              select: { id: true, user: { select: { displayName: true } } },
            },
            productPack: { select: { id: true, name: true } },
            campaign: { select: { id: true, name: true } },
            dailyMission: { select: { id: true, missionDate: true, format: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        this.client.productPack.findMany({
          where: { workspaceId: input.workspaceId, groupId: input.groupId },
          select: { id: true, name: true, status: true },
          orderBy: { name: 'asc' },
        }),
        this.client.campaign.findMany({
          where: { workspaceId: input.workspaceId, groupId: input.groupId },
          select: { id: true, name: true, status: true },
          orderBy: { name: 'asc' },
        }),
      ]);
    return {
      group,
      systems,
      identities,
      links: links.map((link) => ({
        ...link,
        effectiveStatus:
          link.status === 'ACTIVE' && link.expiresAt && link.expiresAt <= input.at
            ? 'EXPIRED'
            : link.status,
      })),
      audits,
      members: members.map((member) => ({
        ...member,
        identityConfigured: identities.some(
          (identity) => identity.groupMembershipId === member.id && identity.status === 'ACTIVE',
        ),
        activeLinkCount: links.filter(
          (link) =>
            link.memberIdentity?.groupMembershipId === member.id &&
            link.status === 'ACTIVE' &&
            (!link.expiresAt || link.expiresAt > input.at),
        ).length,
      })),
      usages,
      products,
      campaigns,
    };
  }

  async getAllowedDomain(input: Parameters<ExternalTrackingLinkRepository['getAllowedDomain']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.externalTrackingAllowedDomain.findFirst({
      where: {
        id: input.allowedDomainId,
        workspaceId: input.workspaceId,
        status: 'ACTIVE',
        system: { status: 'ACTIVE', ...(this.serviceId ? { groupId: this.serviceId } : {}) },
      },
      select: {
        id: true,
        hostname: true,
        allowSubdomains: true,
        shortener: true,
        status: true,
      },
    });
  }

  async createSystem(input: Parameters<ExternalTrackingLinkRepository['createSystem']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    if (!this.serviceMatches(input.groupId)) return null;
    const group = await this.client.group.findFirst({
      where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!group) return null;
    return this.client.$transaction(async (tx) => {
      const created = await tx.externalTrackingSystem.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          name: input.name,
          systemType: input.systemType,
          externalSystemId: input.externalSystemId,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: created.workspaceId,
          groupId: created.groupId,
          resourceType: 'SYSTEM',
          resourceId: created.id,
          action: 'CREATED',
          afterData: { name: created.name, systemType: created.systemType, status: created.status },
          performedByUserId: input.actorUserId,
        },
      });
      return created;
    });
  }

  async addAllowedDomain(input: Parameters<ExternalTrackingLinkRepository['addAllowedDomain']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    const system = await this.client.externalTrackingSystem.findFirst({
      where: {
        id: input.systemId,
        workspaceId: input.workspaceId,
        status: 'ACTIVE',
        ...(this.serviceId ? { groupId: this.serviceId } : {}),
      },
    });
    if (!system) return null;
    return this.client.$transaction(async (tx) => {
      const created = await tx.externalTrackingAllowedDomain.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: system.groupId,
          systemId: system.id,
          hostname: input.hostname,
          allowSubdomains: input.allowSubdomains,
          shortener: input.shortener,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: created.workspaceId,
          groupId: created.groupId,
          resourceType: 'DOMAIN',
          resourceId: created.id,
          action: 'CREATED',
          afterData: {
            hostname: created.hostname,
            allowSubdomains: created.allowSubdomains,
            shortener: created.shortener,
            status: created.status,
          },
          performedByUserId: input.actorUserId,
        },
      });
      return created;
    });
  }

  async upsertMemberIdentity(
    input: Parameters<ExternalTrackingLinkRepository['upsertMemberIdentity']>[0],
  ) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const system = await tx.externalTrackingSystem.findFirst({
        where: {
          id: input.systemId,
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          ...(this.serviceId ? { groupId: this.serviceId } : {}),
        },
      });
      if (!system) return null;
      const membership = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: system.groupId,
          status: 'ACTIVE',
          consentedAt: { not: null },
        },
      });
      if (!membership) return null;
      const before = await tx.externalTrackingMemberIdentity.findUnique({
        where: {
          systemId_groupMembershipId: {
            systemId: system.id,
            groupMembershipId: membership.id,
          },
        },
      });
      const saved = await tx.externalTrackingMemberIdentity.upsert({
        where: {
          systemId_groupMembershipId: {
            systemId: system.id,
            groupMembershipId: membership.id,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          groupId: system.groupId,
          systemId: system.id,
          groupMembershipId: membership.id,
          commonUserId: input.commonUserId,
          agencyId: input.agencyId,
          externalMemberId: input.externalMemberId,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
        update: {
          commonUserId: input.commonUserId,
          agencyId: input.agencyId,
          externalMemberId: input.externalMemberId,
          status: 'ACTIVE',
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: saved.workspaceId,
          groupId: saved.groupId,
          resourceType: 'MEMBER_IDENTITY',
          resourceId: saved.id,
          action: before ? 'UPDATED' : 'CREATED',
          beforeData: before ? { status: before.status } : Prisma.JsonNull,
          afterData: {
            status: saved.status,
            hasCommonUserId: Boolean(saved.commonUserId),
            hasAgencyId: Boolean(saved.agencyId),
            hasExternalMemberId: Boolean(saved.externalMemberId),
          },
          performedByUserId: input.actorUserId,
        },
      });
      return saved;
    });
  }

  async createLink(input: Parameters<ExternalTrackingLinkRepository['createLink']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const system = await tx.externalTrackingSystem.findFirst({
        where: {
          id: input.systemId,
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          ...(this.serviceId ? { groupId: this.serviceId } : {}),
        },
      });
      if (!system) return null;
      const domain = await tx.externalTrackingAllowedDomain.findFirst({
        where: {
          id: input.allowedDomainId,
          workspaceId: input.workspaceId,
          groupId: system.groupId,
          systemId: system.id,
          status: 'ACTIVE',
        },
      });
      if (!domain) return null;
      if (input.memberIdentityId) {
        const member = await tx.externalTrackingMemberIdentity.findFirst({
          where: {
            id: input.memberIdentityId,
            workspaceId: input.workspaceId,
            groupId: system.groupId,
            systemId: system.id,
            status: 'ACTIVE',
          },
        });
        if (!member) return null;
      }
      if (
        input.productPackId &&
        !(await tx.productPack.findFirst({
          where: {
            id: input.productPackId,
            workspaceId: input.workspaceId,
            groupId: system.groupId,
          },
        }))
      )
        return null;
      if (
        input.campaignId &&
        !(await tx.campaign.findFirst({
          where: { id: input.campaignId, workspaceId: input.workspaceId, groupId: system.groupId },
        }))
      )
        return null;
      const created = await tx.externalTrackingLink.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: system.groupId,
          systemId: system.id,
          allowedDomainId: domain.id,
          memberIdentityId: input.memberIdentityId,
          productPackId: input.productPackId,
          campaignId: input.campaignId,
          scopeType: input.scopeType,
          scopeKey: input.scopeKey,
          name: input.name,
          externalLinkId: input.externalLinkId,
          referralToken: input.referralToken,
          url: input.url,
          startsAt: input.startsAt,
          expiresAt: input.expiresAt,
          notes: input.notes,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: created.workspaceId,
          groupId: created.groupId,
          resourceType: 'LINK',
          resourceId: created.id,
          action: 'CREATED',
          afterData: {
            name: created.name,
            scopeType: created.scopeType,
            scopeKey: created.scopeKey,
            status: created.status,
            allowedDomainId: created.allowedDomainId,
            startsAt: created.startsAt,
            expiresAt: created.expiresAt,
          },
          performedByUserId: input.actorUserId,
        },
      });
      return created;
    });
  }

  async activateLink(input: Parameters<ExternalTrackingLinkRepository['activateLink']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const link = await tx.externalTrackingLink.findFirst({
        where: {
          id: input.linkId,
          workspaceId: input.workspaceId,
          ...(this.serviceId ? { groupId: this.serviceId } : {}),
          status: { in: ['DRAFT', 'SUSPENDED'] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
          system: { status: 'ACTIVE' },
          allowedDomain: { status: 'ACTIVE' },
        },
      });
      if (!link) return null;
      const duplicate = await tx.externalTrackingLink.findFirst({
        where: {
          systemId: link.systemId,
          scopeKey: link.scopeKey,
          status: 'ACTIVE',
          deletedAt: null,
          id: { not: link.id },
        },
        select: { id: true },
      });
      if (duplicate) return null;
      const updated = await tx.externalTrackingLink.update({
        where: { id: link.id },
        data: {
          status: 'ACTIVE',
          activatedAt: input.now,
          suspendedAt: null,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: updated.workspaceId,
          groupId: updated.groupId,
          resourceType: 'LINK',
          resourceId: updated.id,
          action: 'ACTIVATED',
          beforeData: { status: link.status },
          afterData: { status: updated.status },
          performedByUserId: input.actorUserId,
        },
      });
      return updated;
    });
  }

  async suspendLink(input: Parameters<ExternalTrackingLinkRepository['suspendLink']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    const link = await this.client.externalTrackingLink.findFirst({
      where: {
        id: input.linkId,
        workspaceId: input.workspaceId,
        status: 'ACTIVE',
        ...(this.serviceId ? { groupId: this.serviceId } : {}),
      },
      select: { id: true },
    });
    if (!link) return null;
    return this.client.$transaction(async (tx) => {
      const updated = await tx.externalTrackingLink.update({
        where: { id: link.id },
        data: {
          status: 'SUSPENDED',
          suspendedAt: input.now,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: updated.workspaceId,
          groupId: updated.groupId,
          resourceType: 'LINK',
          resourceId: updated.id,
          action: 'SUSPENDED',
          beforeData: { status: 'ACTIVE' },
          afterData: { status: updated.status },
          performedByUserId: input.actorUserId,
        },
      });
      return updated;
    });
  }

  async updateLink(input: Parameters<ExternalTrackingLinkRepository['updateLink']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const link = await tx.externalTrackingLink.findFirst({
        where: {
          id: input.linkId,
          workspaceId: input.workspaceId,
          ...(this.serviceId ? { groupId: this.serviceId } : {}),
          status: { in: ['DRAFT', 'SUSPENDED'] },
        },
      });
      if (!link) return null;
      const domain = await tx.externalTrackingAllowedDomain.findFirst({
        where: {
          id: input.allowedDomainId,
          workspaceId: input.workspaceId,
          groupId: link.groupId,
          systemId: link.systemId,
          status: 'ACTIVE',
        },
      });
      if (!domain) return null;
      const updated = await tx.externalTrackingLink.update({
        where: { id: link.id },
        data: {
          allowedDomainId: domain.id,
          name: input.name,
          url: input.url,
          startsAt: input.startsAt,
          expiresAt: input.expiresAt,
          notes: input.notes,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: updated.workspaceId,
          groupId: updated.groupId,
          resourceType: 'LINK',
          resourceId: updated.id,
          action: 'UPDATED',
          beforeData: {
            name: link.name,
            allowedDomainId: link.allowedDomainId,
            startsAt: link.startsAt,
            expiresAt: link.expiresAt,
          },
          afterData: {
            name: updated.name,
            allowedDomainId: updated.allowedDomainId,
            startsAt: updated.startsAt,
            expiresAt: updated.expiresAt,
          },
          performedByUserId: input.actorUserId,
        },
      });
      return updated;
    });
  }

  async listResolutionCandidates(
    input: Parameters<ExternalTrackingLinkRepository['listResolutionCandidates']>[0],
  ) {
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!bunshin) return null;
    const membership = await this.client.groupMembership.findFirst({
      where: {
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
      },
    });
    if (!membership) return null;
    const assignment = await this.client.productPackAssignment.findFirst({
      where: {
        bunshinId: input.bunshinId,
        productPackId: input.productPackId,
        status: 'ACTIVE',
        productPack: { groupId: input.groupId },
      },
      select: { id: true },
    });
    if (!assignment) return null;
    if (input.campaignId) {
      const participation = await this.client.campaignParticipation.findFirst({
        where: {
          campaignId: input.campaignId,
          participantWorkspaceId: input.workspaceId,
          userId: input.actorUserId,
          bunshinId: input.bunshinId,
          status: 'ACCEPTED',
          campaign: {
            groupId: input.groupId,
            status: 'OPEN',
            startsAt: { lte: input.at },
            endsAt: { gt: input.at },
            productPackVersion: { productPackId: input.productPackId },
          },
        },
        select: { id: true },
      });
      if (!participation) return null;
    }
    const links = await this.client.externalTrackingLink.findMany({
      where: {
        workspaceId: membership.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        deletedAt: null,
        system: { status: 'ACTIVE' },
        allowedDomain: { status: 'ACTIVE' },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: input.at } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: input.at } }] },
        ],
        OR: [
          { scopeType: 'GROUP' },
          {
            scopeType: 'MEMBER',
            memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
          },
          { scopeType: 'PRODUCT', productPackId: input.productPackId },
          {
            scopeType: 'PRODUCT_MEMBER',
            productPackId: input.productPackId,
            memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
          },
          ...(input.campaignId
            ? [
                { scopeType: 'CAMPAIGN' as const, campaignId: input.campaignId },
                {
                  scopeType: 'CAMPAIGN_MEMBER' as const,
                  campaignId: input.campaignId,
                  memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' as const },
                },
              ]
            : []),
        ],
      },
      include: { system: true, allowedDomain: true, memberIdentity: true },
    });
    return {
      groupMembershipId: membership.id,
      links: links.map((link) => ({
        id: link.id,
        name: link.name,
        groupId: link.groupId,
        scopeType: link.scopeType,
        groupMembershipId: link.memberIdentity?.groupMembershipId ?? null,
        productPackId: link.productPackId,
        campaignId: link.campaignId,
        url: link.url,
        status: link.status,
        startsAt: link.startsAt,
        expiresAt: link.expiresAt,
        systemStatus: link.system.status,
        domain: {
          id: link.allowedDomain.id,
          hostname: link.allowedDomain.hostname,
          allowSubdomains: link.allowedDomain.allowSubdomains,
          shortener: link.allowedDomain.shortener,
          status: link.allowedDomain.status,
        },
      })),
    };
  }
}

export class PrismaExternalLinkPlacementRepository implements ExternalLinkPlacementRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private manage(workspaceId: string, actorUserId: string) {
    return this.client.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: actorUserId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
        workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  async list(input: Parameters<ExternalLinkPlacementRepository['list']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    const version = await this.client.productPackVersion.findFirst({
      where: {
        id: input.productPackVersionId,
        productPack: { workspaceId: input.workspaceId },
      },
      select: { id: true },
    });
    if (!version) return null;
    return this.client.externalLinkPlacementTemplate.findMany({
      where: { workspaceId: input.workspaceId, productPackVersionId: version.id },
      orderBy: [{ platform: 'asc' }, { format: 'asc' }],
    });
  }

  async upsert(input: Parameters<ExternalLinkPlacementRepository['upsert']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const productVersion = await tx.productPackVersion.findFirst({
        where: {
          id: input.productPackVersionId,
          status: 'DRAFT',
          productPack: { workspaceId: input.workspaceId },
        },
        include: { productPack: { select: { groupId: true } } },
      });
      if (!productVersion) return null;
      const key = {
        productPackVersionId_platform_format: {
          productPackVersionId: productVersion.id,
          platform: input.platform,
          format: input.format,
        },
      };
      const before = await tx.externalLinkPlacementTemplate.findUnique({ where: key });
      const saved = await tx.externalLinkPlacementTemplate.upsert({
        where: key,
        create: {
          workspaceId: input.workspaceId,
          groupId: productVersion.productPack.groupId,
          productPackVersionId: productVersion.id,
          platform: input.platform,
          format: input.format,
          target: input.target,
          template: input.template,
          urlLocked: true,
          status: input.status,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
        update: {
          target: input.target,
          template: input.template,
          urlLocked: true,
          status: input.status,
          version: { increment: 1 },
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: saved.workspaceId,
          groupId: saved.groupId,
          resourceType: 'PLACEMENT_TEMPLATE',
          resourceId: saved.id,
          action: before ? 'UPDATED' : 'CREATED',
          beforeData: before
            ? {
                platform: before.platform,
                format: before.format,
                target: before.target,
                status: before.status,
                version: before.version,
                templateHash: createHash('sha256').update(before.template).digest('hex'),
              }
            : Prisma.JsonNull,
          afterData: {
            platform: saved.platform,
            format: saved.format,
            target: saved.target,
            status: saved.status,
            version: saved.version,
            templateHash: createHash('sha256').update(saved.template).digest('hex'),
          },
          performedByUserId: input.actorUserId,
        },
      });
      return saved;
    });
  }

  async resolveForGeneration(
    input: Parameters<ExternalLinkPlacementRepository['resolveForGeneration']>[0],
  ) {
    const assignment = await this.client.productPackAssignment.findFirst({
      where: {
        productPackVersionId: input.productPackVersionId,
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
        bunshin: {
          workspaceId: input.workspaceId,
          ownerUserId: input.actorUserId,
          status: 'ACTIVE',
        },
        productPackVersion: { status: 'PUBLISHED' },
      },
      select: { id: true },
    });
    if (!assignment) return { accessible: false, placement: null };
    const placement = await this.client.externalLinkPlacementTemplate.findFirst({
      where: {
        workspaceId: input.workspaceId,
        productPackVersionId: input.productPackVersionId,
        platform: input.platform,
        format: input.format,
        status: 'ACTIVE',
        urlLocked: true,
      },
      select: { id: true, target: true, template: true, version: true },
    });
    return { accessible: true, placement };
  }
}

export class PrismaProductPackRepository implements ProductPackRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async manage(workspaceId: string, actorUserId: string, groupId?: string | null) {
    const workspaceManager = await this.client.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: actorUserId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
        workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (workspaceManager) return true;
    if (!groupId) return false;
    return Boolean(
      await this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          status: 'ACTIVE',
          OR: [
            { role: 'MANAGER' },
            {
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR'] },
              group: { serviceConfiguration: { isNot: null } },
            },
          ],
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      }),
    );
  }

  async list(input: Parameters<ProductPackRepository['list']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.productPack.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.groupId ? { groupId: input.groupId } : {}),
      },
      include: {
        group: { select: { id: true, name: true } },
        versions: { orderBy: { version: 'desc' }, include: { rules: true, assets: true } },
        assignments: { where: { status: 'ACTIVE' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(input: Parameters<ProductPackRepository['get']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.productPack.findFirst({
      where: {
        id: input.productPackId,
        workspaceId: input.workspaceId,
        ...(input.groupId ? { groupId: input.groupId } : {}),
      },
      include: {
        group: { select: { id: true, name: true } },
        versions: { orderBy: { version: 'desc' }, include: { rules: true, assets: true } },
        assignments: { include: { bunshin: { select: { id: true, name: true } } } },
      },
    });
  }

  async createPack(input: Parameters<ProductPackRepository['createPack']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    const group = await this.client.group.findFirst({
      where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!group) return null;
    return this.client.productPack.create({
      data: { workspaceId: input.workspaceId, groupId: input.groupId, name: input.name },
    });
  }

  async createDraftVersion(input: Parameters<ProductPackRepository['createDraftVersion']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.$transaction(async (tx) => {
      const pack = await tx.productPack.findFirst({
        where: {
          id: input.productPackId,
          workspaceId: input.workspaceId,
          status: { not: 'ARCHIVED' },
          ...(input.groupId ? { groupId: input.groupId } : {}),
        },
        include: { _count: { select: { versions: true } } },
      });
      if (!pack) return null;
      const c = input.content;
      return tx.productPackVersion.create({
        data: {
          productPackId: pack.id,
          version: pack._count.versions + 1,
          summary: c.summary,
          providerName: c.providerName,
          targetCustomer: c.targetCustomer,
          facts: c.facts,
          faq: c.faq,
          suitableFor: c.suitableFor,
          unsuitableFor: c.unsuitableFor,
          allowLinklessPosts: c.allowLinklessPosts ?? false,
          validFrom: c.validFrom ?? null,
          validUntil: c.validUntil ?? null,
          createdByUserId: input.actorUserId,
          rules: { create: c.rules.map((rule, sortOrder) => ({ ...rule, sortOrder })) },
          assets: {
            create: c.assets.map((asset) => ({ ...asset, validUntil: asset.validUntil ?? null })),
          },
        },
        include: { rules: true, assets: true },
      });
    });
  }

  async publishVersion(input: Parameters<ProductPackRepository['publishVersion']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.$transaction(async (tx) => {
      const draft = await tx.productPackVersion.findFirst({
        where: {
          id: input.versionId,
          productPackId: input.productPackId,
          status: 'DRAFT',
          productPack: {
            workspaceId: input.workspaceId,
            status: { not: 'ARCHIVED' },
            ...(input.groupId ? { groupId: input.groupId } : {}),
          },
        },
      });
      if (!draft) return null;
      await tx.productPackVersion.updateMany({
        where: { productPackId: input.productPackId, status: 'PUBLISHED' },
        data: { status: 'SUPERSEDED', supersededAt: input.publishedAt },
      });
      await tx.productPack.update({
        where: { id: input.productPackId },
        data: { status: 'ACTIVE' },
      });
      return tx.productPackVersion.update({
        where: { id: draft.id },
        data: { status: 'PUBLISHED', publishedAt: input.publishedAt },
        include: { rules: true, assets: true },
      });
    });
  }

  async assign(input: Parameters<ProductPackRepository['assign']>[0]) {
    return this.client.$transaction(async (tx) => {
      const eligible = await tx.productPackVersion.findFirst({
        where: {
          id: input.versionId,
          productPackId: input.productPackId,
          status: 'PUBLISHED',
          productPack: {
            workspaceId: input.workspaceId,
            status: 'ACTIVE',
            group: {
              memberships: {
                some: {
                  userId: input.actorUserId,
                  status: 'ACTIVE',
                  consentedAt: { not: null },
                },
              },
            },
          },
        },
        include: { productPack: true },
      });
      const bunshin = await tx.bunshin.findFirst({
        where: {
          id: input.bunshinId,
          ownerUserId: input.actorUserId,
          status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
        },
      });
      if (!eligible || !bunshin) return null;
      const active = await tx.productPackAssignment.findFirst({
        where: { bunshinId: input.bunshinId, status: 'ACTIVE' },
      });
      if (active && active.productPackId !== input.productPackId) return null;
      return tx.productPackAssignment.upsert({
        where: {
          productPackId_bunshinId: {
            productPackId: input.productPackId,
            bunshinId: input.bunshinId,
          },
        },
        create: {
          workspaceId: eligible.productPack.workspaceId,
          productPackId: input.productPackId,
          productPackVersionId: input.versionId,
          bunshinId: input.bunshinId,
          consentedAt: input.consentedAt,
          assignedByUserId: input.actorUserId,
        },
        update: {
          productPackVersionId: input.versionId,
          status: 'ACTIVE',
          consentedAt: input.consentedAt,
          assignedByUserId: input.actorUserId,
          revokedAt: null,
        },
      });
    });
  }

  async revokeAssignment(input: Parameters<ProductPackRepository['revokeAssignment']>[0]) {
    const row = await this.client.productPackAssignment.findFirst({
      where: {
        id: input.assignmentId,
        workspaceId: input.workspaceId,
        status: 'ACTIVE',
        bunshin: { ownerUserId: input.actorUserId },
      },
    });
    if (!row) return null;
    return this.client.productPackAssignment.update({
      where: { id: row.id },
      data: { status: 'REVOKED', revokedAt: input.revokedAt },
    });
  }

  async suspend(input: Parameters<ProductPackRepository['suspend']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.$transaction(async (tx) => {
      const pack = await tx.productPack.findFirst({
        where: {
          id: input.productPackId,
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          ...(input.groupId ? { groupId: input.groupId } : {}),
        },
      });
      if (!pack) return null;
      await tx.productPackAssignment.updateMany({
        where: { productPackId: pack.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: input.suspendedAt },
      });
      return tx.productPack.update({
        where: { id: pack.id },
        data: { status: 'SUSPENDED' },
      });
    });
  }

  async resolveForGeneration(input: Parameters<ProductPackRepository['resolveForGeneration']>[0]) {
    const row = await this.client.productPackAssignment.findFirst({
      where: {
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
        bunshin: {
          workspaceId: input.workspaceId,
          ownerUserId: input.actorUserId,
          status: 'ACTIVE',
        },
        productPack: {
          status: 'ACTIVE',
          group: {
            status: 'ACTIVE',
            memberships: {
              some: {
                userId: input.actorUserId,
                status: 'ACTIVE',
                consentedAt: { not: null },
              },
            },
          },
        },
        productPackVersion: {
          status: 'PUBLISHED',
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: input.at } }] },
            { OR: [{ validUntil: null }, { validUntil: { gt: input.at } }] },
          ],
        },
      },
      select: {
        productPackId: true,
        productPack: { select: { groupId: true } },
        productPackVersion: {
          select: { id: true, version: true, allowLinklessPosts: true },
        },
      },
    });
    return row
      ? {
          productPackId: row.productPackId,
          versionId: row.productPackVersion.id,
          version: row.productPackVersion.version,
          groupId: row.productPack.groupId,
          allowLinklessPosts: row.productPackVersion.allowLinklessPosts,
        }
      : null;
  }
}

function groupKnowledgeSource(
  row: Prisma.GroupKnowledgeSourceGetPayload<object>,
): GroupKnowledgeSourceRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    groupId: row.groupId,
    productPackVersionId: row.productPackVersionId,
    logicalKey: row.logicalKey,
    version: row.version,
    type: row.type,
    title: row.title,
    sourceUri: row.sourceUri,
    storageKey: row.storageKey,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    contentHash: row.contentHash,
    status: row.status,
    failureCode: row.failureCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function groupKnowledgeChunk(
  row: Prisma.GroupKnowledgeChunkGetPayload<object>,
): GroupKnowledgeChunkRecord {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sortOrder: row.sortOrder,
    type: row.type,
    content: row.content,
    sourceLabel: row.sourceLabel,
    pageNumber: row.pageNumber,
    startSeconds: row.startSeconds,
    endSeconds: row.endSeconds,
    confidence: row.confidence === null ? null : row.confidence.toNumber(),
  };
}

export class PrismaGroupKnowledgeRepository implements GroupKnowledgeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async canManage(input: GroupKnowledgeScope) {
    const [workspaceManager, groupManager] = await Promise.all([
      this.client.workspaceMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: { in: ['OWNER', 'ADMIN'] },
          workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
        },
        select: { id: true },
      }),
      this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          OR: [
            { role: 'MANAGER' },
            {
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR'] },
              group: { serviceConfiguration: { isNot: null } },
            },
          ],
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      }),
    ]);
    return workspaceManager !== null || groupManager !== null;
  }

  private canUse(input: GroupKnowledgeScope) {
    return this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        group: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  async createSource(input: Parameters<GroupKnowledgeRepository['createSource']>[0]) {
    if (!(await this.canManage(input))) return null;
    return this.client.$transaction(
      async (tx) => {
        const group = await tx.group.findFirst({
          where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!group) return null;
        if (input.productPackVersionId) {
          const version = await tx.productPackVersion.findFirst({
            where: {
              id: input.productPackVersionId,
              productPack: { workspaceId: input.workspaceId, groupId: input.groupId },
            },
            select: { id: true },
          });
          if (!version) return null;
        }
        const latest = await tx.groupKnowledgeSource.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            logicalKey: input.logicalKey,
          },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const row = await tx.groupKnowledgeSource.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            productPackVersionId: input.productPackVersionId,
            logicalKey: input.logicalKey,
            version: (latest?.version ?? 0) + 1,
            type: input.type,
            title: input.title,
            sourceUri: input.sourceUri,
            storageKey: input.storageKey,
            originalFileName: input.originalFileName,
            mimeType: input.mimeType,
            contentHash: input.contentHash,
            createdByUserId: input.actorUserId,
          },
        });
        await tx.groupKnowledgeAuditLog.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            sourceId: row.id,
            actorUserId: input.actorUserId,
            action: 'CREATED',
            details: { type: input.type, version: row.version },
          },
        });
        return groupKnowledgeSource(row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async beginProcessing(input: Parameters<GroupKnowledgeRepository['beginProcessing']>[0]) {
    if (!(await this.canManage(input))) return false;
    return this.client.$transaction(async (tx) => {
      const updated = await tx.groupKnowledgeSource.updateMany({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { in: ['DRAFT', 'FAILED', 'REVIEW_REQUIRED'] },
        },
        data: { status: 'PROCESSING', failureCode: null },
      });
      if (updated.count !== 1) return false;
      await tx.groupKnowledgeAuditLog.create({
        data: { ...input, actorUserId: input.actorUserId, action: 'PROCESSING_STARTED' },
      });
      return true;
    });
  }

  async replaceExtractedChunks(
    input: Parameters<GroupKnowledgeRepository['replaceExtractedChunks']>[0],
  ) {
    if (!(await this.canManage(input))) return false;
    return this.client.$transaction(async (tx) => {
      const source = await tx.groupKnowledgeSource.findFirst({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'PROCESSING',
        },
        select: { id: true },
      });
      if (!source) return false;
      await tx.groupKnowledgeChunk.deleteMany({ where: { sourceId: source.id } });
      await tx.groupKnowledgeChunk.createMany({
        data: input.chunks.map((chunk) => ({ ...chunk, sourceId: source.id })),
      });
      await tx.groupKnowledgeSource.update({
        where: { id: source.id },
        data: { status: 'REVIEW_REQUIRED', failureCode: null },
      });
      await tx.groupKnowledgeAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          sourceId: source.id,
          actorUserId: input.actorUserId,
          action: 'EXTRACTION_SAVED',
          details: { chunkCount: input.chunks.length },
        },
      });
      return true;
    });
  }

  async markFailed(input: Parameters<GroupKnowledgeRepository['markFailed']>[0]) {
    if (!(await this.canManage(input))) return false;
    return this.client.$transaction(async (tx) => {
      const updated = await tx.groupKnowledgeSource.updateMany({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'PROCESSING',
        },
        data: { status: 'FAILED', failureCode: input.failureCode },
      });
      if (updated.count !== 1) return false;
      await tx.groupKnowledgeAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          sourceId: input.sourceId,
          actorUserId: input.actorUserId,
          action: 'FAILED',
          details: { failureCode: input.failureCode },
        },
      });
      return true;
    });
  }

  async approve(input: Parameters<GroupKnowledgeRepository['approve']>[0]) {
    if (!(await this.canManage(input))) return false;
    return this.client.$transaction(async (tx) => {
      const source = await tx.groupKnowledgeSource.findFirst({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'REVIEW_REQUIRED',
          chunks: { some: {} },
        },
        select: { id: true, logicalKey: true, version: true },
      });
      if (!source) return false;
      await tx.groupKnowledgeSource.updateMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          logicalKey: source.logicalKey,
          status: 'ACTIVE',
          version: { lt: source.version },
        },
        data: { status: 'ARCHIVED', archivedAt: input.approvedAt },
      });
      await tx.groupKnowledgeSource.update({
        where: { id: source.id },
        data: {
          status: 'ACTIVE',
          approvedByUserId: input.actorUserId,
          approvedAt: input.approvedAt,
        },
      });
      await tx.groupKnowledgeAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          sourceId: source.id,
          actorUserId: input.actorUserId,
          action: 'APPROVED',
        },
      });
      return true;
    });
  }

  async archive(input: Parameters<GroupKnowledgeRepository['archive']>[0]) {
    if (!(await this.canManage(input))) return false;
    return this.client.$transaction(async (tx) => {
      const updated = await tx.groupKnowledgeSource.updateMany({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { not: 'ARCHIVED' },
        },
        data: { status: 'ARCHIVED', archivedAt: input.archivedAt },
      });
      if (updated.count !== 1) return false;
      await tx.groupKnowledgeAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          sourceId: input.sourceId,
          actorUserId: input.actorUserId,
          action: 'ARCHIVED',
        },
      });
      return true;
    });
  }

  async updateProductScope(input: Parameters<GroupKnowledgeRepository['updateProductScope']>[0]) {
    if (!(await this.canManage(input))) return null;
    return this.client.$transaction(async (tx) => {
      if (input.productPackVersionId) {
        const version = await tx.productPackVersion.findFirst({
          where: {
            id: input.productPackVersionId,
            status: 'PUBLISHED',
            productPack: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              status: 'ACTIVE',
            },
          },
          select: { id: true },
        });
        if (!version) return null;
      }
      const source = await tx.groupKnowledgeSource.findFirst({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { not: 'ARCHIVED' },
        },
      });
      if (!source) return null;
      const updated = await tx.groupKnowledgeSource.update({
        where: { id: source.id },
        data: { productPackVersionId: input.productPackVersionId },
      });
      await tx.groupKnowledgeAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          sourceId: source.id,
          actorUserId: input.actorUserId,
          action: 'PRODUCT_SCOPE_UPDATED',
          details: {
            beforeProductPackVersionId: source.productPackVersionId,
            afterProductPackVersionId: input.productPackVersionId,
          },
        },
      });
      return groupKnowledgeSource(updated);
    });
  }

  async updateReviewChunkContents(
    input: Parameters<GroupKnowledgeRepository['updateReviewChunkContents']>[0],
  ) {
    if (!(await this.canManage(input))) return false;
    return this.client.$transaction(async (tx) => {
      const source = await tx.groupKnowledgeSource.findFirst({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'REVIEW_REQUIRED',
        },
        select: { id: true, chunks: { select: { id: true } } },
      });
      if (!source) return false;
      const storedIds = new Set(source.chunks.map((chunk) => chunk.id));
      if (
        storedIds.size !== input.chunks.length ||
        input.chunks.some((chunk) => !storedIds.has(chunk.id))
      )
        return false;
      for (const chunk of input.chunks) {
        await tx.groupKnowledgeChunk.update({
          where: { id: chunk.id },
          data: { content: chunk.content },
        });
      }
      await tx.groupKnowledgeAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          sourceId: source.id,
          actorUserId: input.actorUserId,
          action: 'REVIEW_EDITED',
          details: { chunkCount: input.chunks.length },
        },
      });
      return true;
    });
  }

  async listForManagement(input: Parameters<GroupKnowledgeRepository['listForManagement']>[0]) {
    if (!(await this.canManage(input))) return null;
    const rows = await this.client.groupKnowledgeSource.findMany({
      where: { workspaceId: input.workspaceId, groupId: input.groupId },
      orderBy: [{ updatedAt: 'desc' }, { version: 'desc' }],
    });
    return rows.map(groupKnowledgeSource);
  }

  async listApprovedChunksForGeneration(
    input: Parameters<GroupKnowledgeRepository['listApprovedChunksForGeneration']>[0],
  ) {
    if (!(await this.canUse(input))) return null;
    const commonWhere = {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: 'ACTIVE' as const,
    };
    const productRows = input.productPackVersionId
      ? await this.client.groupKnowledgeChunk.findMany({
          where: {
            source: { ...commonWhere, productPackVersionId: input.productPackVersionId },
          },
          orderBy: [{ source: { updatedAt: 'desc' } }, { sortOrder: 'asc' }],
          take: 20,
        })
      : [];
    const remaining = 20 - productRows.length;
    const commonRows =
      remaining > 0
        ? await this.client.groupKnowledgeChunk.findMany({
            where: { source: { ...commonWhere, productPackVersionId: null } },
            orderBy: [{ source: { updatedAt: 'desc' } }, { sortOrder: 'asc' }],
            take: remaining,
          })
        : [];
    return [...productRows, ...commonRows].map(groupKnowledgeChunk);
  }
}

export class PrismaAdvertisingSafetyRepository implements AdvertisingSafetyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  hashContent(content: string) {
    return createHash('sha256').update(content).digest('hex');
  }

  private bunshin(input: { workspaceId: string; bunshinId: string; actorUserId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
        workspace: { type: 'PERSONAL', status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  async listEvidence(input: Parameters<AdvertisingSafetyRepository['listEvidence']>[0]) {
    if (!(await this.bunshin(input))) return null;
    return this.client.userEvidence.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createEvidence(input: Parameters<AdvertisingSafetyRepository['createEvidence']>[0]) {
    if (!(await this.bunshin(input))) return null;
    return this.client.userEvidence.create({
      data: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        type: input.type,
        title: input.title,
        claim: input.claim,
        sourceUrl: input.sourceUrl,
        occurredAt: input.occurredAt,
        createdByUserId: input.actorUserId,
      },
    });
  }

  async revokeEvidence(input: Parameters<AdvertisingSafetyRepository['revokeEvidence']>[0]) {
    if (!(await this.bunshin(input))) return null;
    const evidence = await this.client.userEvidence.findFirst({
      where: {
        id: input.evidenceId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
      },
    });
    if (!evidence) return null;
    return this.client.userEvidence.update({
      where: { id: evidence.id },
      data: { status: 'REVOKED', revokedAt: input.revokedAt },
    });
  }

  async prepareReview(input: Parameters<AdvertisingSafetyRepository['prepareReview']>[0]) {
    if (!(await this.bunshin(input))) return null;
    if (input.dailyMissionId) {
      const mission = await this.client.dailyMission.findFirst({
        where: {
          id: input.dailyMissionId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
        },
        select: { id: true },
      });
      if (!mission) return null;
    }
    const evidence = await this.client.userEvidence.findMany({
      where: {
        id: { in: input.evidenceIds },
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (evidence.length !== input.evidenceIds.length) return null;
    if (!input.productPackVersionId)
      return {
        productPackVersionId: null,
        facts: {},
        rules: [],
        evidenceIds: evidence.map((item) => item.id),
      };
    const assignment = await this.client.productPackAssignment.findFirst({
      where: {
        bunshinId: input.bunshinId,
        productPackVersionId: input.productPackVersionId,
        status: 'ACTIVE',
        bunshin: { workspaceId: input.workspaceId, ownerUserId: input.actorUserId },
        productPack: {
          status: 'ACTIVE',
          group: {
            memberships: {
              some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
            },
          },
        },
        productPackVersion: { status: 'PUBLISHED' },
      },
      include: { productPackVersion: { include: { rules: { orderBy: { sortOrder: 'asc' } } } } },
    });
    if (!assignment) return null;
    const facts = assignment.productPackVersion.facts;
    if (!facts || Array.isArray(facts) || typeof facts !== 'object') return null;
    return {
      productPackVersionId: assignment.productPackVersionId,
      facts: facts as Record<string, string>,
      rules: assignment.productPackVersion.rules.map((rule) => ({
        type: rule.type,
        value: rule.value,
        condition: rule.condition,
      })),
      evidenceIds: evidence.map((item) => item.id),
    };
  }

  async saveReview(input: Parameters<AdvertisingSafetyRepository['saveReview']>[0]) {
    if (!(await this.bunshin(input))) return null;
    return this.client.advertisingSafetyReview.create({
      data: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
        productPackVersionId: input.productPackVersionId,
        classification: input.classification,
        evidenceRequirement: input.evidenceRequirement,
        evidenceIds: input.evidenceIds,
        officialClaims: input.officialClaims,
        requiredDisclosures: input.requiredDisclosures,
        issueCodes: input.issueCodes,
        verdict: input.verdict,
        contentHash: input.contentHash,
        reviewedByUserId: input.actorUserId,
      },
    });
  }

  async listReviews(input: Parameters<AdvertisingSafetyRepository['listReviews']>[0]) {
    if (!(await this.bunshin(input))) return null;
    return this.client.advertisingSafetyReview.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      orderBy: { reviewedAt: 'desc' },
      take: 100,
    });
  }
}

type CampaignPlanningRow = Prisma.CampaignGetPayload<{
  include: {
    productPackVersion: { include: { rules: true } };
    assets: { include: { productPackAsset: true } };
  };
}>;

export class PrismaCampaignRepository implements CampaignRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async manage(workspaceId: string, actorUserId: string, groupId?: string) {
    const workspaceManager = await this.client.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: actorUserId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
        workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (workspaceManager) return true;
    if (!groupId) return false;
    return Boolean(
      await this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          status: 'ACTIVE',
          OR: [
            { role: 'MANAGER' },
            {
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR'] },
              group: { serviceConfiguration: { isNot: null } },
            },
          ],
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      }),
    );
  }

  async listManaged(input: Parameters<CampaignRepository['listManaged']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    const campaigns = await this.client.campaign.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.groupId ? { groupId: input.groupId } : {}),
      },
      include: {
        group: { select: { name: true } },
        productPackVersion: {
          select: { version: true, productPack: { select: { name: true } } },
        },
        assets: { include: { productPackAsset: true }, orderBy: { sortOrder: 'asc' } },
        participations: { select: { status: true } },
        dailyMissions: {
          select: {
            decision: { select: { decision: true } },
            activities: {
              where: {
                type: {
                  in: ['COPIED_TEXT', 'COPIED_SLIDE', 'COPIED_VIDEO_PROMPT', 'COPIED_SCRIPT'],
                },
              },
              select: { id: true },
            },
            postRecord: { select: { id: true } },
            feedback: { select: { rating: true } },
          },
        },
        _count: {
          select: {
            similarityReviews: { where: { verdict: 'POSSIBLE_DUPLICATE' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return campaigns.map(({ dailyMissions, ...campaign }) => ({
      ...campaign,
      metrics: {
        generated: dailyMissions.length,
        accepted: dailyMissions.filter(({ decision }) => decision?.decision === 'ACCEPTED').length,
        copied: dailyMissions.filter(({ activities }) => activities.length > 0).length,
        posted: dailyMissions.filter(({ postRecord }) => postRecord !== null).length,
        feedbackGood: dailyMissions.filter(({ feedback }) => feedback?.rating === 'GOOD').length,
        duplicateRejected: campaign._count.similarityReviews,
      },
    }));
  }

  async createDraft(input: Parameters<CampaignRepository['createDraft']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.$transaction(async (tx) => {
      const version = await tx.productPackVersion.findFirst({
        where: {
          id: input.productPackVersionId,
          status: 'PUBLISHED',
          productPack: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            status: 'ACTIVE',
            group: { status: 'ACTIVE' },
          },
        },
        select: { id: true },
      });
      if (!version) return null;
      const assets = await tx.productPackAsset.findMany({
        where: { id: { in: input.assetIds }, productPackVersionId: version.id },
        select: { id: true },
      });
      if (assets.length !== input.assetIds.length) return null;
      const campaign = await tx.campaign.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          productPackVersionId: version.id,
          name: input.name,
          theme: input.theme,
          targetSummary: input.targetSummary,
          participationLimit: input.participationLimit,
          maxRelatedPerWeek: input.maxRelatedPerWeek,
          maxAdsPerWeek: input.maxAdsPerWeek,
          cooldownDays: input.cooldownDays,
          generationLimitPerParticipant: input.generationLimitPerParticipant,
          similarityThresholdBasisPoints: input.similarityThresholdBasisPoints,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          createdByUserId: input.actorUserId,
          assets: {
            create: input.assetIds.map((productPackAssetId, sortOrder) => ({
              productPackAssetId,
              sortOrder,
            })),
          },
        },
      });
      await tx.campaignActivity.create({
        data: {
          campaignId: campaign.id,
          actorUserId: input.actorUserId,
          action: 'CREATED',
          toStatus: 'DRAFT',
        },
      });
      return campaign;
    });
  }

  async transition(input: Parameters<CampaignRepository['transition']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.$transaction(async (tx) => {
      const changed = await tx.campaign.updateMany({
        where: {
          id: input.campaignId,
          workspaceId: input.workspaceId,
          ...(input.groupId ? { groupId: input.groupId } : {}),
          status: input.from,
          ...(input.to === 'OPEN' ? { endsAt: { gt: input.now } } : {}),
        },
        data: {
          status: input.to,
          ...(input.to === 'OPEN' ? { openedAt: input.now } : {}),
          ...(input.to === 'CLOSED' ? { closedAt: input.now } : {}),
          ...(input.to === 'CANCELLED' ? { cancelledAt: input.now } : {}),
        },
      });
      if (changed.count !== 1) return null;
      await tx.campaignActivity.create({
        data: {
          campaignId: input.campaignId,
          actorUserId: input.actorUserId,
          action: input.to === 'OPEN' ? 'OPENED' : input.to === 'CLOSED' ? 'CLOSED' : 'CANCELLED',
          fromStatus: input.from,
          toStatus: input.to,
          reason: input.reason,
        },
      });
      return tx.campaign.findUnique({ where: { id: input.campaignId } });
    });
  }

  private participant(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
        workspace: { type: 'PERSONAL', status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  async listAvailable(input: Parameters<CampaignRepository['listAvailable']>[0]) {
    if (!(await this.participant(input))) return null;
    return this.client.campaign.findMany({
      where: {
        status: 'OPEN',
        startsAt: { lte: input.now },
        endsAt: { gt: input.now },
        group: {
          status: 'ACTIVE',
          memberships: {
            some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
          },
        },
        productPackVersion: {
          assignments: {
            some: { bunshinId: input.bunshinId, status: 'ACTIVE' },
          },
        },
      },
      include: {
        group: { select: { name: true } },
        productPackVersion: {
          select: { version: true, productPack: { select: { name: true } } },
        },
        assets: { include: { productPackAsset: true }, orderBy: { sortOrder: 'asc' } },
        participations: { where: { userId: input.actorUserId } },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async decide(input: Parameters<CampaignRepository['decide']>[0]) {
    if (!(await this.participant(input))) return null;
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.campaignId}::text, 0))`;
      const campaign = await tx.campaign.findFirst({
        where: {
          id: input.campaignId,
          status: 'OPEN',
          startsAt: { lte: input.now },
          endsAt: { gt: input.now },
          group: {
            status: 'ACTIVE',
            memberships: {
              some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
            },
          },
          productPackVersion: {
            assignments: { some: { bunshinId: input.bunshinId, status: 'ACTIVE' } },
          },
        },
      });
      if (!campaign) return null;
      const previous = await tx.campaignParticipation.findUnique({
        where: { campaignId_userId: { campaignId: campaign.id, userId: input.actorUserId } },
      });
      if (input.decision === 'WITHDRAWN' && previous?.status !== 'ACCEPTED') return null;
      if (input.decision === 'ACCEPTED' && previous?.status !== 'ACCEPTED') {
        const accepted = await tx.campaignParticipation.count({
          where: { campaignId: campaign.id, status: 'ACCEPTED' },
        });
        if (accepted >= campaign.participationLimit) return null;
      }
      const timestamps = {
        consentedAt: input.decision === 'ACCEPTED' ? input.now : null,
        declinedAt: input.decision === 'DECLINED' ? input.now : null,
        heldAt: input.decision === 'ON_HOLD' ? input.now : null,
        withdrawnAt: input.decision === 'WITHDRAWN' ? input.now : null,
      };
      const participation = await tx.campaignParticipation.upsert({
        where: { campaignId_userId: { campaignId: campaign.id, userId: input.actorUserId } },
        create: {
          campaignId: campaign.id,
          participantWorkspaceId: input.workspaceId,
          userId: input.actorUserId,
          bunshinId: input.bunshinId,
          status: input.decision,
          ...timestamps,
        },
        update: { status: input.decision, bunshinId: input.bunshinId, ...timestamps },
      });
      const action = {
        ACCEPTED: 'ACCEPTED',
        DECLINED: 'DECLINED',
        ON_HOLD: 'HELD',
        WITHDRAWN: 'WITHDRAWN',
      } as const;
      await tx.campaignActivity.create({
        data: {
          campaignId: campaign.id,
          actorUserId: input.actorUserId,
          action: action[input.decision],
          fromStatus: previous?.status ?? null,
          toStatus: input.decision,
          reason: input.reason,
        },
      });
      return participation;
    });
  }

  private planningWhere(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    campaignId?: string;
    from: Date;
    to: Date;
  }): Prisma.CampaignWhereInput {
    return {
      ...(input.campaignId ? { id: input.campaignId } : {}),
      ...(input.groupId ? { groupId: input.groupId } : {}),
      status: 'OPEN',
      startsAt: { lte: input.to },
      endsAt: { gt: input.from },
      group: {
        status: 'ACTIVE',
        memberships: {
          some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
        },
      },
      participations: {
        some: {
          participantWorkspaceId: input.workspaceId,
          userId: input.actorUserId,
          bunshinId: input.bunshinId,
          status: 'ACCEPTED',
        },
      },
      productPackVersion: {
        status: 'PUBLISHED',
        assignments: { some: { bunshinId: input.bunshinId, status: 'ACTIVE' } },
      },
    };
  }

  private planningContext(row: CampaignPlanningRow): CampaignPlanningContext {
    return {
      id: row.id,
      name: row.name,
      theme: row.theme,
      targetSummary: row.targetSummary,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      maxRelatedPerWeek: row.maxRelatedPerWeek,
      maxAdsPerWeek: row.maxAdsPerWeek,
      cooldownDays: row.cooldownDays,
      productPack: {
        productPackId: row.productPackVersion.productPackId,
        groupId: row.groupId,
        versionId: row.productPackVersion.id,
        version: row.productPackVersion.version,
        allowLinklessPosts: row.productPackVersion.allowLinklessPosts,
        summary: row.productPackVersion.summary,
        providerName: row.productPackVersion.providerName,
        targetCustomer: row.productPackVersion.targetCustomer,
        facts: row.productPackVersion.facts as Record<string, string>,
        rules: row.productPackVersion.rules,
        assets: row.assets.map(({ productPackAsset }) => productPackAsset),
      },
    };
  }

  private planningRows(where: Prisma.CampaignWhereInput) {
    return this.client.campaign.findMany({
      where,
      include: {
        productPackVersion: { include: { rules: { orderBy: { sortOrder: 'asc' } } } },
        assets: { include: { productPackAsset: true }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
  }

  async listPlanningContexts(input: Parameters<CampaignRepository['listPlanningContexts']>[0]) {
    if (!(await this.participant(input))) return null;
    const rows = await this.planningRows(this.planningWhere(input));
    return rows.map((row) => this.planningContext(row));
  }

  async resolvePlanningContext(input: Parameters<CampaignRepository['resolvePlanningContext']>[0]) {
    if (!(await this.participant(input))) return null;
    const rows = await this.planningRows(
      this.planningWhere({ ...input, from: input.at, to: input.at }),
    );
    return rows[0] ? this.planningContext(rows[0]) : null;
  }
}

export class PrismaCampaignSafetyRepository implements CampaignSafetyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private eligible(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    campaignId: string;
    at: Date;
  }): Prisma.CampaignWhereInput {
    return {
      id: input.campaignId,
      status: 'OPEN',
      startsAt: { lte: input.at },
      endsAt: { gt: input.at },
      group: {
        status: 'ACTIVE',
        memberships: {
          some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
        },
      },
      participations: {
        some: {
          participantWorkspaceId: input.workspaceId,
          userId: input.actorUserId,
          bunshinId: input.bunshinId,
          status: 'ACCEPTED',
        },
      },
      productPackVersion: {
        status: 'PUBLISHED',
        assignments: { some: { bunshinId: input.bunshinId, status: 'ACTIVE' } },
      },
    };
  }

  async inspect(input: Parameters<CampaignSafetyRepository['inspect']>[0]) {
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
        workspace: { type: 'PERSONAL', status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!bunshin) return null;
    const campaign = await this.client.campaign.findFirst({
      where: this.eligible(input),
      select: {
        generationLimitPerParticipant: true,
        similarityThresholdBasisPoints: true,
        similarityReviews: {
          where: { verdict: 'UNIQUE' },
          select: { simhash: true },
          orderBy: { createdAt: 'desc' },
          take: 500,
        },
        _count: { select: { dailyMissions: { where: { bunshinId: input.bunshinId } } } },
      },
    });
    if (!campaign) return null;
    return {
      generationLimit: campaign.generationLimitPerParticipant,
      generatedCount: campaign._count.dailyMissions,
      similarityThresholdBasisPoints: campaign.similarityThresholdBasisPoints,
      candidates: campaign.similarityReviews,
    };
  }

  async record(input: Parameters<CampaignSafetyRepository['record']>[0]) {
    if (input.dailyMissionId) {
      const mission = await this.client.dailyMission.findFirst({
        where: {
          id: input.dailyMissionId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          campaignId: input.campaignId,
          bunshin: { ownerUserId: input.actorUserId },
        },
        select: { id: true },
      });
      if (!mission) return null;
    } else {
      const eligible = await this.inspect(input);
      if (!eligible) return null;
    }
    return this.client.campaignSimilarityReview.create({
      data: {
        campaignId: input.campaignId,
        dailyMissionId: input.dailyMissionId,
        participantWorkspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        contentFingerprint: input.contentFingerprint,
        simhash: input.simhash,
        maxSimilarityBasisPoints: input.maxSimilarityBasisPoints,
        verdict: input.verdict,
      },
    });
  }
}

const videoSceneRecord = (row: Prisma.VideoSceneGetPayload<object>): VideoSceneRecord => ({
  ...row,
  keywords: row.keywords as unknown as string[],
  aiProcessingTypes: row.aiProcessingTypes as unknown as VideoAiProcessingType[],
});

const videoProjectRecord = (
  row: Prisma.VideoProjectGetPayload<{ include: { scenes: true } }>,
): VideoProjectRecord => ({
  ...row,
  platform: row.platform as VideoPlatform,
  durationSeconds: row.durationSeconds as 30 | 60,
  aiProcessingTypes: row.aiProcessingTypes as unknown as VideoAiProcessingType[],
  disclosureSnapshot: row.disclosureSnapshot as Record<string, unknown>,
  characterProfileSnapshot: row.characterProfileSnapshot as Record<string, unknown>,
  characterReferenceSnapshot: row.characterReferenceSnapshot as Array<Record<string, unknown>>,
  scenes: row.scenes.map(videoSceneRecord),
});

export class PrismaVideoProjectRepository implements VideoProjectRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async create(input: Parameters<VideoProjectRepository['create']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const membership = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
      if (!membership) return null;
      const groupPolicy = await tx.groupFeaturePolicy.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          featureKey: 'VIDEO_GENERATION',
          status: 'ENABLED',
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
        },
        select: { id: true },
      });
      const memberAssignment = await tx.groupMemberFeatureAssignment.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: membership.id,
          featureKey: 'VIDEO_GENERATION',
          status: 'ENABLED',
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
        },
        select: { id: true },
      });
      if (!groupPolicy || !memberAssignment) return null;
      const bunshin = await tx.bunshin.findFirst({
        where: {
          id: input.bunshinId,
          workspaceId: input.workspaceId,
          ownerUserId: input.actorUserId,
          status: { not: 'ARCHIVED' },
        },
        select: { id: true },
      });
      if (!bunshin) return null;
      if (input.campaignId) {
        const campaign = await tx.campaign.findFirst({
          where: { id: input.campaignId, workspaceId: input.workspaceId, groupId: input.groupId },
          select: { id: true },
        });
        if (!campaign) return null;
      }
      let characterProfileSnapshot: Prisma.InputJsonValue = {};
      let characterReferenceSnapshot: Prisma.InputJsonValue = [];
      if (!input.standardComposition && !input.characterProfileVersionId) return null;
      if (input.characterProfileVersionId) {
        const characterVersion = await tx.aiCharacterProfileVersion.findFirst({
          where: {
            id: input.characterProfileVersionId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            status: 'PUBLISHED',
          },
        });
        if (!characterVersion) return null;
        const activeLicense = await tx.aiCharacterLicenseVersion.findFirst({
          where: {
            id: characterVersion.licenseVersionId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            characterProfileId: characterVersion.characterProfileId,
            commercialUseAllowed: true,
            derivativeUseAllowed: true,
            redistributionAllowed: true,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
          select: { id: true },
        });
        if (!activeLicense) return null;
        const characterProfile = await tx.aiCharacterProfile.findFirst({
          where: {
            id: characterVersion.characterProfileId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            scope: 'SERVICE',
            status: 'ACTIVE',
          },
          select: { id: true, name: true },
        });
        if (!characterProfile) return null;
        const references = await tx.aiCharacterReferenceAsset.findMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            characterProfileVersionId: characterVersion.id,
            status: 'READY',
          },
          select: { id: true, storageKey: true, mimeType: true, sha256: true },
          orderBy: { createdAt: 'asc' },
        });
        if (references.length === 0) return null;
        characterProfileSnapshot = {
          characterProfileId: characterProfile.id,
          name: characterProfile.name,
          version: characterVersion.version,
          appearance: characterVersion.appearance,
          worldSetting: characterVersion.worldSetting,
          basePrompt: characterVersion.basePrompt,
          negativePrompt: characterVersion.negativePrompt,
          safetyRules: characterVersion.safetyRules as Prisma.InputJsonValue,
          licenseSnapshot: characterVersion.licenseSnapshot as Prisma.InputJsonValue,
          publishedAt: characterVersion.publishedAt?.toISOString() ?? null,
        };
        characterReferenceSnapshot = references;
      }
      const row = await tx.videoProject.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          ownerUserId: input.actorUserId,
          bunshinId: input.bunshinId,
          campaignId: input.campaignId,
          characterProfileVersionId: input.characterProfileVersionId,
          characterProfileSnapshot,
          characterReferenceSnapshot,
          title: input.title,
          platform: input.platform,
          type: input.type,
          durationSeconds: input.durationSeconds,
          standardComposition: input.standardComposition,
          aiProcessingTypes: input.aiProcessingTypes,
          disclosureSnapshot: input.disclosureSnapshot as Prisma.InputJsonValue,
        },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      return videoProjectRecord(row);
    });
  }

  async findOwned(input: Parameters<VideoProjectRepository['findOwned']>[0]) {
    const now = new Date();
    const row = await this.client.videoProject.findFirst({
      where: {
        id: input.videoProjectId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        group: {
          status: 'ACTIVE',
          featurePolicies: {
            some: {
              featureKey: 'VIDEO_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
        groupMembership: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          featureAssignments: {
            some: {
              featureKey: 'VIDEO_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
      },
      include: { scenes: { orderBy: { sceneNo: 'asc' } } },
    });
    return row ? videoProjectRecord(row) : null;
  }

  async replacePlan(input: Parameters<VideoProjectRepository['replacePlan']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const project = await tx.videoProject.findFirst({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: { in: ['DRAFT', 'PLANNING', 'WAITING_APPROVAL'] },
          group: {
            status: 'ACTIVE',
            featurePolicies: {
              some: {
                featureKey: 'VIDEO_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              },
            },
          },
          groupMembership: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            featureAssignments: {
              some: {
                featureKey: 'VIDEO_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              },
            },
          },
        },
        select: { id: true, durationSeconds: true },
      });
      if (!project) return null;
      const totalMs = input.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
      if (totalMs !== project.durationSeconds * 1_000) return null;
      await tx.videoScene.deleteMany({ where: { videoProjectId: project.id } });
      await tx.videoScene.createMany({
        data: input.scenes.map((scene) => ({
          videoProjectId: project.id,
          sceneNo: scene.sceneNo,
          durationMs: scene.durationMs,
          narration: scene.narration,
          caption: scene.caption,
          visualType: scene.visualType,
          visualPrompt: scene.visualPrompt,
          keywords: scene.keywords,
          aiProcessingTypes: scene.aiProcessingTypes,
          locked: scene.locked,
        })),
      });
      const row = await tx.videoProject.update({
        where: { id: project.id },
        data: {
          status: 'WAITING_APPROVAL',
          revision: { increment: 1 },
          aiProcessingTypes: input.projectAiProcessingTypes,
          standardComposition: input.standardComposition,
          aiVideoSceneCount: input.aiVideoSceneCount,
        },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      return videoProjectRecord(row);
    });
  }

  async approvePlan(input: Parameters<VideoProjectRepository['approvePlan']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.videoProject.updateMany({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: 'WAITING_APPROVAL',
          scenes: { some: {} },
          group: {
            status: 'ACTIVE',
            featurePolicies: {
              some: {
                featureKey: 'VIDEO_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              },
            },
          },
          groupMembership: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            consentedAt: { not: null },
            featureAssignments: {
              some: {
                featureKey: 'VIDEO_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              },
            },
          },
        },
        data: { status: 'APPROVED', revision: { increment: 1 } },
      });
      if (changed.count !== 1) return null;
      const row = await tx.videoProject.findUniqueOrThrow({
        where: { id: input.videoProjectId },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      return videoProjectRecord(row);
    });
  }
}

const assetRetentionExpiry = (from = new Date()) =>
  new Date(from.getTime() + 90 * 24 * 60 * 60 * 1000);

const videoRenderRecord = (row: Prisma.VideoRenderGetPayload<object>): VideoRenderRecord => row;

const videoDeliveryRecord = (row: Prisma.VideoDeliveryGetPayload<object>): VideoDeliveryRecord => ({
  ...row,
  rightsSnapshot: row.rightsSnapshot as Record<string, unknown>,
});

export class PrismaVideoDeliveryRepository implements VideoDeliveryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async serviceManager(workspaceId: string, groupId: string, actorUserId: string) {
    return (
      (await this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          status: 'ACTIVE',
          serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
          group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
        },
        select: { id: true },
      })) !== null
    );
  }

  async assign(input: Parameters<VideoDeliveryRepository['assign']>[0]) {
    if (!(await this.serviceManager(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    return this.client.$transaction(async (tx) => {
      const render = await tx.videoRender.findFirst({
        where: {
          id: input.videoRenderId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          videoProjectId: input.videoProjectId,
          status: 'SUCCEEDED',
          outputStorageKey: { not: null },
        },
      });
      if (render === null) return null;
      const membership = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'ACTIVE',
          userId: render.ownerUserId,
        },
      });
      if (membership === null) return null;
      const project = await tx.videoProject.findFirst({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          ownerUserId: membership.userId,
        },
      });
      if (project === null) return null;
      if (input.programEnrollmentId !== null) {
        const enrollment = await tx.programEnrollment.findFirst({
          where: {
            id: input.programEnrollmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: input.groupMembershipId,
            status: { in: ['INVITED', 'ACTIVE'] },
          },
          select: { id: true },
        });
        if (enrollment === null) return null;
      }
      const existing = await tx.videoDelivery.findUnique({
        where: { videoRenderId: input.videoRenderId },
        select: { id: true },
      });
      if (existing !== null) return null;
      if (input.replacesVideoDeliveryId !== null) {
        const replaced = await tx.videoDelivery.findFirst({
          where: {
            id: input.replacesVideoDeliveryId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: input.groupMembershipId,
            ownerUserId: membership.userId,
            status: 'REVOKED',
            replacesVideoDeliveryId: null,
          },
          select: { id: true, programEnrollmentId: true },
        });
        if (replaced === null || replaced.programEnrollmentId !== input.programEnrollmentId)
          return null;
      }
      const row = await tx.videoDelivery.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          ownerUserId: membership.userId,
          programEnrollmentId: input.programEnrollmentId,
          videoProjectId: project.id,
          videoRenderId: render.id,
          replacesVideoDeliveryId: input.replacesVideoDeliveryId,
          rightsSnapshot: input.rightsSnapshot as Prisma.InputJsonValue,
          expiresAt: input.expiresAt,
          assignedByUserId: input.actorUserId,
        },
      });
      await tx.videoDeliveryEvent.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          videoDeliveryId: row.id,
          eventType: 'ASSIGNED',
          eventData:
            input.replacesVideoDeliveryId === null
              ? {}
              : { replacesVideoDeliveryId: input.replacesVideoDeliveryId },
          performedByUserId: input.actorUserId,
        },
      });
      return videoDeliveryRecord(row);
    });
  }

  async findForRecipient(input: Parameters<VideoDeliveryRepository['findForRecipient']>[0]) {
    const membership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (membership === null) return null;
    const row = await this.client.videoDelivery.findFirst({
      where: {
        id: input.videoDeliveryId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: membership.id,
        ownerUserId: input.actorUserId,
      },
    });
    return row === null ? null : videoDeliveryRecord(row);
  }

  async recordAction(input: Parameters<VideoDeliveryRepository['recordAction']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const membership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (membership === null) return null;
      const delivery = await tx.videoDelivery.findFirst({
        where: {
          id: input.videoDeliveryId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: membership.id,
          ownerUserId: input.actorUserId,
        },
      });
      if (
        delivery === null ||
        delivery.status === 'REVOKED' ||
        (delivery.expiresAt !== null && delivery.expiresAt <= now)
      )
        return null;
      const permitted =
        input.action === 'VIEWED'
          ? delivery.status !== 'DECLINED'
          : input.action === 'ACCEPTED' || input.action === 'DECLINED'
            ? ['ASSIGNED', 'VIEWED'].includes(delivery.status)
            : ['ACCEPTED', 'POSTED'].includes(delivery.status);
      if (!permitted) return null;
      const data =
        input.action === 'VIEWED'
          ? { status: delivery.status === 'ASSIGNED' ? 'VIEWED' : delivery.status, viewedAt: now }
          : input.action === 'ACCEPTED'
            ? { status: 'ACCEPTED' as const, acceptedAt: now }
            : input.action === 'DECLINED'
              ? { status: 'DECLINED' as const, declinedAt: now }
              : input.action === 'POSTED'
                ? { status: 'POSTED' as const, postedAt: now }
                : {};
      const row = await tx.videoDelivery.update({ where: { id: delivery.id }, data });
      await tx.videoDeliveryEvent.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          videoDeliveryId: delivery.id,
          eventType: input.action,
          eventData: input.eventData as Prisma.InputJsonValue,
          performedByUserId: input.actorUserId,
        },
      });
      return videoDeliveryRecord(row);
    });
  }

  async recordNotification(input: Parameters<VideoDeliveryRepository['recordNotification']>[0]) {
    if (!(await this.serviceManager(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    return this.client.$transaction(async (tx) => {
      const delivery = await tx.videoDelivery.findFirst({
        where: {
          id: input.videoDeliveryId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
        },
        select: { id: true, notificationStatus: true },
      });
      if (delivery === null || delivery.notificationStatus === 'SENT') return null;
      const row = await tx.videoDelivery.update({
        where: { id: delivery.id },
        data: {
          notificationStatus: input.status,
          notificationErrorCode: input.errorCode,
          notificationAttemptCount: { increment: 1 },
          notifiedAt: input.attemptedAt,
        },
      });
      await tx.videoDeliveryEvent.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          videoDeliveryId: delivery.id,
          eventType: 'LINE_NOTIFICATION',
          eventData: {
            status: input.status,
            errorCode: input.errorCode,
          },
          performedByUserId: input.actorUserId,
        },
      });
      return videoDeliveryRecord(row);
    });
  }

  async revoke(input: Parameters<VideoDeliveryRepository['revoke']>[0]) {
    if (!(await this.serviceManager(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    return this.client.$transaction(async (tx) => {
      const delivery = await tx.videoDelivery.findFirst({
        where: {
          id: input.videoDeliveryId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { not: 'REVOKED' },
        },
      });
      if (delivery === null) return null;
      const now = new Date();
      const row = await tx.videoDelivery.update({
        where: { id: delivery.id },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await tx.videoDeliveryEvent.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          videoDeliveryId: delivery.id,
          eventType: 'REVOKED',
          eventData: { reason: input.reason },
          performedByUserId: input.actorUserId,
        },
      });
      return videoDeliveryRecord(row);
    });
  }
}

const videoSceneGenerationRecord = (
  row: Prisma.VideoSceneGenerationGetPayload<object>,
): VideoSceneGenerationRecord => ({
  ...row,
  inputSnapshot: row.inputSnapshot as Record<string, unknown>,
});

export class PrismaVideoSceneGenerationRepository implements VideoSceneGenerationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async enqueueAiScenes(input: Parameters<VideoSceneGenerationRepository['enqueueAiScenes']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const project = await tx.videoProject.findFirst({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: { in: ['APPROVED', 'QUEUED'] },
          group: {
            status: 'ACTIVE',
            featurePolicies: {
              some: {
                featureKey: 'VIDEO_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              },
            },
          },
          groupMembership: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            consentedAt: { not: null },
            featureAssignments: {
              some: {
                featureKey: 'VIDEO_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              },
            },
          },
        },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      if (!project) return null;
      const scenes = project.scenes.filter(
        (scene) =>
          scene.visualType === 'AI_VIDEO' ||
          (scene.aiProcessingTypes as unknown as string[]).includes('VIDEO_GENERATION'),
      );
      if (scenes.length === 0) return [];
      const rows = await Promise.all(
        scenes.map(async (scene) => {
          const estimatedCostUsdMicros = Math.round(
            (scene.durationMs / 1_000) * input.estimatedCostUsdMicrosPerSecond,
          );
          const characterSnapshot = project.characterProfileSnapshot as Record<string, unknown>;
          const characterName = characterSnapshot.name;
          const inputSnapshot: Prisma.InputJsonValue = {
            schemaVersion: 1,
            scene: {
              sceneNo: scene.sceneNo,
              durationMs: scene.durationMs,
              narration: scene.narration,
              caption: scene.caption,
              visualPrompt: scene.visualPrompt,
              keywords: scene.keywords as Prisma.InputJsonValue,
            },
            character: {
              name: typeof characterName === 'string' ? characterName : null,
              referenceImageCount: Array.isArray(project.characterReferenceSnapshot)
                ? project.characterReferenceSnapshot.length
                : 0,
            },
          };
          const existing = await tx.videoSceneGeneration.findUnique({
            where: {
              videoProjectId_projectRevision_videoSceneId_sceneRevision_provider_model: {
                videoProjectId: project.id,
                projectRevision: project.revision,
                videoSceneId: scene.id,
                sceneRevision: scene.revision,
                provider: input.provider,
                model: input.model,
              },
            },
          });
          if (existing) return existing;
          return tx.videoSceneGeneration.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: project.groupMembershipId,
              ownerUserId: input.actorUserId,
              videoProjectId: project.id,
              videoSceneId: scene.id,
              projectRevision: project.revision,
              sceneRevision: scene.revision,
              provider: input.provider,
              model: input.model,
              inputSnapshot,
              estimatedCostUsdMicros,
            },
          });
        }),
      );
      return rows.map(videoSceneGenerationRecord);
    });
  }

  async findForExecution(input: Parameters<VideoSceneGenerationRepository['findForExecution']>[0]) {
    const row = await this.client.videoSceneGeneration.findFirst({
      where: { id: input.generationId, workspaceId: input.workspaceId },
      include: { project: { select: { characterReferenceSnapshot: true } } },
    });
    if (!row) return null;
    const snapshot =
      row.inputSnapshot !== null &&
      typeof row.inputSnapshot === 'object' &&
      !Array.isArray(row.inputSnapshot)
        ? (row.inputSnapshot as Record<string, unknown>)
        : {};
    const scene =
      snapshot.scene !== null &&
      typeof snapshot.scene === 'object' &&
      !Array.isArray(snapshot.scene)
        ? (snapshot.scene as Record<string, unknown>)
        : {};
    const prompt = typeof scene.visualPrompt === 'string' ? scene.visualPrompt.trim() : '';
    const durationMs = typeof scene.durationMs === 'number' ? scene.durationMs : 0;
    if (!prompt || durationMs < 1 || durationMs > 10_000) return null;
    const references = Array.isArray(row.project.characterReferenceSnapshot)
      ? row.project.characterReferenceSnapshot
          .map((value) =>
            value !== null && typeof value === 'object' && !Array.isArray(value)
              ? (value as Record<string, unknown>).storageKey
              : null,
          )
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [];
    return {
      generation: videoSceneGenerationRecord(row),
      prompt,
      durationSeconds: durationMs <= 5_000 ? 5 : 10,
      referenceStorageKeys: references.slice(0, 7),
    } satisfies VideoSceneGenerationExecutionContext;
  }

  async markSubmitted(input: Parameters<VideoSceneGenerationRepository['markSubmitted']>[0]) {
    const changed = await this.client.videoSceneGeneration.updateMany({
      where: { id: input.generationId, workspaceId: input.workspaceId, status: 'QUEUED' },
      data: {
        status: 'SUBMITTED',
        externalJobId: input.externalJobId,
        startedAt: new Date(),
        errorCode: null,
      },
    });
    if (changed.count !== 1) return null;
    const row = await this.client.videoSceneGeneration.findUniqueOrThrow({
      where: { id: input.generationId },
    });
    return videoSceneGenerationRecord(row);
  }

  async markGenerating(input: Parameters<VideoSceneGenerationRepository['markGenerating']>[0]) {
    const changed = await this.client.videoSceneGeneration.updateMany({
      where: {
        id: input.generationId,
        workspaceId: input.workspaceId,
        status: { in: ['SUBMITTED', 'GENERATING'] },
      },
      data: { status: 'GENERATING' },
    });
    if (changed.count !== 1) return null;
    const row = await this.client.videoSceneGeneration.findUniqueOrThrow({
      where: { id: input.generationId },
    });
    return videoSceneGenerationRecord(row);
  }

  async markSucceeded(input: Parameters<VideoSceneGenerationRepository['markSucceeded']>[0]) {
    const changed = await this.client.videoSceneGeneration.updateMany({
      where: {
        id: input.generationId,
        workspaceId: input.workspaceId,
        status: { in: ['SUBMITTED', 'GENERATING'] },
      },
      data: {
        status: 'SUCCEEDED',
        outputStorageKey: input.outputStorageKey,
        completedAt: new Date(),
        expiresAt: assetRetentionExpiry(),
        errorCode: null,
      },
    });
    if (changed.count !== 1) return null;
    const row = await this.client.videoSceneGeneration.findUniqueOrThrow({
      where: { id: input.generationId },
    });
    return videoSceneGenerationRecord(row);
  }

  async markFailed(input: Parameters<VideoSceneGenerationRepository['markFailed']>[0]) {
    const changed = await this.client.videoSceneGeneration.updateMany({
      where: {
        id: input.generationId,
        workspaceId: input.workspaceId,
        status: { in: ['QUEUED', 'SUBMITTED', 'GENERATING'] },
      },
      data: { status: 'FAILED', errorCode: input.errorCode.slice(0, 80), completedAt: new Date() },
    });
    if (changed.count !== 1) return null;
    const row = await this.client.videoSceneGeneration.findUniqueOrThrow({
      where: { id: input.generationId },
    });
    return videoSceneGenerationRecord(row);
  }
}

export class PrismaVideoRenderRepository implements VideoRenderRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async enqueueApproved(input: Parameters<VideoRenderRepository['enqueueApproved']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const project = await tx.videoProject.findFirst({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: { in: ['APPROVED', 'QUEUED'] },
          group: {
            status: 'ACTIVE',
            featurePolicies: {
              some: {
                featureKey: 'VIDEO_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              },
            },
          },
          groupMembership: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            consentedAt: { not: null },
            featureAssignments: {
              some: {
                featureKey: 'VIDEO_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              },
            },
          },
        },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      if (!project) return null;
      const aiScenes = project.scenes.filter(
        (scene) =>
          scene.visualType === 'AI_VIDEO' ||
          (scene.aiProcessingTypes as unknown as string[]).includes('VIDEO_GENERATION'),
      );
      if (!project.standardComposition && aiScenes.length > 0) {
        const completedScenes = await tx.videoSceneGeneration.findMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            ownerUserId: input.actorUserId,
            videoProjectId: project.id,
            projectRevision: project.revision,
            status: 'SUCCEEDED',
            outputStorageKey: { not: null },
          },
          select: { videoSceneId: true, sceneRevision: true },
        });
        const completed = new Set(
          completedScenes.map((scene) => `${scene.videoSceneId}:${scene.sceneRevision}`),
        );
        if (aiScenes.some((scene) => !completed.has(`${scene.id}:${scene.revision}`))) return null;
      }
      const existing = await tx.videoRender.findUnique({
        where: {
          videoProjectId_projectRevision: {
            videoProjectId: project.id,
            projectRevision: input.expectedRevision,
          },
        },
      });
      if (existing) return videoRenderRecord(existing);
      if (project.status !== 'APPROVED') return null;
      const changed = await tx.videoProject.updateMany({
        where: { id: project.id, revision: input.expectedRevision, status: 'APPROVED' },
        data: { status: 'QUEUED' },
      });
      if (changed.count !== 1) return null;
      const row = await tx.videoRender.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: project.groupMembershipId,
          ownerUserId: input.actorUserId,
          videoProjectId: project.id,
          projectRevision: input.expectedRevision,
          provider: input.provider,
        },
      });
      return videoRenderRecord(row);
    });
  }

  async findForExecution(input: Parameters<VideoRenderRepository['findForExecution']>[0]) {
    const row = await this.client.videoRender.findFirst({
      where: { id: input.renderId, workspaceId: input.workspaceId },
      include: { project: { include: { scenes: { orderBy: { sceneNo: 'asc' } } } } },
    });
    if (!row) return null;
    const aiSceneIds = row.project.scenes
      .filter(
        (scene) =>
          scene.visualType === 'AI_VIDEO' ||
          (scene.aiProcessingTypes as unknown as string[]).includes('VIDEO_GENERATION'),
      )
      .map((scene) => ({ id: scene.id, revision: scene.revision }));
    const outputs =
      aiSceneIds.length === 0
        ? []
        : await this.client.videoSceneGeneration.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: row.groupId,
              ownerUserId: row.ownerUserId,
              videoProjectId: row.videoProjectId,
              projectRevision: row.projectRevision,
              status: 'SUCCEEDED',
              outputStorageKey: { not: null },
              OR: aiSceneIds.map((scene) => ({
                videoSceneId: scene.id,
                sceneRevision: scene.revision,
              })),
            },
            select: { videoSceneId: true, outputStorageKey: true },
          });
    const aiSceneSources = outputs.flatMap((output) =>
      output.outputStorageKey
        ? [{ videoSceneId: output.videoSceneId, storageKey: output.outputStorageKey }]
        : [],
    );
    if (!row.project.standardComposition && aiSceneSources.length !== aiSceneIds.length)
      return null;
    return {
      render: videoRenderRecord(row),
      project: videoProjectRecord(row.project),
      aiSceneSources,
    };
  }

  async markSubmitted(input: Parameters<VideoRenderRepository['markSubmitted']>[0]) {
    return this.client.$transaction(async (tx) => {
      const changed = await tx.videoRender.updateMany({
        where: { id: input.renderId, workspaceId: input.workspaceId, status: 'QUEUED' },
        data: {
          status: 'SUBMITTED',
          externalJobId: input.externalJobId,
          startedAt: new Date(),
          errorCode: null,
        },
      });
      if (changed.count !== 1) return null;
      const render = await tx.videoRender.findUniqueOrThrow({ where: { id: input.renderId } });
      await tx.videoProject.updateMany({
        where: {
          id: render.videoProjectId,
          workspaceId: input.workspaceId,
          status: 'QUEUED',
        },
        data: { status: 'RENDERING' },
      });
      return videoRenderRecord(render);
    });
  }

  async markRendering(input: Parameters<VideoRenderRepository['markRendering']>[0]) {
    const changed = await this.client.videoRender.updateMany({
      where: {
        id: input.renderId,
        workspaceId: input.workspaceId,
        status: { in: ['SUBMITTED', 'RENDERING'] },
      },
      data: { status: 'RENDERING' },
    });
    if (changed.count !== 1) return null;
    return videoRenderRecord(
      await this.client.videoRender.findUniqueOrThrow({ where: { id: input.renderId } }),
    );
  }

  async markSucceeded(input: Parameters<VideoRenderRepository['markSucceeded']>[0]) {
    return this.client.$transaction(async (tx) => {
      const changed = await tx.videoRender.updateMany({
        where: {
          id: input.renderId,
          workspaceId: input.workspaceId,
          status: { in: ['SUBMITTED', 'RENDERING'] },
        },
        data: {
          status: 'SUCCEEDED',
          outputStorageKey: input.outputStorageKey,
          completedAt: new Date(),
          expiresAt: assetRetentionExpiry(),
          errorCode: null,
        },
      });
      if (changed.count !== 1) return null;
      const render = await tx.videoRender.findUniqueOrThrow({ where: { id: input.renderId } });
      await tx.videoProject.updateMany({
        where: { id: render.videoProjectId, workspaceId: input.workspaceId, status: 'RENDERING' },
        data: { status: 'READY_FOR_REVIEW' },
      });
      return videoRenderRecord(render);
    });
  }

  async markFailed(input: Parameters<VideoRenderRepository['markFailed']>[0]) {
    return this.client.$transaction(async (tx) => {
      const changed = await tx.videoRender.updateMany({
        where: {
          id: input.renderId,
          workspaceId: input.workspaceId,
          status: { in: ['QUEUED', 'SUBMITTED', 'RENDERING'] },
        },
        data: { status: 'FAILED', errorCode: input.errorCode, completedAt: new Date() },
      });
      if (changed.count !== 1) return null;
      const render = await tx.videoRender.findUniqueOrThrow({ where: { id: input.renderId } });
      await tx.videoProject.updateMany({
        where: {
          id: render.videoProjectId,
          workspaceId: input.workspaceId,
          status: { in: ['QUEUED', 'RENDERING'] },
        },
        data: { status: 'FAILED' },
      });
      return videoRenderRecord(render);
    });
  }
}

const emptyVideoRenderCounts = () => ({
  QUEUED: 0,
  SUBMITTED: 0,
  RENDERING: 0,
  SUCCEEDED: 0,
  FAILED: 0,
  CANCELLED: 0,
});

const emptyVideoSceneGenerationCounts = () => ({
  QUEUED: 0,
  SUBMITTED: 0,
  GENERATING: 0,
  SUCCEEDED: 0,
  FAILED: 0,
  CANCELLED: 0,
});

export class PrismaVideoRenderOperationsRepository implements VideoRenderOperationsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async getSnapshot(input: Parameters<VideoRenderOperationsRepository['getSnapshot']>[0]) {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    const jobs = await this.client.job.findMany({
      where: {
        environment: input.environment,
        jobType: { in: ['VIDEO_RENDER_PROCESS', 'VIDEO_AI_SCENE_GENERATION_PROCESS'] },
      },
      select: { payloadReference: true },
    });
    const renderIds = [
      ...new Set(
        jobs
          .map(
            ({ payloadReference }) => /^video-render:([0-9a-f-]{36})$/i.exec(payloadReference)?.[1],
          )
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const sceneGenerationIds = [
      ...new Set(
        jobs
          .map(
            ({ payloadReference }) =>
              /^video-ai-scene:([0-9a-f-]{36})$/i.exec(payloadReference)?.[1],
          )
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const rows = await this.client.videoRender.findMany({
      where: { id: { in: renderIds } },
      include: { project: { select: { title: true, group: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const counts = emptyVideoRenderCounts();
    const sceneCounts = emptyVideoSceneGenerationCounts();
    const [groupedCounts, sceneGroupedCounts, sceneRows] = await Promise.all([
      this.client.videoRender.groupBy({
        by: ['status'],
        where: { id: { in: renderIds } },
        _count: { _all: true },
      }),
      this.client.videoSceneGeneration.groupBy({
        by: ['status'],
        where: { id: { in: sceneGenerationIds } },
        _count: { _all: true },
      }),
      this.client.videoSceneGeneration.findMany({
        where: { id: { in: sceneGenerationIds } },
        include: {
          scene: { select: { sceneNo: true } },
          project: { select: { title: true, group: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    for (const row of groupedCounts) counts[row.status] = row._count._all;
    for (const row of sceneGroupedCounts) sceneCounts[row.status] = row._count._all;
    return {
      counts,
      items: rows.map((row) => ({
        id: row.id,
        projectTitle: row.project.title,
        groupName: row.project.group.name,
        provider: row.provider,
        status: row.status,
        errorCode: row.errorCode,
        externalJobRegistered: Boolean(row.externalJobId),
        retryable:
          row.status === 'FAILED' &&
          VIDEO_RENDER_ADMIN_RETRYABLE_FAILURES.includes(
            row.errorCode as (typeof VIDEO_RENDER_ADMIN_RETRYABLE_FAILURES)[number],
          ),
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        usageCountedAt: row.usageCountedAt,
        notificationStatus: row.notificationStatus,
        notifiedAt: row.notifiedAt,
      })),
      sceneCounts,
      sceneItems: sceneRows.map((row) => ({
        id: row.id,
        projectTitle: row.project.title,
        groupName: row.project.group.name,
        sceneNo: row.scene.sceneNo,
        provider: row.provider,
        model: row.model,
        status: row.status,
        errorCode: row.errorCode,
        estimatedCostUsdMicros: row.estimatedCostUsdMicros,
        actualCostUsdMicros: row.actualCostUsdMicros,
        retryable:
          row.status === 'FAILED' &&
          VIDEO_AI_SCENE_ADMIN_RETRYABLE_FAILURES.includes(
            row.errorCode as (typeof VIDEO_AI_SCENE_ADMIN_RETRYABLE_FAILURES)[number],
          ),
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
      })),
    };
  }

  async requestRetry(input: Parameters<VideoRenderOperationsRepository['requestRetry']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const now = new Date();
        const admin = await tx.platformAdmin.findFirst({
          where: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
          },
          select: { id: true },
        });
        if (!admin) return null;
        const render = await tx.videoRender.findFirst({
          where: {
            id: input.renderId,
            status: 'FAILED',
            errorCode: { in: [...VIDEO_RENDER_ADMIN_RETRYABLE_FAILURES] },
            completedAt: { not: null },
            project: {
              status: 'FAILED',
              group: {
                status: 'ACTIVE',
                featurePolicies: {
                  some: {
                    featureKey: 'VIDEO_GENERATION',
                    status: 'ENABLED',
                    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                    AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
                  },
                },
              },
              groupMembership: {
                status: 'ACTIVE',
                consentedAt: { not: null },
                featureAssignments: {
                  some: {
                    featureKey: 'VIDEO_GENERATION',
                    status: 'ENABLED',
                    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                    AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
                  },
                },
              },
              ownerUser: { status: 'ACTIVE' },
              workspace: { status: 'ACTIVE' },
            },
          },
          include: { project: { select: { bunshinId: true } } },
        });
        if (!render?.completedAt) return null;
        const originalJob = await tx.job.findFirst({
          where: {
            environment: input.environment,
            jobType: 'VIDEO_RENDER_PROCESS',
            payloadReference: `video-render:${render.id}`,
          },
          select: { id: true },
        });
        if (!originalJob) return null;
        const nextStatus = render.externalJobId ? 'SUBMITTED' : 'QUEUED';
        const changed = await tx.videoRender.updateMany({
          where: { id: render.id, status: 'FAILED', completedAt: render.completedAt },
          data: { status: nextStatus, errorCode: null, completedAt: null },
        });
        if (changed.count !== 1) return null;
        await tx.videoProject.update({
          where: { id: render.videoProjectId },
          data: { status: render.externalJobId ? 'RENDERING' : 'QUEUED' },
        });
        const job = await tx.job.create({
          data: {
            environment: input.environment,
            workspaceId: render.workspaceId,
            bunshinId: render.project.bunshinId,
            jobType: 'VIDEO_RENDER_PROCESS',
            payloadReference: `video-render:${render.id}`,
            idempotencyKey: `video-render-admin-retry:${render.id}:${render.completedAt.toISOString()}`,
            correlationId: input.requestId,
            requestedBy: render.ownerUserId,
            priority: 40,
            maxAttempts: 12,
          },
        });
        return tx.videoRenderRetryRequest.create({
          data: {
            id: input.requestId,
            environment: input.environment,
            videoRenderId: render.id,
            failedAtSnapshot: render.completedAt,
            actorUserId: input.actorUserId,
            reason: input.reason,
            jobId: job.id,
          },
          select: { id: true, jobId: true, createdAt: true },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'this video render failure already has a retry job');
      throw error;
    }
  }

  async requestSceneRetry(
    input: Parameters<VideoRenderOperationsRepository['requestSceneRetry']>[0],
  ) {
    try {
      return await this.client.$transaction(async (tx) => {
        const now = new Date();
        const admin = await tx.platformAdmin.findFirst({
          where: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
          },
          select: { id: true },
        });
        if (!admin) return null;
        const generation = await tx.videoSceneGeneration.findFirst({
          where: {
            id: input.generationId,
            status: 'FAILED',
            errorCode: { in: [...VIDEO_AI_SCENE_ADMIN_RETRYABLE_FAILURES] },
            completedAt: { not: null },
            project: {
              status: 'FAILED',
              group: {
                status: 'ACTIVE',
                featurePolicies: {
                  some: {
                    featureKey: 'VIDEO_GENERATION',
                    status: 'ENABLED',
                    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                    AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
                  },
                },
              },
              groupMembership: {
                status: 'ACTIVE',
                consentedAt: { not: null },
                featureAssignments: {
                  some: {
                    featureKey: 'VIDEO_GENERATION',
                    status: 'ENABLED',
                    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                    AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
                  },
                },
              },
              ownerUser: { status: 'ACTIVE' },
              workspace: { status: 'ACTIVE' },
            },
          },
          include: { project: { select: { bunshinId: true } } },
        });
        if (!generation?.completedAt) return null;
        const originalJob = await tx.job.findFirst({
          where: {
            environment: input.environment,
            jobType: 'VIDEO_AI_SCENE_GENERATION_PROCESS',
            payloadReference: `video-ai-scene:${generation.id}`,
          },
          select: { id: true },
        });
        if (!originalJob) return null;
        const changed = await tx.videoSceneGeneration.updateMany({
          where: { id: generation.id, status: 'FAILED', completedAt: generation.completedAt },
          data: {
            status: 'QUEUED',
            externalJobId: null,
            outputStorageKey: null,
            errorCode: null,
            startedAt: null,
            completedAt: null,
            actualCostUsdMicros: null,
          },
        });
        if (changed.count !== 1) return null;
        await tx.videoProject.update({
          where: { id: generation.videoProjectId },
          data: { status: 'QUEUED' },
        });
        const job = await tx.job.create({
          data: {
            environment: input.environment,
            workspaceId: generation.workspaceId,
            bunshinId: generation.project.bunshinId,
            jobType: 'VIDEO_AI_SCENE_GENERATION_PROCESS',
            payloadReference: `video-ai-scene:${generation.id}`,
            idempotencyKey: `video-ai-scene-admin-retry:${generation.id}:${generation.completedAt.toISOString()}`,
            correlationId: input.requestId,
            requestedBy: generation.ownerUserId,
            priority: 40,
            maxAttempts: 12,
          },
        });
        return tx.videoSceneGenerationRetryRequest.create({
          data: {
            id: input.requestId,
            environment: input.environment,
            videoSceneGenerationId: generation.id,
            failedAtSnapshot: generation.completedAt,
            actorUserId: input.actorUserId,
            reason: input.reason,
            jobId: job.id,
          },
          select: { id: true, jobId: true, createdAt: true },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError(
          'CONFLICT',
          'this video scene generation failure already has a retry job',
        );
      throw error;
    }
  }
}

export class PrismaVideoRenderCompletionRepository implements VideoRenderCompletionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async finalize(input: Parameters<VideoRenderCompletionRepository['finalize']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const render = await tx.videoRender.findFirst({
          where: {
            id: input.renderId,
            workspaceId: input.workspaceId,
            status: 'SUCCEEDED',
            completedAt: { not: null },
            outputStorageKey: { not: null },
          },
          include: { project: { select: { bunshinId: true, title: true } } },
        });
        if (!render) return null;
        const environmentJob = await tx.job.findFirst({
          where: {
            environment: input.environment,
            workspaceId: input.workspaceId,
            jobType: 'VIDEO_RENDER_PROCESS',
            payloadReference: `video-render:${render.id}`,
          },
          select: { id: true },
        });
        if (!environmentJob) return null;
        await tx.groupFeatureUsageEvent.upsert({
          where: {
            groupMembershipId_featureKey_operationKey: {
              groupMembershipId: render.groupMembershipId,
              featureKey: 'VIDEO_GENERATION',
              operationKey: `video-render-completed:${render.id}`,
            },
          },
          update: {},
          create: {
            workspaceId: render.workspaceId,
            groupId: render.groupId,
            groupMembershipId: render.groupMembershipId,
            featureKey: 'VIDEO_GENERATION',
            actorUserId: render.ownerUserId,
            operationKey: `video-render-completed:${render.id}`,
            localDate: input.localDate,
            localMonth: input.localDate.slice(0, 7),
            occurredAt: input.completedAt,
          },
        });
        const updated = await tx.videoRender.update({
          where: { id: render.id },
          data: {
            ...(render.usageCountedAt ? {} : { usageCountedAt: input.completedAt }),
            ...(render.notificationStatus ? {} : { notificationStatus: 'PENDING' }),
          },
        });
        return {
          renderId: render.id,
          workspaceId: render.workspaceId,
          groupId: render.groupId,
          bunshinId: render.project.bunshinId,
          ownerUserId: render.ownerUserId,
          videoProjectId: render.videoProjectId,
          projectTitle: render.project.title,
          notificationStatus: updated.notificationStatus ?? 'PENDING',
          notificationAttemptCount: updated.notificationAttemptCount,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async recordNotification(
    input: Parameters<VideoRenderCompletionRepository['recordNotification']>[0],
  ) {
    const changed = await this.client.videoRender.updateMany({
      where: {
        id: input.renderId,
        status: 'SUCCEEDED',
        notificationStatus: { in: ['PENDING', 'FAILED'] },
      },
      data: {
        notificationStatus: input.status,
        notificationErrorCode: input.errorCode,
        notificationAttemptCount: { increment: 1 },
        ...(input.status === 'SENT' ? { notifiedAt: input.attemptedAt } : {}),
      },
    });
    return changed.count === 1;
  }
}

export class PrismaVideoPlanningContextRepository implements VideoPlanningContextRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findAuthorized(input: Parameters<VideoPlanningContextRepository['findAuthorized']>[0]) {
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { not: 'ARCHIVED' },
        videoProjects: {
          some: {
            id: input.videoProjectId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            ownerUserId: input.actorUserId,
          },
        },
      },
      include: { personality: true },
    });
    if (!bunshin) return null;
    const project = await this.client.videoProject.findFirst({
      where: {
        id: input.videoProjectId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        bunshinId: input.bunshinId,
        campaignId: input.campaignId,
      },
      select: { characterProfileSnapshot: true, characterReferenceSnapshot: true },
    });
    if (!project) return null;
    const characterSnapshot =
      project.characterProfileSnapshot !== null &&
      typeof project.characterProfileSnapshot === 'object' &&
      !Array.isArray(project.characterProfileSnapshot)
        ? (project.characterProfileSnapshot as Record<string, unknown>)
        : {};
    const referenceSnapshot = Array.isArray(project.characterReferenceSnapshot)
      ? project.characterReferenceSnapshot
      : [];
    const safetyRules = Array.isArray(characterSnapshot.safetyRules)
      ? characterSnapshot.safetyRules.filter((item): item is string => typeof item === 'string')
      : [];
    const character =
      typeof characterSnapshot.name === 'string' &&
      typeof characterSnapshot.appearance === 'string' &&
      typeof characterSnapshot.worldSetting === 'string'
        ? {
            name: characterSnapshot.name,
            appearance: characterSnapshot.appearance,
            worldSetting: characterSnapshot.worldSetting,
            safetyRules,
            referenceImageCount: referenceSnapshot.length,
          }
        : null;

    const now = new Date();
    const userAssets = await this.client.videoAsset.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        status: 'READY',
        AND: [
          { OR: [{ videoProjectId: null }, { videoProjectId: input.videoProjectId }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    let product = null;
    let approvedAssets: Array<{ assetId: string; description: string }> = [];
    if (input.campaignId) {
      const campaign = await this.client.campaign.findFirst({
        where: {
          id: input.campaignId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'OPEN',
          startsAt: { lte: now },
          endsAt: { gt: now },
          group: {
            status: 'ACTIVE',
            memberships: {
              some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
            },
          },
          participations: {
            some: {
              participantWorkspaceId: input.workspaceId,
              userId: input.actorUserId,
              bunshinId: input.bunshinId,
              status: 'ACCEPTED',
            },
          },
          productPackVersion: {
            status: 'PUBLISHED',
            assignments: { some: { bunshinId: input.bunshinId, status: 'ACTIVE' } },
          },
        },
        include: {
          productPackVersion: {
            include: {
              productPack: true,
              rules: { orderBy: { sortOrder: 'asc' } },
            },
          },
          assets: { include: { productPackAsset: true }, orderBy: { sortOrder: 'asc' } },
        },
      });
      if (!campaign) return null;
      const facts = campaign.productPackVersion.facts as Record<string, unknown>;
      product = {
        name: campaign.productPackVersion.productPack.name,
        facts: [
          campaign.productPackVersion.summary,
          ...Object.entries(facts).map(([key, value]) => `${key}: ${String(value)}`),
        ],
        requiredDisclosures: campaign.productPackVersion.rules
          .filter((rule) => rule.type === 'REQUIRED_DISCLOSURE')
          .map((rule) => rule.value),
        prohibitedExpressions: campaign.productPackVersion.rules
          .filter((rule) => rule.type === 'FORBIDDEN_EXPRESSION')
          .map((rule) => rule.value),
      };
      approvedAssets = campaign.assets
        .filter(({ productPackAsset }) =>
          productPackAsset.validUntil ? productPackAsset.validUntil > now : true,
        )
        .map(({ productPackAsset }) => ({
          assetId: productPackAsset.id,
          description: `${productPackAsset.label}（${productPackAsset.usageTerms}）`,
        }));
    }

    return {
      objective: bunshin.objectiveSummary,
      audience: bunshin.audienceSummary,
      personality: {
        tone: bunshin.personality?.tone ?? bunshin.personalitySummary,
        preferredExpressions:
          (bunshin.personality?.preferredExpressions as string[] | undefined) ?? [],
        prohibitedExpressions:
          (bunshin.personality?.forbiddenExpressions as string[] | undefined) ?? [],
      },
      character,
      product,
      approvedAssets,
      userAssets: userAssets.map((asset) => ({
        assetId: asset.id,
        kind: asset.kind,
        description: `${asset.originalFilename}${asset.usageTerms ? `（${asset.usageTerms}）` : ''}`,
      })),
    };
  }
}

const videoDisclosurePolicyRecord = (
  row: Prisma.VideoDisclosurePolicyGetPayload<object>,
): VideoDisclosurePolicy => ({
  ...row,
  hashtags: row.hashtags as string[],
  outputMetadata: row.outputMetadata as Record<string, string>,
});

export class PrismaVideoDisclosurePolicyRepository implements VideoDisclosurePolicyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: Parameters<VideoDisclosurePolicyRepository['list']>[0]) {
    const rows = await this.client.videoDisclosurePolicy.findMany({
      where: { environment: input.environment },
      orderBy: [{ platform: 'asc' }, { version: 'desc' }],
    });
    return rows.map(videoDisclosurePolicyRecord);
  }

  async createDraft(input: Parameters<VideoDisclosurePolicyRepository['createDraft']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const latest = await tx.videoDisclosurePolicy.aggregate({
          where: { environment: input.environment, platform: input.platform },
          _max: { version: true },
        });
        const created = await tx.videoDisclosurePolicy.create({
          data: {
            environment: input.environment,
            platform: input.platform,
            version: (latest._max.version ?? 0) + 1,
            disclosureText: input.disclosureText,
            hashtags: input.hashtags,
            guidance: input.guidance,
            outputMetadata: input.outputMetadata,
            changeReason: input.changeReason,
            createdByUserId: input.actorUserId,
            createdAt: input.now,
          },
        });
        return videoDisclosurePolicyRecord(created);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async activate(input: Parameters<VideoDisclosurePolicyRepository['activate']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const target = await tx.videoDisclosurePolicy.findUnique({ where: { id: input.policyId } });
        if (!target || target.environment !== input.environment || target.status !== 'DRAFT')
          return null;
        await tx.videoDisclosurePolicy.updateMany({
          where: {
            environment: target.environment,
            platform: target.platform,
            status: 'ACTIVE',
          },
          data: { status: 'SUPERSEDED', supersededAt: input.now },
        });
        const activated = await tx.videoDisclosurePolicy.update({
          where: { id: target.id },
          data: {
            status: 'ACTIVE',
            activationReason: input.activationReason,
            activatedByUserId: input.actorUserId,
            activatedAt: input.now,
          },
        });
        return videoDisclosurePolicyRecord(activated);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findActive(input: Parameters<VideoDisclosurePolicyRepository['findActive']>[0]) {
    const found = await this.client.videoDisclosurePolicy.findFirst({
      where: { environment: input.environment, platform: input.platform, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    return found ? videoDisclosurePolicyRecord(found) : null;
  }
}

const socialImageGenerationRequestRecord = (
  row: Prisma.SocialImageGenerationRequestGetPayload<object>,
): SocialImageGenerationRequestRecord => ({
  ...row,
  status: row.status,
  templateKey: row.templateKey as SocialImageGenerationRequestRecord['templateKey'],
  layout: row.layout as unknown as SocialImageGenerationRequestRecord['layout'],
});

const socialImagePilotEvidenceRecord = (
  row: Prisma.SocialImagePilotEvidenceGetPayload<object>,
): SocialImagePilotEvidenceRecord => ({
  ...row,
  checkKey: row.checkKey,
  action: row.action,
});

const socialImagePilotApprovalChecks = [
  'PLAN_APPROVAL',
  'STORAGE_RETENTION',
  'MOBILE_E2E',
  'SECURITY_ISOLATION',
  'TEN_THEME_VALIDATION',
  'FINAL_APPROVAL',
] as const;

async function socialImagePilotIsApproved(
  client: PrismaClient | Prisma.TransactionClient,
  input: { workspaceId: string; groupId: string; pilotId: string },
) {
  const rows = await client.socialImagePilotEvidence.findMany({
    where: input,
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    select: { checkKey: true, action: true },
  });
  const latest = new Map(rows.map((row) => [row.checkKey, row.action]));
  return socialImagePilotApprovalChecks.every((key) => latest.get(key) === 'RECORDED');
}

export class PrismaSocialImagePilotEvidenceRepository implements SocialImagePilotEvidenceRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: Parameters<SocialImagePilotEvidenceRepository['list']>[0]) {
    const [admin, pilot] = await Promise.all([
      this.client.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.client.socialImageGenerationPilot.findFirst({
        where: {
          id: input.pilotId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
        },
        select: { id: true },
      }),
    ]);
    if (!admin || !pilot) return null;
    const rows = await this.client.socialImagePilotEvidence.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        pilotId: input.pilotId,
      },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map(socialImagePilotEvidenceRecord);
  }

  async append(input: Parameters<SocialImagePilotEvidenceRepository['append']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const [admin, pilot] = await Promise.all([
          tx.platformAdmin.findFirst({
            where: { userId: input.actorUserId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
            select: { id: true },
          }),
          tx.socialImageGenerationPilot.findFirst({
            where: {
              id: input.pilotId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
            },
            select: { id: true },
          }),
        ]);
        if (!admin || !pilot) return null;
        if (input.checkKey === 'FINAL_APPROVAL' && input.action === 'RECORDED') {
          const rows = await tx.socialImagePilotEvidence.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              pilotId: input.pilotId,
            },
            orderBy: { occurredAt: 'asc' },
            select: { checkKey: true, action: true },
          });
          const latest = new Map(rows.map((row) => [row.checkKey, row.action]));
          const required = [
            'PLAN_APPROVAL',
            'STORAGE_RETENTION',
            'MOBILE_E2E',
            'SECURITY_ISOLATION',
            'TEN_THEME_VALIDATION',
          ] as const;
          if (!required.every((key) => latest.get(key) === 'RECORDED')) return null;
        }
        return socialImagePilotEvidenceRecord(
          await tx.socialImagePilotEvidence.create({ data: input }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

export class PrismaSocialImageGenerationRequestRepository implements SocialImageGenerationRequestRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async activeScope(
    tx: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId: string;
      groupMembershipId: string;
      actorUserId: string;
      pilotEnrollmentId: string;
    },
    now = new Date(),
  ) {
    const membership = await tx.groupMembership.findFirst({
      where: {
        id: input.groupMembershipId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        group: {
          status: 'ACTIVE',
          featurePolicies: {
            some: {
              featureKey: 'SOCIAL.IMAGE_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
        featureAssignments: {
          some: {
            featureKey: 'SOCIAL.IMAGE_GENERATION',
            status: 'ENABLED',
            OR: [{ startsAt: null }, { startsAt: { lte: now } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
          },
        },
      },
      select: { id: true },
    });
    if (!membership) return false;
    const enrollment = await tx.socialImagePilotEnrollment.findFirst({
      where: {
        id: input.pilotEnrollmentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        status: 'ACTIVE',
        revokedAt: null,
        pilot: {
          status: 'ACTIVE',
          emergencyStop: false,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
        },
      },
      select: { id: true },
    });
    return Boolean(enrollment);
  }

  async create(input: Parameters<SocialImageGenerationRequestRepository['create']>[0]) {
    const lookup = {
      workspaceId_groupId_ownerUserId_idempotencyKey: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
    } as const;
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.activeScope(tx, input))) return null;
        const existing = await tx.socialImageGenerationRequest.findUnique({ where: lookup });
        if (existing) return socialImageGenerationRequestRecord(existing);
        const bunshin = await tx.bunshin.findFirst({
          where: {
            id: input.bunshinId,
            workspaceId: input.workspaceId,
            ownerUserId: input.actorUserId,
            status: { not: 'ARCHIVED' },
          },
          select: { id: true },
        });
        if (!bunshin) return null;
        const mission = await tx.dailyMission.findFirst({
          where: {
            id: input.dailyMissionId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            format: { in: ['IMAGE', 'SLIDE'] },
          },
          select: { id: true },
        });
        if (!mission) return null;
        if (input.campaignId) {
          const campaign = await tx.campaign.findFirst({
            where: {
              id: input.campaignId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
            },
            select: { id: true, productPackVersionId: true },
          });
          if (!campaign || campaign.productPackVersionId !== input.productPackVersionId)
            return null;
        } else if (input.productPackVersionId) {
          const product = await tx.productPackVersion.findFirst({
            where: {
              id: input.productPackVersionId,
              status: 'PUBLISHED',
              productPack: {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                status: 'ACTIVE',
              },
            },
            select: { id: true },
          });
          if (!product) return null;
        }
        if (input.generationContextSnapshotId) {
          const snapshot = await tx.generationContextSnapshot.findFirst({
            where: {
              id: input.generationContextSnapshotId,
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              dailyMissionId: input.dailyMissionId,
            },
            select: { id: true },
          });
          if (!snapshot) return null;
        }
        const row = await tx.socialImageGenerationRequest.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: input.groupMembershipId,
            ownerUserId: input.actorUserId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
            campaignId: input.campaignId,
            productPackVersionId: input.productPackVersionId,
            generationContextSnapshotId: input.generationContextSnapshotId,
            pilotEnrollmentId: input.pilotEnrollmentId,
            templateKey: input.layout.templateKey,
            layout: input.layout as unknown as Prisma.InputJsonValue,
            idempotencyKey: input.idempotencyKey,
          },
        });
        return socialImageGenerationRequestRecord(row);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.client.socialImageGenerationRequest.findUnique({ where: lookup });
      return existing ? socialImageGenerationRequestRecord(existing) : null;
    }
  }

  async findOwned(input: Parameters<SocialImageGenerationRequestRepository['findOwned']>[0]) {
    return this.client.$transaction(async (tx) => {
      const row = await tx.socialImageGenerationRequest.findFirst({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
        },
      });
      if (!row) return null;
      if (
        !(await this.activeScope(tx, {
          workspaceId: row.workspaceId,
          groupId: row.groupId,
          groupMembershipId: row.groupMembershipId,
          actorUserId: row.ownerUserId,
          pilotEnrollmentId: row.pilotEnrollmentId,
        }))
      )
        return null;
      return socialImageGenerationRequestRecord(row);
    });
  }

  async transition(input: Parameters<SocialImageGenerationRequestRepository['transition']>[0]) {
    return this.client.$transaction(async (tx) => {
      const row = await tx.socialImageGenerationRequest.findFirst({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
        },
      });
      if (!row) return null;
      if (
        !(await this.activeScope(tx, {
          workspaceId: row.workspaceId,
          groupId: row.groupId,
          groupMembershipId: row.groupMembershipId,
          actorUserId: row.ownerUserId,
          pilotEnrollmentId: row.pilotEnrollmentId,
        }))
      )
        return null;
      const changed = await tx.socialImageGenerationRequest.updateMany({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: input.fromStatus,
        },
        data: {
          status: input.toStatus,
          errorCode: input.errorCode,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) return null;
      return socialImageGenerationRequestRecord(
        await tx.socialImageGenerationRequest.findUniqueOrThrow({
          where: { id: input.requestId },
        }),
      );
    });
  }

  async findMediaOwned(
    input: Parameters<SocialImageGenerationRequestRepository['findMediaOwned']>[0],
  ) {
    const request = await this.findOwned(input);
    if (!request || request.status !== 'READY_FOR_REVIEW') return null;
    const media = await this.client.socialImageGeneratedMedia.findFirst({
      where: {
        requestId: request.id,
        workspaceId: request.workspaceId,
        groupId: request.groupId,
        ownerUserId: request.ownerUserId,
        status: { in: ['READY', 'ADOPTED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    return media ? { ...media, width: 1080 as const, height: 1350 as const } : null;
  }

  async setMediaStatus(
    input: Parameters<SocialImageGenerationRequestRepository['setMediaStatus']>[0],
  ) {
    return this.client.$transaction(async (tx) => {
      const request = await tx.socialImageGenerationRequest.findFirst({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          status: 'READY_FOR_REVIEW',
        },
      });
      if (!request) return null;
      if (
        !(await this.activeScope(tx, {
          workspaceId: request.workspaceId,
          groupId: request.groupId,
          groupMembershipId: request.groupMembershipId,
          actorUserId: request.ownerUserId,
          pilotEnrollmentId: request.pilotEnrollmentId,
        }))
      )
        return null;
      const target = await tx.socialImageGeneratedMedia.findFirst({
        where: {
          id: input.mediaId,
          requestId: request.id,
          workspaceId: request.workspaceId,
          groupId: request.groupId,
          ownerUserId: request.ownerUserId,
          status: { in: ['READY', 'ADOPTED'] },
        },
      });
      if (!target) return null;
      if (input.status === 'ADOPTED') {
        await tx.socialImageGeneratedMedia.updateMany({
          where: {
            workspaceId: request.workspaceId,
            dailyMissionId: request.dailyMissionId,
            status: 'ADOPTED',
            id: { not: target.id },
          },
          data: { status: 'READY' },
        });
      }
      const media = await tx.socialImageGeneratedMedia.update({
        where: { id: target.id },
        data: { status: input.status },
      });
      return { ...media, width: 1080 as const, height: 1350 as const };
    });
  }
}

export class PrismaSocialImageGenerationAuthorizationRepository implements SocialImageGenerationAuthorizationPort {
  constructor(private readonly client: PrismaClient = prisma) {}

  async authorize(input: Parameters<SocialImageGenerationAuthorizationPort['authorize']>[0]) {
    if (input.environment !== 'PRODUCTION')
      return { allowed: false as const, reason: 'NOT_PRODUCTION' as const };
    const membership = await this.client.groupMembership.findFirst({
      where: {
        id: input.groupMembershipId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        group: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!membership) return { allowed: false as const, reason: 'MEMBERSHIP_UNAVAILABLE' as const };
    const access = await new PrismaGroupFeatureEntitlementRepository(this.client).resolveAccess({
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      actorUserId: input.actorUserId,
      featureKey: 'SOCIAL.IMAGE_GENERATION',
      now: input.now,
    });
    if (!access?.allowed)
      return { allowed: false as const, reason: 'FEATURE_UNAVAILABLE' as const };
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { not: 'ARCHIVED' },
        capabilityAssignments: { some: { capabilityType: 'SOCIAL', status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!bunshin) return { allowed: false as const, reason: 'BUNSHIN_UNAVAILABLE' as const };
    const mission = await this.client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        format: { in: ['IMAGE', 'SLIDE'] },
      },
      select: { id: true },
    });
    if (!mission) return { allowed: false as const, reason: 'MISSION_FORMAT_UNAVAILABLE' as const };
    if (input.campaignId) {
      const campaign = await this.client.campaign.findFirst({
        where: {
          id: input.campaignId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ...(input.productPackVersionId
            ? { productPackVersionId: input.productPackVersionId }
            : {}),
          status: 'OPEN',
          startsAt: { lte: input.now },
          endsAt: { gt: input.now },
          participations: {
            some: {
              participantWorkspaceId: input.workspaceId,
              userId: input.actorUserId,
              bunshinId: input.bunshinId,
              status: 'ACCEPTED',
              consentedAt: { not: null },
            },
          },
        },
        select: { id: true },
      });
      if (!campaign) return { allowed: false as const, reason: 'CAMPAIGN_UNAVAILABLE' as const };
    }
    const enrollment = await this.client.socialImagePilotEnrollment.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        status: 'ACTIVE',
        revokedAt: null,
        pilot: {
          status: 'ACTIVE',
          emergencyStop: false,
          OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
        },
      },
      include: { pilot: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!enrollment) return { allowed: false as const, reason: 'PILOT_UNAVAILABLE' as const };
    if (
      !(await socialImagePilotIsApproved(this.client, {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        pilotId: enrollment.pilotId,
      }))
    )
      return { allowed: false as const, reason: 'PILOT_UNAVAILABLE' as const };
    const dailyFrom = new Date(
      Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate()),
    );
    const monthlyFrom = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1));
    const success = {
      status: 'READY_FOR_REVIEW' as const,
      pilotEnrollment: { pilotId: enrollment.pilotId },
    };
    const [dailyUsed, monthlyUsed, memberUsed] = await Promise.all([
      this.client.socialImageGenerationRequest.count({
        where: { ...success, updatedAt: { gte: dailyFrom, lt: input.now } },
      }),
      this.client.socialImageGenerationRequest.count({
        where: { ...success, updatedAt: { gte: monthlyFrom, lt: input.now } },
      }),
      this.client.socialImageGenerationRequest.count({
        where: {
          ...success,
          groupMembershipId: input.groupMembershipId,
          updatedAt: { gte: monthlyFrom, lt: input.now },
        },
      }),
    ]);
    if (
      dailyUsed >= enrollment.pilot.dailyLimit ||
      monthlyUsed >= enrollment.pilot.monthlyLimit ||
      memberUsed >= enrollment.pilot.memberMonthlyLimit
    )
      return { allowed: false as const, reason: 'LIMIT_REACHED' as const };
    return {
      allowed: true as const,
      pilotEnrollmentId: enrollment.id,
      generationContextSnapshotId: null,
    };
  }
}

export class PrismaSocialImageGenerationExecutionRepository implements SocialImageGenerationExecutionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async claim(input: Parameters<SocialImageGenerationExecutionRepository['claim']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const request = await tx.socialImageGenerationRequest.findFirst({
          where: { id: input.requestId, workspaceId: input.workspaceId },
          include: { pilotEnrollment: { include: { pilot: true } } },
        });
        if (!request || !['QUEUED', 'GENERATING_ASSET', 'COMPOSING'].includes(request.status))
          return { allowed: false as const, reason: 'REQUEST_UNAVAILABLE' as const };
        const pilot = request.pilotEnrollment.pilot;
        const membership = await tx.groupMembership.findFirst({
          where: {
            id: request.groupMembershipId,
            workspaceId: request.workspaceId,
            groupId: request.groupId,
            userId: request.ownerUserId,
            status: 'ACTIVE',
            consentedAt: { not: null },
            group: {
              status: 'ACTIVE',
              featurePolicies: {
                some: {
                  featureKey: 'SOCIAL.IMAGE_GENERATION',
                  status: 'ENABLED',
                  OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
                  AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
                },
              },
            },
            featureAssignments: {
              some: {
                featureKey: 'SOCIAL.IMAGE_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
              },
            },
          },
          select: { id: true },
        });
        if (
          !membership ||
          request.pilotEnrollment.status !== 'ACTIVE' ||
          request.pilotEnrollment.revokedAt ||
          pilot.status !== 'ACTIVE' ||
          pilot.emergencyStop ||
          (pilot.startsAt && pilot.startsAt > input.now) ||
          (pilot.endsAt && pilot.endsAt <= input.now)
        )
          return { allowed: false as const, reason: 'PILOT_STOPPED' as const };
        if (
          !(await socialImagePilotIsApproved(tx, {
            workspaceId: request.workspaceId,
            groupId: request.groupId,
            pilotId: pilot.id,
          }))
        )
          return { allowed: false as const, reason: 'PILOT_STOPPED' as const };

        const bunshin = await tx.bunshin.findFirst({
          where: {
            id: request.bunshinId,
            workspaceId: request.workspaceId,
            ownerUserId: request.ownerUserId,
            status: { not: 'ARCHIVED' },
            capabilityAssignments: { some: { capabilityType: 'SOCIAL', status: 'ACTIVE' } },
          },
          select: { id: true },
        });
        if (!bunshin) return { allowed: false as const, reason: 'PILOT_STOPPED' as const };
        if (request.campaignId) {
          const campaign = await tx.campaign.findFirst({
            where: {
              id: request.campaignId,
              workspaceId: request.workspaceId,
              groupId: request.groupId,
              status: 'OPEN',
              startsAt: { lte: input.now },
              endsAt: { gt: input.now },
            },
            select: { id: true },
          });
          if (!campaign) return { allowed: false as const, reason: 'PILOT_STOPPED' as const };
        }

        const completed = {
          status: 'READY_FOR_REVIEW' as const,
          pilotEnrollment: { pilotId: pilot.id },
        };
        const [dailyUsed, monthlyUsed, memberMonthlyUsed] = await Promise.all([
          tx.socialImageGenerationRequest.count({
            where: { ...completed, updatedAt: { gte: input.dailyFrom, lt: input.now } },
          }),
          tx.socialImageGenerationRequest.count({
            where: { ...completed, updatedAt: { gte: input.monthlyFrom, lt: input.now } },
          }),
          tx.socialImageGenerationRequest.count({
            where: {
              ...completed,
              groupMembershipId: request.groupMembershipId,
              updatedAt: { gte: input.monthlyFrom, lt: input.now },
            },
          }),
        ]);
        if (dailyUsed >= pilot.dailyLimit)
          return { allowed: false as const, reason: 'DAILY_LIMIT_REACHED' as const };
        if (monthlyUsed >= pilot.monthlyLimit)
          return { allowed: false as const, reason: 'MONTHLY_LIMIT_REACHED' as const };
        if (memberMonthlyUsed >= pilot.memberMonthlyLimit)
          return { allowed: false as const, reason: 'MEMBER_MONTHLY_LIMIT_REACHED' as const };
        if (request.status === 'QUEUED') {
          const claimed = await tx.socialImageGenerationRequest.updateMany({
            where: { id: request.id, workspaceId: request.workspaceId, status: 'QUEUED' },
            data: { status: 'GENERATING_ASSET', revision: { increment: 1 }, errorCode: null },
          });
          if (claimed.count !== 1)
            return { allowed: false as const, reason: 'REQUEST_UNAVAILABLE' as const };
        }
        const context: SocialImageGenerationExecutionContext = {
          requestId: request.id,
          workspaceId: request.workspaceId,
          groupId: request.groupId,
          ownerUserId: request.ownerUserId,
          bunshinId: request.bunshinId,
          dailyMissionId: request.dailyMissionId,
          layout: request.layout as unknown as SocialImageGenerationExecutionContext['layout'],
          model: pilot.defaultModel,
          quality: pilot.defaultQuality,
        };
        return { allowed: true as const, context };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async moveToComposing(input: { workspaceId: string; requestId: string }) {
    const existing = await this.client.socialImageGenerationRequest.findFirst({
      where: { id: input.requestId, workspaceId: input.workspaceId, status: 'COMPOSING' },
      select: { id: true },
    });
    if (existing) return true;
    const result = await this.client.socialImageGenerationRequest.updateMany({
      where: { id: input.requestId, workspaceId: input.workspaceId, status: 'GENERATING_ASSET' },
      data: { status: 'COMPOSING', revision: { increment: 1 } },
    });
    return result.count === 1;
  }

  async complete(input: Parameters<SocialImageGenerationExecutionRepository['complete']>[0]) {
    return this.client.$transaction(async (tx) => {
      const changed = await tx.socialImageGenerationRequest.updateMany({
        where: {
          id: input.context.requestId,
          workspaceId: input.context.workspaceId,
          groupId: input.context.groupId,
          ownerUserId: input.context.ownerUserId,
          status: 'COMPOSING',
        },
        data: { status: 'READY_FOR_REVIEW', revision: { increment: 1 }, errorCode: null },
      });
      if (changed.count !== 1) return false;
      await tx.socialImageGeneratedMedia.create({
        data: {
          id: input.mediaId,
          workspaceId: input.context.workspaceId,
          groupId: input.context.groupId,
          ownerUserId: input.context.ownerUserId,
          dailyMissionId: input.context.dailyMissionId,
          requestId: input.context.requestId,
          sourceStorageKey: input.sourceStorageKey,
          completedStorageKey: input.completedStorageKey,
          thumbnailStorageKey: input.thumbnailStorageKey,
          width: 1080,
          height: 1350,
          contentHash: input.contentHash,
          expiresAt: assetRetentionExpiry(),
        },
      });
      return true;
    });
  }

  async markFailed(input: { workspaceId: string; requestId: string; errorCode: string }) {
    const request = await this.client.socialImageGenerationRequest.findFirst({
      where: {
        id: input.requestId,
        workspaceId: input.workspaceId,
        status: { in: ['QUEUED', 'GENERATING_ASSET', 'COMPOSING'] },
      },
      select: { ownerUserId: true },
    });
    if (!request) return null;
    const changed = await this.client.socialImageGenerationRequest.updateMany({
      where: {
        id: input.requestId,
        workspaceId: input.workspaceId,
        status: { in: ['QUEUED', 'GENERATING_ASSET', 'COMPOSING'] },
      },
      data: { status: 'FAILED', errorCode: input.errorCode, revision: { increment: 1 } },
    });
    return changed.count === 1 ? request : null;
  }
}

const videoAssetRecord = (row: Prisma.VideoAssetGetPayload<object>): VideoAssetRecord => ({
  ...row,
});

export class PrismaVideoAssetRepository implements VideoAssetRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async createPending(input: Parameters<VideoAssetRepository['createPending']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const membership = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: {
            status: 'ACTIVE',
            featurePolicies: {
              some: {
                featureKey: 'VIDEO_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              },
            },
          },
          featureAssignments: {
            some: {
              featureKey: 'VIDEO_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
        select: { id: true },
      });
      if (!membership) return null;
      if (input.videoProjectId) {
        const project = await tx.videoProject.findFirst({
          where: {
            id: input.videoProjectId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: input.groupMembershipId,
            ownerUserId: input.actorUserId,
            status: { in: ['DRAFT', 'PLANNING', 'WAITING_APPROVAL', 'REVISING'] },
          },
          select: { id: true },
        });
        if (!project) return null;
      }
      const row = await tx.videoAsset.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          ownerUserId: input.actorUserId,
          videoProjectId: input.videoProjectId,
          kind: input.kind,
          storageKey: `video-assets/${input.workspaceId}/${input.actorUserId}/${randomUUID()}`,
          originalFilename: input.originalFilename,
          declaredMimeType: input.declaredMimeType,
          declaredSizeBytes: input.declaredSizeBytes,
          rightsConfirmedAt: now,
          usageTerms: input.usageTerms,
          expiresAt: assetRetentionExpiry(now),
        },
      });
      return videoAssetRecord(row);
    });
  }

  async findOwned(input: Parameters<VideoAssetRepository['findOwned']>[0]) {
    const now = new Date();
    const row = await this.client.videoAsset.findFirst({
      where: {
        id: input.assetId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        group: {
          status: 'ACTIVE',
          featurePolicies: {
            some: {
              featureKey: 'VIDEO_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
        groupMembership: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          featureAssignments: {
            some: {
              featureKey: 'VIDEO_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
      },
    });
    return row ? videoAssetRecord(row) : null;
  }

  async markReady(input: Parameters<VideoAssetRepository['markReady']>[0]) {
    return this.client.$transaction(async (tx) => {
      const updated = await tx.videoAsset.updateMany({
        where: {
          id: input.assetId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          status: 'PENDING_UPLOAD',
        },
        data: {
          status: 'READY',
          verifiedMimeType: input.verifiedMimeType,
          verifiedSizeBytes: input.verifiedSizeBytes,
          width: input.width,
          height: input.height,
          durationMs: input.durationMs,
          failureCode: null,
          expiresAt: assetRetentionExpiry(),
        },
      });
      if (updated.count !== 1) return null;
      const row = await tx.videoAsset.findUniqueOrThrow({ where: { id: input.assetId } });
      return videoAssetRecord(row);
    });
  }

  async reject(input: Parameters<VideoAssetRepository['reject']>[0]) {
    await this.client.videoAsset.updateMany({
      where: {
        id: input.assetId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        status: 'PENDING_UPLOAD',
      },
      data: { status: 'REJECTED', failureCode: input.failureCode },
    });
  }

  async listReadyOwned(input: Parameters<VideoAssetRepository['listReadyOwned']>[0]) {
    const now = new Date();
    const rows = await this.client.videoAsset.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        status: 'READY',
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ...(input.videoProjectId
            ? [{ OR: [{ videoProjectId: null }, { videoProjectId: input.videoProjectId }] }]
            : []),
        ],
        group: {
          status: 'ACTIVE',
          featurePolicies: {
            some: {
              featureKey: 'VIDEO_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
        groupMembership: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          featureAssignments: {
            some: {
              featureKey: 'VIDEO_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(videoAssetRecord);
  }
}

const pointAccountRecord = (row: Prisma.PointAccountGetPayload<object>): PointAccountSnapshot => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  availablePoints: row.availablePoints,
  recoveryDue: row.recoveryDue,
  updatedAt: row.updatedAt,
});

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
          status: 'ACTIVE',
          groupId: null,
          campaignId: null,
          OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
          AND: [
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
          version: true,
        },
        orderBy: [{ ruleKey: 'asc' }, { version: 'desc' }],
      }),
      this.client.postRecord.findMany({
        where: { workspaceId: input.workspaceId, actorUserId: input.actorUserId },
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
          Number(right.workspaceId === input.workspaceId) -
            Number(left.workspaceId === input.workspaceId) || right.version - left.version,
      )
      .forEach((rule) => {
        if (!uniqueRules.has(rule.ruleKey)) uniqueRules.set(rule.ruleKey, rule);
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
      earningMethods: [...uniqueRules.values()],
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
          const updated = await tx.pointAccount.update({
            where: { id: account.id },
            data: { availablePoints: { increment: input.amount }, revision: { increment: 1 } },
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
        const account = await tx.pointAccount.update({
          where: { id: consumption.accountId },
          data: { availablePoints: { increment: amount }, revision: { increment: 1 } },
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

  private async activeMember(workspaceId: string, userId: string) {
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
    if (!(await this.activeMember(input.workspaceId, input.actorUserId))) return null;
    const rows = await this.client.pointRewardCatalogItem.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
      },
      orderBy: [{ rewardKey: 'asc' }, { version: 'desc' }],
    });
    const unique = new Map<string, (typeof rows)[number]>();
    rows.forEach((row) => {
      if (!unique.has(row.rewardKey)) unique.set(row.rewardKey, row);
    });
    return [...unique.values()].map(pointCatalogItemRecord);
  }

  async reserve(input: Parameters<PointRedemptionRepository['reserve']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const member = await tx.workspaceMembership.findFirst({
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
        });
        if (existing) {
          if (
            existing.catalogItemId !== input.catalogItemId ||
            existing.resourceType !== input.resourceType ||
            existing.resourceId !== input.resourceId
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
        const changed = await tx.pointAccount.updateMany({
          where: { id: account.id, availablePoints: { gte: item.pointCost }, recoveryDue: 0 },
          data: { availablePoints: { decrement: item.pointCost }, revision: { increment: 1 } },
        });
        if (changed.count !== 1) return null;
        const consumption = await tx.pointTransaction.create({
          data: {
            accountId: account.id,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            type: 'CONSUME',
            amount: -item.pointCost,
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
        let remaining = item.pointCost;
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
            pointCost: item.pointCost,
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
          await tx.pointTransaction.create({
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
          await tx.pointAccount.update({
            where: { id: redemption.accountId },
            data: {
              availablePoints: { increment: redemption.pointCost },
              revision: { increment: 1 },
            },
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
          await tx.pointTransaction.create({
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
          await tx.pointAccount.update({
            where: { id: redemption.accountId },
            data: {
              availablePoints: { increment: redemption.pointCost },
              revision: { increment: 1 },
            },
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
              select: { occurredAt: true, dailyMission: { select: { campaignId: true } } },
            });
            if (!event) {
              await tx.pointProcessingEvent.update({
                where: { id: processing.id },
                data: { status: 'COMPLETED', processedAt: new Date() },
              });
              return 'NOT_ELIGIBLE';
            }
            campaignId = event.dailyMission.campaignId;
          } else {
            const event = await tx.postRecord.findFirst({
              where: {
                id: input.sourceEventId,
                workspaceId: input.workspaceId,
                actorUserId: input.actorUserId,
              },
              select: { postedAt: true, dailyMission: { select: { campaignId: true } } },
            });
            if (!event) {
              await tx.pointProcessingEvent.update({
                where: { id: processing.id },
                data: { status: 'COMPLETED', processedAt: new Date() },
              });
              return 'NOT_ELIGIBLE';
            }
            campaignId = event.dailyMission.campaignId;
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
          const dayKey = pointDayKey(input.occurredAt, input.timezone);
          const weekKey = pointWeekKey(input.occurredAt, input.timezone);
          const ruleRequests =
            input.eventType === 'MISSION_VIEWED'
              ? [{ key: 'MISSION_VIEWED_DAILY', period: `day:${dayKey}`, eligible: true }]
              : [
                  { key: 'POSTED_DAILY', period: `day:${dayKey}`, eligible: true },
                  {
                    key: 'POSTED_WEEKLY_3',
                    period: `week:${weekKey}`,
                    eligible: await this.hasThreePostsInWeek(
                      tx,
                      input.workspaceId,
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
                status: 'ACTIVE',
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
            activeRuleFound = true;
            const idempotencyKey = `rule:${rule.id}:${request.period}`;
            const existing = await tx.pointTransaction.findUnique({
              where: {
                accountId_idempotencyKey: { accountId: account.id, idempotencyKey },
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
            await tx.pointTransaction.create({
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
            await tx.pointAccount.update({
              where: { id: account.id },
              data: {
                availablePoints: { increment: rule.grantAmount },
                revision: { increment: 1 },
              },
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
    userId: string,
    weekKey: string,
    timezone: string,
    occurredAt: Date,
  ) {
    const posts = await tx.postRecord.findMany({
      where: {
        workspaceId,
        actorUserId: userId,
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
