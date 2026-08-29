import type { PrismaClient } from '@prisma/client';
import type {
  BadgeLineDeliveryRepository,
  BadgeLineJobCandidateRepository,
  BadgeLineNotificationPreparationRepository,
  BadgeLineDeliveryRetryRepository,
  BadgeLineReconciliationRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma } from '@prisma/client';

export class PrismaBadgeLineNotificationPreparationRepository implements BadgeLineNotificationPreparationRepository {
  constructor(private readonly client: PrismaClient) {}

  async prepare(input: Parameters<BadgeLineNotificationPreparationRepository['prepare']>[0]) {
    const awards = await this.client.badgeAward.findMany({
      where: {
        status: 'ACTIVE',
        groupId: { not: null },
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
        group: { status: 'ACTIVE' },
        OR: [
          { notification: null },
          {
            notification: {
              is: { lineDeliveries: { none: { environment: input.environment } } },
            },
          },
        ],
      },
      select: { id: true, workspaceId: true, userId: true, groupId: true, awardedAt: true },
      orderBy: { awardedAt: 'asc' },
      take: input.limit,
    });
    let prepared = 0;
    for (const award of awards) {
      if (!award.groupId) continue;
      const eligible = await this.client.$transaction(async (tx) => {
        const [routing, membership, connection, preference] = await Promise.all([
          tx.groupLineRoutingPolicy.findUnique({
            where: {
              workspaceId_groupId_environment: {
                workspaceId: award.workspaceId,
                groupId: award.groupId!,
                environment: input.environment,
              },
            },
            select: { mode: true, pilotEnabled: true },
          }),
          tx.groupMembership.findFirst({
            where: {
              workspaceId: award.workspaceId,
              groupId: award.groupId!,
              userId: award.userId,
              status: 'ACTIVE',
              consentedAt: { not: null },
            },
            select: { id: true },
          }),
          tx.lineConnection.findUnique({
            where: {
              environment_workspaceId_userId: {
                environment: input.environment,
                workspaceId: award.workspaceId,
                userId: award.userId,
              },
            },
            select: { status: true, friendshipStatus: true, notificationConsentAt: true },
          }),
          tx.lineNotificationPreference.findFirst({
            where: {
              workspaceId: award.workspaceId,
              userId: award.userId,
              enabled: true,
              notificationConsentAt: { not: null },
              OR: [{ pausedUntil: null }, { pausedUntil: { lte: input.now } }],
            },
            select: { id: true },
          }),
        ]);
        if (
          !routing?.pilotEnabled ||
          routing.mode === 'DISABLED' ||
          !membership ||
          connection?.status !== 'ACTIVE' ||
          connection.friendshipStatus !== 'FOLLOWING' ||
          !connection.notificationConsentAt ||
          !preference
        )
          return false;
        const notification = await tx.badgeAwardNotification.upsert({
          where: { badgeAwardId: award.id },
          create: {
            workspaceId: award.workspaceId,
            userId: award.userId,
            badgeAwardId: award.id,
            createdAt: award.awardedAt,
          },
          update: {},
          select: { id: true },
        });
        const result = await tx.badgeLineNotificationDelivery.createMany({
          data: [
            {
              environment: input.environment,
              workspaceId: award.workspaceId,
              groupId: award.groupId!,
              userId: award.userId,
              badgeNotificationId: notification.id,
              idempotencyKey: `badge-award:${award.id}`,
              scheduledAt: input.now,
            },
          ],
          skipDuplicates: true,
        });
        return result.count === 1;
      });
      if (eligible) prepared += 1;
    }
    return { scanned: awards.length, prepared, skipped: awards.length - prepared };
  }
}

export class PrismaBadgeLineJobCandidateRepository implements BadgeLineJobCandidateRepository {
  constructor(private readonly client: PrismaClient) {}

  async listPending(input: Parameters<BadgeLineJobCandidateRepository['listPending']>[0]) {
    const rows = await this.client.badgeLineNotificationDelivery.findMany({
      where: {
        environment: input.environment,
        status: 'PENDING',
        scheduledAt: { lte: new Date() },
        workspace: { status: 'ACTIVE' },
        group: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
      },
      orderBy: { scheduledAt: 'asc' },
      take: input.limit,
      select: { id: true, workspaceId: true, userId: true },
    });
    return rows.map((row) => ({
      deliveryId: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
    }));
  }
}

export class PrismaBadgeLineDeliveryRepository implements BadgeLineDeliveryRepository {
  constructor(private readonly client: PrismaClient) {}

  async claim(input: Parameters<BadgeLineDeliveryRepository['claim']>[0]) {
    const claimed = await this.client.badgeLineNotificationDelivery.updateMany({
      where: {
        id: input.deliveryId,
        environment: input.environment,
        sentAt: null,
        cancelledAt: null,
        scheduledAt: { lte: input.now },
        OR: [
          { status: { in: ['PENDING', 'FAILED'] } },
          { status: 'PROCESSING', leaseExpiresAt: { lte: input.now } },
        ],
      },
      data: {
        status: 'PROCESSING',
        attemptCount: { increment: 1 },
        leaseOwner: input.workerId,
        leaseExpiresAt: input.leaseExpiresAt,
        lastErrorCategory: null,
      },
    });
    if (claimed.count !== 1) return null;
    const row = await this.client.badgeLineNotificationDelivery.findFirst({
      where: {
        id: input.deliveryId,
        environment: input.environment,
        status: 'PROCESSING',
        leaseOwner: input.workerId,
      },
      include: {
        badgeNotification: {
          include: { badgeAward: { include: { badgeVersion: true } } },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      environment: row.environment,
      workspaceId: row.workspaceId,
      groupId: row.groupId,
      userId: row.userId,
      title: row.badgeNotification.badgeAward.badgeVersion.title,
      description: row.badgeNotification.badgeAward.badgeVersion.description,
      attemptCount: row.attemptCount,
    };
  }

  async finish(input: Parameters<BadgeLineDeliveryRepository['finish']>[0]) {
    const result = await this.client.badgeLineNotificationDelivery.updateMany({
      where: {
        id: input.deliveryId,
        environment: input.environment,
        status: 'PROCESSING',
        leaseOwner: input.workerId,
      },
      data: {
        status: input.status,
        sentAt: input.status === 'SENT' ? input.at : null,
        cancelledAt: input.status === 'CANCELLED' ? input.at : null,
        lastErrorCategory: input.errorCategory,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }

  async isAllowed(input: Parameters<BadgeLineDeliveryRepository['isAllowed']>[0]) {
    const [routing, membership, connection, preference] = await Promise.all([
      this.client.groupLineRoutingPolicy.findUnique({
        where: {
          workspaceId_groupId_environment: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            environment: input.environment,
          },
        },
      }),
      this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.userId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE' },
        },
      }),
      this.client.lineConnection.findUnique({
        where: {
          environment_workspaceId_userId: {
            environment: input.environment,
            workspaceId: input.workspaceId,
            userId: input.userId,
          },
        },
      }),
      this.client.lineNotificationPreference.findFirst({
        where: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          enabled: true,
          notificationConsentAt: { not: null },
          OR: [{ pausedUntil: null }, { pausedUntil: { lte: input.at } }],
        },
      }),
    ]);
    return Boolean(
      routing?.pilotEnabled &&
      routing.mode !== 'DISABLED' &&
      membership &&
      connection?.status === 'ACTIVE' &&
      connection.friendshipStatus === 'FOLLOWING' &&
      connection.notificationConsentAt &&
      preference,
    );
  }
}

export class PrismaBadgeLineDeliveryRetryRepository implements BadgeLineDeliveryRetryRepository {
  constructor(private readonly client: PrismaClient) {}

  async request(input: Parameters<BadgeLineDeliveryRetryRepository['request']>[0]) {
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
        const delivery = await tx.badgeLineNotificationDelivery.findFirst({
          where: {
            id: input.deliveryId,
            environment: input.environment,
            status: 'DEAD',
            sentAt: null,
            cancelledAt: null,
            attemptCount: { gt: 0 },
            lastErrorCategory: {
              in: ['CONFIGURATION_UNAVAILABLE', 'RATE_LIMITED', 'TIMEOUT', 'PROVIDER_UNAVAILABLE'],
            },
            workspace: { status: 'ACTIVE' },
            group: { status: 'ACTIVE' },
            user: { status: 'ACTIVE' },
          },
        });
        if (!delivery) return null;
        const job = await tx.job.create({
          data: {
            environment: input.environment,
            workspaceId: delivery.workspaceId,
            bunshinId: null,
            capabilityType: 'SOCIAL',
            jobType: 'BADGE_LINE_DELIVER',
            payloadReference: `badge-line-delivery:${delivery.id}`,
            idempotencyKey: `badge-line-admin-retry:${delivery.id}:${delivery.attemptCount}`,
            correlationId: input.requestId,
            requestedBy: delivery.userId,
            priority: 50,
            maxAttempts: 3,
          },
        });
        return tx.badgeLineDeliveryRetryRequest.create({
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
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError(
          'CONFLICT',
          'this badge delivery failure already has a retry job',
          error,
        );
      throw error;
    }
  }
}

export class PrismaBadgeLineReconciliationRepository implements BadgeLineReconciliationRepository {
  constructor(private readonly client: PrismaClient) {}

  async inspect(input: Parameters<BadgeLineReconciliationRepository['inspect']>[0]) {
    const admin = await this.client.platformAdmin.findFirst({
      where: {
        userId: input.actorUserId,
        status: 'ACTIVE',
        role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
      },
      select: { id: true },
    });
    if (!admin) return null;

    const [configuration, candidateAwards, pendingRows, deadDeliveries, pendingInDisabledGroups] =
      await Promise.all([
        this.client.lineChannelConfiguration.findFirst({
          where: { environment: input.environment, status: 'ACTIVE' },
          select: { globallyPaused: true },
        }),
        this.client.badgeAward.findMany({
          where: {
            status: 'ACTIVE',
            groupId: { not: null },
            workspace: { status: 'ACTIVE' },
            user: { status: 'ACTIVE' },
            group: { status: 'ACTIVE' },
            notification: {
              is: { lineDeliveries: { none: { environment: input.environment } } },
            },
          },
          select: { workspaceId: true, groupId: true, userId: true },
          orderBy: { awardedAt: 'asc' },
          take: 500,
        }),
        this.client.badgeLineNotificationDelivery.findMany({
          where: {
            environment: input.environment,
            status: 'PENDING',
            scheduledAt: { lte: input.now },
          },
          select: { id: true },
          take: 500,
        }),
        this.client.badgeLineNotificationDelivery.count({
          where: { environment: input.environment, status: 'DEAD' },
        }),
        this.client.badgeLineNotificationDelivery.count({
          where: {
            environment: input.environment,
            status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
            group: {
              lineRoutingPolicies: {
                some: {
                  environment: input.environment,
                  OR: [{ mode: 'DISABLED' }, { pilotEnabled: false }],
                },
              },
            },
          },
        }),
      ]);
    const eligibleAwards = await Promise.all(
      candidateAwards.map(async (award) => {
        if (!award.groupId) return false;
        const [routing, membership, connection, preference] = await Promise.all([
          this.client.groupLineRoutingPolicy.findUnique({
            where: {
              workspaceId_groupId_environment: {
                workspaceId: award.workspaceId,
                groupId: award.groupId,
                environment: input.environment,
              },
            },
            select: { mode: true, pilotEnabled: true },
          }),
          this.client.groupMembership.findFirst({
            where: {
              workspaceId: award.workspaceId,
              groupId: award.groupId,
              userId: award.userId,
              status: 'ACTIVE',
              consentedAt: { not: null },
            },
            select: { id: true },
          }),
          this.client.lineConnection.findUnique({
            where: {
              environment_workspaceId_userId: {
                environment: input.environment,
                workspaceId: award.workspaceId,
                userId: award.userId,
              },
            },
            select: { status: true, friendshipStatus: true, notificationConsentAt: true },
          }),
          this.client.lineNotificationPreference.findFirst({
            where: {
              workspaceId: award.workspaceId,
              userId: award.userId,
              enabled: true,
              notificationConsentAt: { not: null },
              OR: [{ pausedUntil: null }, { pausedUntil: { lte: input.now } }],
            },
            select: { id: true },
          }),
        ]);
        return Boolean(
          routing?.pilotEnabled &&
          routing.mode !== 'DISABLED' &&
          membership &&
          connection?.status === 'ACTIVE' &&
          connection.friendshipStatus === 'FOLLOWING' &&
          connection.notificationConsentAt &&
          preference,
        );
      }),
    );
    const missingDeliveries = eligibleAwards.filter(Boolean).length;
    const pendingIds = pendingRows.map((row) => row.id);
    const jobs = pendingIds.length
      ? await this.client.job.findMany({
          where: {
            environment: input.environment,
            jobType: 'BADGE_LINE_DELIVER',
            status: { in: ['PENDING', 'LEASED', 'RETRY_SCHEDULED'] },
            payloadReference: { in: pendingIds.map((id) => `badge-line-delivery:${id}`) },
          },
          select: { payloadReference: true },
        })
      : [];
    const jobReferences = new Set(jobs.map((job) => job.payloadReference));
    const pendingWithoutJob = pendingIds.filter(
      (id) => !jobReferences.has(`badge-line-delivery:${id}`),
    ).length;
    const pendingWhileGloballyPaused = configuration?.globallyPaused ? pendingRows.length : 0;
    return {
      environment: input.environment,
      checkedAt: input.now,
      missingDeliveries,
      pendingWithoutJob,
      deadDeliveries,
      pendingWhileGloballyPaused,
      pendingInDisabledGroups,
      healthy:
        missingDeliveries === 0 &&
        pendingWithoutJob === 0 &&
        deadDeliveries === 0 &&
        pendingWhileGloballyPaused === 0 &&
        pendingInDisabledGroups === 0,
    };
  }
}
