import type { PrismaClient } from '@prisma/client';
import type {
  BadgeLineDeliveryRepository,
  BadgeLineNotificationPreparationRepository,
} from '@bunshin/application';

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
