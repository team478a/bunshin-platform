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
      personalLearningLineQuotaNotices,
      otherDeadJobs,
      failedPointProcessing,
      stalePointProcessing,
      failedBadgeProcessing,
      staleBadgeProcessing,
      stoppedPointServices,
      blockedDeletions,
      commercialBillingRefundReviews,
      openSupportCases,
      urgentSupportCases,
      personalLearningStaleOpenAdmissions,
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
          jobType: {
            in: ['LINE_MISSION_DELIVER', 'BADGE_LINE_DELIVER', 'PERSONAL_LEARNING_LINE_PROCESS'],
          },
          status: { in: ['RETRY_SCHEDULED', 'DEAD'] },
        },
        _count: { _all: true },
      }),
      listServiceLineBroadcastOperationalEvents(this.client, input.environment, input.now, {
        excludeNotified: false,
      }),
      this.client.personalLearningLineQuotaNotice.findMany({
        where: {
          environment: input.environment,
          monthKey: input.now.toISOString().slice(0, 7),
        },
        select: { thresholdPercent: true },
        orderBy: [{ thresholdPercent: 'asc' }, { createdAt: 'asc' }],
        take: 500,
      }),
      this.client.job.count({
        where: {
          environment: input.environment,
          jobType: {
            notIn: [
              'LINE_MISSION_DELIVER',
              'BADGE_LINE_DELIVER',
              'SERVICE_LINE_BROADCAST_DELIVER',
              'PERSONAL_LEARNING_LINE_PROCESS',
            ],
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
      this.client.commercialBillingWebhookEvent.findMany({
        where: {
          status: 'PROCESSED',
          errorCategory: {
            in: ['PARTIAL_REFUND_REVIEW_REQUIRED', 'FULL_REFUND_REVIEW_REQUIRED'],
          },
          invoice: { status: 'PAID' },
        },
        distinct: ['invoiceId'],
        select: { invoiceId: true },
      }),
      this.client.supportCase.count({ where: { status: 'OPEN' } }),
      this.client.supportCase.count({ where: { status: 'OPEN', priority: 'URGENT' } }),
      this.client.personalLearningCallAdmission.count({
        where: {
          settledAt: null,
          admittedAt: { lt: new Date(input.now.getTime() - 15 * 60 * 1000) },
        },
      }),
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
        const [
          daily,
          monthly,
          dailyOpen,
          monthlyOpen,
          recentProviderFailures,
          recentUnknownCostEvents,
          staleOpenAdmissions,
        ] = await Promise.all([
          this.client.aiUsageEvent.aggregate({
            where: { provider, occurredAt: { gte: input.dailyFrom, lt: input.now } },
            _sum: { estimatedCostUsdMicros: true },
          }),
          this.client.aiUsageEvent.aggregate({
            where: { provider, occurredAt: { gte: input.monthlyFrom, lt: input.now } },
            _sum: { estimatedCostUsdMicros: true },
          }),
          this.client.aiProviderCallAdmission.aggregate({
            where: {
              environment: input.environment,
              provider: configuration.provider,
              settledAt: null,
              admittedAt: { gte: input.dailyFrom, lt: input.now },
            },
            _sum: { reservedCostUsdMicros: true },
          }),
          this.client.aiProviderCallAdmission.aggregate({
            where: {
              environment: input.environment,
              provider: configuration.provider,
              settledAt: null,
              admittedAt: { gte: input.monthlyFrom, lt: input.now },
            },
            _sum: { reservedCostUsdMicros: true },
          }),
          this.client.aiUsageEvent.count({
            where: {
              provider,
              status: 'FAILED',
              OR: [
                { errorCode: { startsWith: 'AI_PROVIDER_' } },
                {
                  errorCode: {
                    in: [
                      'PROVIDER_UNAVAILABLE',
                      'PROVIDER_ERROR',
                      'PROVIDER_FAILED',
                      'PROVIDER_GENERATION_FAILED',
                      'PROVIDER_RENDER_FAILED',
                      'PROVIDER_TIMEOUT',
                      'TIMEOUT',
                      'TIMEOUT_OR_NETWORK',
                      'NETWORK_ERROR',
                      'RATE_LIMIT',
                      'RATE_LIMITED',
                      'QUOTA_OR_RATE_LIMIT',
                      'HTTP_ERROR',
                    ],
                  },
                },
              ],
              occurredAt: { gte: input.recentFrom, lt: input.now },
            },
          }),
          this.client.aiUsageEvent.count({
            where: {
              provider,
              estimatedCostUsdMicros: null,
              taskType: { not: 'DAILY_MISSION_PIPELINE' },
              occurredAt: { gte: input.recentFrom, lt: input.now },
            },
          }),
          this.client.aiProviderCallAdmission.count({
            where: {
              environment: input.environment,
              provider: configuration.provider,
              settledAt: null,
              admittedAt: { lt: new Date(input.now.getTime() - 15 * 60 * 1000) },
            },
          }),
        ]);
        return {
          provider: configuration.provider,
          globallyPaused: configuration.globallyPaused,
          lastErrorCategory: configuration.lastErrorCategory,
          dailyBudgetUsdMicros: Number(configuration.dailyBudgetUsdMicros),
          monthlyBudgetUsdMicros: Number(configuration.monthlyBudgetUsdMicros),
          dailySpentUsdMicros: safeNumber(
            (daily._sum.estimatedCostUsdMicros ?? 0n) +
              (dailyOpen._sum.reservedCostUsdMicros ?? 0n),
          ),
          monthlySpentUsdMicros: safeNumber(
            (monthly._sum.estimatedCostUsdMicros ?? 0n) +
              (monthlyOpen._sum.reservedCostUsdMicros ?? 0n),
          ),
          recentProviderFailures,
          recentUnknownCostEvents,
          staleOpenAdmissions,
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
      personalLearningLineQuotaNotices,
      otherDeadJobs,
      rewards: {
        failedPointProcessing,
        stalePointProcessing,
        failedBadgeProcessing,
        staleBadgeProcessing,
        stoppedServices: stoppedPointServices,
      },
      blockedDeletions,
      personalLearningStaleOpenAdmissions,
      commercialBillingRefundReviews: commercialBillingRefundReviews.length,
      openSupportCases,
      urgentSupportCases,
    };
  }
}
