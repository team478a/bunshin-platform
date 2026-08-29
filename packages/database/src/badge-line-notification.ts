import type { PrismaClient } from '@prisma/client';
import type { BadgeLineNotificationPreparationRepository } from '@bunshin/application';

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
