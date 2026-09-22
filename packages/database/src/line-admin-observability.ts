import {
  LINE_ADMIN_RETRYABLE_FAILURES,
  type LineAdminFunnelRepository,
  type LineAdminMetricsRepository,
  type LineConfigurationEnvironment,
  type LineOperationalSnapshotRepository,
} from '@bunshin/application';
import { type PrismaClient, prisma } from './client';

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
