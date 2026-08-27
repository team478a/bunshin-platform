import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  calculateAdminRetention,
  GENERATION_CONTEXT_SNAPSHOT_SCHEMA_VERSION,
  LINE_ADMIN_RETRYABLE_FAILURES,
  selectExternalTrackingLink,
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
  TrendResearchExpiryRepository,
  TrendResearchGenerationContextRepository,
  LineMessageDelivery,
  LineMessageDeliveryRepository,
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
  GroupParticipationRepository,
  ProductPackRepository,
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
import { ApplicationError } from '@bunshin/shared';

const globalPrisma = globalThis as unknown as { bunshinPrisma?: PrismaClient };
export const prisma = globalPrisma.bunshinPrisma ?? new PrismaClient({ log: ['warn', 'error'] });
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
    return row?.workspace.bunshins.length === 1 ? row.providerUserId : null;
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
            where: { environment, jobType: 'LINE_MISSION_DELIVER', status },
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
        where: { environment, jobType: 'LINE_MISSION_DELIVER', status: 'RETRY_SCHEDULED' },
      }),
      this.client.job.count({
        where: { environment, jobType: 'LINE_MISSION_DELIVER', status: 'DEAD' },
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
        if (!admin) return null;
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

    try {
      return lineMessageDelivery(
        await this.client.lineMessageDelivery.create({
          data: {
            environment: input.environment,
            workspaceId: input.workspaceId,
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
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
  ) {
    return client.bunshin.findFirst({
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

  private async managed(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
  ) {
    const bunshin = await client.bunshin.findFirst({
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
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
    manage: boolean,
  ) {
    const value = await client.bunshin.findFirst({
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
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
    manage: boolean,
  ) {
    const bunshin = await client.bunshin.findFirst({
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
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
    manage: boolean,
  ) {
    const bunshin = await client.bunshin.findFirst({
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
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
    manage: boolean,
  ) {
    const bunshin = await client.bunshin.findFirst({
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

      const data: Prisma.BunshinCreateInput = {
        workspace: { connect: { id: input.workspaceId } },
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

  async find(input: ScopedBunshinReference): Promise<BunshinAggregate | null> {
    const row = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
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
          status: { not: 'ARCHIVED' },
          workspace: { status: 'ACTIVE' },
          AND: {
            workspace: {
              memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
            },
          },
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
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
  ) {
    const bunshin = await client.bunshin.findFirst({
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
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
  ) {
    return client.bunshin.findFirst({
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

  private async managed(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
  ) {
    const bunshin = await client.bunshin.findFirst({
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
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
  ) {
    return client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
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
        const { actorUserId, status, ...data } = input;
        void actorUserId;
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
    ] = await Promise.all([
      this.client.user.findMany({
        where: search,
        select: adminUserSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
      }),
      this.client.user.findMany({
        where: { createdAt: period },
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
      this.client.user.count(),
      this.client.user.count({ where: { status: 'ACTIVE' } }),
      this.client.postRecord.count({ where: { postedAt: period } }),
      this.client.aiUsageEvent.findMany({
        where: { occurredAt: period },
        select: { status: true, estimatedCostUsdMicros: true },
      }),
      this.client.lineConnection.findMany({
        where: { environment: input.environment, status: 'ACTIVE' },
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
    ]);
    const visible = rows
      .slice(0, input.limit)
      .map((row) => adminUserSummary(row, input.environment));
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
    const retentionIds = [...new Set([...d1EligibleIds, ...d7EligibleIds])];
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
        posts: periodPosts,
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
      },
      funnel,
      retention,
      users: visible,
      truncated: rows.length > input.limit || cohortRows.length > 5000,
    };
  }

  async userDetail(
    input: Parameters<AdminOperationsRepository['userDetail']>[0],
  ): Promise<AdminUserDetail | null> {
    if (!(await this.authorized(input.actorUserId))) return null;
    const [row, operationAudits, supportCases] = await Promise.all([
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
          jobType: 'LINE_MISSION_DELIVER',
          status: { in: ['RETRY_SCHEDULED', 'DEAD'] },
        },
        _count: { _all: true },
      }),
      this.client.job.count({
        where: {
          environment: input.environment,
          jobType: { not: 'LINE_MISSION_DELIVER' },
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
          role: 'MANAGER',
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
    const created = await this.client.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: { workspaceId: input.workspaceId, name: input.name },
      });
      await tx.groupMembership.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: group.id,
          userId: input.actorUserId,
          role: 'MANAGER',
          status: 'ACTIVE',
          consentedAt: new Date(),
        },
      });
      return group;
    });
    return groupRecord(created);
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
          status: 'ACTIVE',
          consentedAt: input.now,
        },
        update: {
          role: invitation.role,
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
          role: 'MANAGER',
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

  async listConfiguration(
    input: Parameters<ExternalTrackingLinkRepository['listConfiguration']>[0],
  ) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
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
        system: { status: 'ACTIVE' },
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
      where: { id: input.systemId, workspaceId: input.workspaceId, status: 'ACTIVE' },
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
        where: { id: input.systemId, workspaceId: input.workspaceId, status: 'ACTIVE' },
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
        where: { id: input.systemId, workspaceId: input.workspaceId, status: 'ACTIVE' },
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
      where: { id: input.linkId, workspaceId: input.workspaceId, status: 'ACTIVE' },
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

  async list(input: Parameters<ProductPackRepository['list']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.productPack.findMany({
      where: { workspaceId: input.workspaceId },
      include: {
        group: { select: { id: true, name: true } },
        versions: { orderBy: { version: 'desc' }, include: { rules: true, assets: true } },
        assignments: { where: { status: 'ACTIVE' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(input: Parameters<ProductPackRepository['get']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.productPack.findFirst({
      where: { id: input.productPackId, workspaceId: input.workspaceId },
      include: {
        group: { select: { id: true, name: true } },
        versions: { orderBy: { version: 'desc' }, include: { rules: true, assets: true } },
        assignments: { include: { bunshin: { select: { id: true, name: true } } } },
      },
    });
  }

  async createPack(input: Parameters<ProductPackRepository['createPack']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
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
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const pack = await tx.productPack.findFirst({
        where: {
          id: input.productPackId,
          workspaceId: input.workspaceId,
          status: { not: 'ARCHIVED' },
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
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const draft = await tx.productPackVersion.findFirst({
        where: {
          id: input.versionId,
          productPackId: input.productPackId,
          status: 'DRAFT',
          productPack: { workspaceId: input.workspaceId, status: { not: 'ARCHIVED' } },
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
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const pack = await tx.productPack.findFirst({
        where: { id: input.productPackId, workspaceId: input.workspaceId, status: 'ACTIVE' },
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

  async listManaged(input: Parameters<CampaignRepository['listManaged']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    const campaigns = await this.client.campaign.findMany({
      where: { workspaceId: input.workspaceId },
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
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
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
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const changed = await tx.campaign.updateMany({
        where: {
          id: input.campaignId,
          workspaceId: input.workspaceId,
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
    actorUserId: string;
    bunshinId: string;
    campaignId?: string;
    from: Date;
    to: Date;
  }): Prisma.CampaignWhereInput {
    return {
      ...(input.campaignId ? { id: input.campaignId } : {}),
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
