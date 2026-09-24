import type {
  AccountDeletionAdminOperationsRepository,
  AccountDeletionBlockedReason,
  AccountDeletionExecutionRepository,
  AccountDeletionOrchestrationRepository,
  AccountDeletionRequest,
  AccountDeletionRequestRepository,
} from '@bunshin/application';
import { type Prisma, type PrismaClient, prisma } from './client';

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

export { PrismaAccountDeletionPurgeRepository } from './account-deletion-purge';
