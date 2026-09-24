import {
  calculateAdminRetention,
  calculateFirstWeekThreePostKpi,
  type AdminOperationsRepository,
  type AdminOperationsSnapshot,
  type AdminUserStage,
} from '@bunshin/application';
import { Prisma, type PrismaClient } from './client';
import { adminUserSelect, adminUserSummary } from './admin-user-summary';

export async function createAdminOperationsSnapshot(
  client: PrismaClient,
  input: Parameters<AdminOperationsRepository['snapshot']>[0],
): Promise<AdminOperationsSnapshot> {
  const exclusionHistory = await client.activityMetricExclusion.findMany({
    where: { environment: input.environment },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    select: { targetUserId: true, action: true },
  });
  const latestExclusion = new Map<string, 'EXCLUDED' | 'INCLUDED'>();
  for (const item of exclusionHistory) {
    if (!latestExclusion.has(item.targetUserId))
      latestExclusion.set(item.targetUserId, item.action);
  }
  const excludedUserIds = [...latestExclusion]
    .filter(([, action]) => action === 'EXCLUDED')
    .map(([userId]) => userId);
  const eligibleUser = excludedUserIds.length ? { id: { notIn: excludedUserIds } } : {};
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
    periodConfirmations,
    groupRows,
    latestActivity,
    latestPost,
  ] = await Promise.all([
    client.user.findMany({
      where: search,
      select: adminUserSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    }),
    client.user.findMany({
      where: { createdAt: period, ...eligibleUser },
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
    client.user.count({ where: eligibleUser }),
    client.user.count({ where: { status: 'ACTIVE', ...eligibleUser } }),
    client.postRecord.groupBy({
      by: ['actorUserId'],
      where: { postedAt: period, actorUserId: { notIn: excludedUserIds } },
      _count: { _all: true },
    }),
    client.aiUsageEvent.findMany({
      where: { occurredAt: period, actorUserId: { notIn: excludedUserIds } },
      select: { status: true, estimatedCostUsdMicros: true },
    }),
    client.lineConnection.findMany({
      where: {
        environment: input.environment,
        status: 'ACTIVE',
        userId: { notIn: excludedUserIds },
      },
      distinct: ['userId'],
      select: { userId: true },
    }),
    client.accountDeletionRequest.findMany({
      where: { status: { in: ['REQUESTED', 'PROCESSING', 'BLOCKED'] } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    client.lineMessageDelivery.count({
      where: { environment: input.environment, status: 'SENT', sentAt: period },
    }),
    client.lineMessageDeliveryAttempt.count({
      where: {
        delivery: { environment: input.environment },
        status: 'FAILED',
        attemptedAt: period,
      },
    }),
    client.supportCase.count({ where: { createdAt: period } }),
    client.supportCase.count({ where: { status: 'RESOLVED', resolvedAt: period } }),
    client.missionActivity.groupBy({
      by: ['actorUserId'],
      where: {
        occurredAt: period,
        type: 'CONFIRMED',
        actorUserId: { notIn: excludedUserIds },
      },
      _count: { _all: true },
    }),
    client.group.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        memberships: {
          where: { status: 'ACTIVE', userId: { notIn: excludedUserIds } },
          select: { userId: true },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 1_000,
    }),
    client.missionActivity.findFirst({
      where: { actorUserId: { notIn: excludedUserIds } },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    }),
    client.postRecord.findFirst({
      where: { actorUserId: { notIn: excludedUserIds } },
      orderBy: { postedAt: 'desc' },
      select: { postedAt: true },
    }),
  ]);
  const confirmationCount = new Map<string, number>();
  const postCount = new Map<string, number>();
  for (const item of periodConfirmations) confirmationCount.set(item.actorUserId, item._count._all);
  for (const item of periodPosts) postCount.set(item.actorUserId, item._count._all);
  const visible = rows.slice(0, input.limit).map((row) => ({
    ...adminUserSummary(row, input.environment),
    periodConfirmations: confirmationCount.get(row.id) ?? 0,
    periodPosts: postCount.get(row.id) ?? 0,
  }));
  const cohort = cohortRows.slice(0, 5000).map((row) => adminUserSummary(row, input.environment));
  const cohortCreatedAt = new Map(cohortRows.slice(0, 5000).map((row) => [row.id, row.createdAt]));
  const d1EligibleIds = [...cohortCreatedAt]
    .filter(([, createdAt]) => createdAt.getTime() + 2 * 86_400_000 <= input.to.getTime())
    .map(([id]) => id);
  const d7EligibleIds = [...cohortCreatedAt]
    .filter(([, createdAt]) => createdAt.getTime() + 8 * 86_400_000 <= input.to.getTime())
    .map(([id]) => id);
  const firstWeekEligibleIds = [...cohortCreatedAt]
    .filter(([, createdAt]) => createdAt.getTime() + 7 * 86_400_000 <= input.to.getTime())
    .map(([id]) => id);
  const retentionIds = [...new Set([...d1EligibleIds, ...d7EligibleIds, ...firstWeekEligibleIds])];
  const [retentionActivities, retentionPosts] = retentionIds.length
    ? await Promise.all([
        client.missionActivity.findMany({
          where: { actorUserId: { in: retentionIds }, occurredAt: { lt: input.to } },
          select: { actorUserId: true, occurredAt: true },
        }),
        client.postRecord.findMany({
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
  const firstWeekPosting = calculateFirstWeekThreePostKpi({
    cohort: [...cohortCreatedAt].map(([userId, createdAt]) => ({ userId, createdAt })),
    posts: retentionPosts.map((item) => ({
      userId: item.actorUserId,
      postedAt: item.postedAt,
    })),
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
      posts: [...postCount.values()].reduce((sum, count) => sum + count, 0),
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
      excludedUsers: excludedUserIds.length,
    },
    funnel,
    retention: { ...retention, ...firstWeekPosting },
    users: visible,
    groups: groupRows.map((group) => {
      const memberIds = new Set(group.memberships.map(({ userId }) => userId));
      const confirmations = periodConfirmations.filter((item) => memberIds.has(item.actorUserId));
      const posts = periodPosts.filter((item) => memberIds.has(item.actorUserId));
      return {
        id: group.id,
        name: group.name,
        activeMembers: memberIds.size,
        eligibleMembers: memberIds.size,
        activeMembersInPeriod: new Set([
          ...confirmations.map(({ actorUserId }) => actorUserId),
          ...posts.map(({ actorUserId }) => actorUserId),
        ]).size,
        confirmations: confirmations.reduce((sum, item) => sum + item._count._all, 0),
        posts: posts.reduce((sum, item) => sum + item._count._all, 0),
      };
    }),
    monitoring: {
      latestActivityAt: latestActivity?.occurredAt ?? null,
      latestPostAt: latestPost?.postedAt ?? null,
      usersInactiveForSevenDays: visible.filter(
        (user) =>
          !user.excludedFromMetrics &&
          user.status === 'ACTIVE' &&
          user.lastActiveAt !== null &&
          input.to.getTime() - user.lastActiveAt.getTime() >= 7 * 86_400_000,
      ).length,
      cohortTruncated: cohortRows.length > 5000,
    },
    truncated: rows.length > input.limit || cohortRows.length > 5000,
  };
}
