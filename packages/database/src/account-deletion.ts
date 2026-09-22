import type {
  AccountDeletionAdminOperationsRepository,
  AccountDeletionBlockedReason,
  AccountDeletionExecutionRepository,
  AccountDeletionOrchestrationRepository,
  AccountDeletionPurgeRepository,
  AccountDeletionRequest,
  AccountDeletionRequestRepository,
} from '@bunshin/application';
import { purgeAccountMedia, type AccountDeletionMediaStorage } from './account-deletion-media';
import { Prisma, type PrismaClient, prisma } from './client';
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
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly mediaStorage?: AccountDeletionMediaStorage,
  ) {}

  async completeAfterAuthDeletion(
    input: Parameters<AccountDeletionPurgeRepository['completeAfterAuthDeletion']>[0],
  ) {
    const media = await purgeAccountMedia(this.client, input, this.mediaStorage);
    if (media === false) return null;
    if (media === 'PENDING')
      return {
        requestId: input.requestId,
        userId: input.userId,
        status: 'PROCESSING' as const,
        blockedReason: null,
      };
    // Storage can take time; validate the completion lease against a fresh
    // clock rather than the timestamp from before the network operations.
    if (this.mediaStorage) input = { ...input, now: new Date() };
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

      const mediaOwner = { ownerUserId: input.userId };
      await Promise.all([
        tx.serviceMemberBusinessProfile.deleteMany({ where: { userId: input.userId } }),
        tx.videoProject.updateMany({
          where: mediaOwner,
          data: {
            title: '退会済みデータ',
            photoAssetIds: [],
            narrationEnabled: false,
            status: 'CANCELLED',
            characterProfileSnapshot: {},
            characterReferenceSnapshot: [],
            disclosureSnapshot: {},
          },
        }),
        tx.videoScene.updateMany({
          where: { videoProject: mediaOwner },
          data: {
            narration: '',
            caption: '',
            visualPrompt: null,
            keywords: [],
          },
        }),
        tx.videoAsset.updateMany({
          where: mediaOwner,
          data: { originalFilename: 'deleted', usageTerms: null },
        }),
        tx.videoRender.updateMany({ where: mediaOwner, data: { notificationSnapshot: null } }),
        tx.videoSceneGeneration.updateMany({ where: mediaOwner, data: { inputSnapshot: {} } }),
        tx.socialImageGenerationRequest.updateMany({
          where: mediaOwner,
          data: {
            status: 'CANCELLED',
            layout: {},
            referenceImage: Prisma.DbNull,
          },
        }),
        tx.videoDelivery.updateMany({
          where: mediaOwner,
          data: {
            status: 'REVOKED',
            notificationStatus: 'CANCELLED',
            notificationSnapshot: null,
            revokedAt: input.now,
          },
        }),
      ]);
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
