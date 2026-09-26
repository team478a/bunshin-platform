import type { AdminAlertRepository, AdminAlertSnapshot } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
import { listServiceLineBroadcastOperationalEvents } from './service-line-broadcast-operational-alerts';
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
      serviceLineBroadcasts,
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
      listServiceLineBroadcastOperationalEvents(this.client, input.environment, input.now, {
        excludeNotified: false,
      }),
      this.client.job.count({
        where: {
          environment: input.environment,
          jobType: {
            notIn: ['LINE_MISSION_DELIVER', 'BADGE_LINE_DELIVER', 'SERVICE_LINE_BROADCAST_DELIVER'],
          },
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
      serviceLineBroadcasts: serviceLineBroadcasts.map((event) => ({
        code: event.code,
        serviceSlug: event.serviceSlug ?? null,
        serviceDisplayName: event.serviceDisplayName ?? null,
      })),
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
