import type { PrismaClient } from '@prisma/client';
import type { BadgeLineReconciliationRepository } from '@bunshin/application';

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
