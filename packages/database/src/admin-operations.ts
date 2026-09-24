import {
  calculateAdminRetention,
  calculateFirstWeekThreePostKpi,
  type AdminOperationsRepository,
  type AdminOperationsSnapshot,
  type AdminUserDetail,
  type AdminUserStage,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
import {
  createAdminSupportCase,
  listAdminSupportCases,
  updateAdminSupportCase,
} from './admin-support-cases';
import { setAdminMetricExclusion, setAdminUserStatus } from './admin-user-operations';
import { adminUserSelect, adminUserSummary } from './admin-user-summary';

export class PrismaAdminOperationsRepository implements AdminOperationsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async authorized(actorUserId: string) {
    return Boolean(
      await this.client.platformAdmin.findFirst({
        where: { userId: actorUserId, status: 'ACTIVE' },
        select: { id: true },
      }),
    );
  }

  async snapshot(
    input: Parameters<AdminOperationsRepository['snapshot']>[0],
  ): Promise<AdminOperationsSnapshot | null> {
    if (!(await this.authorized(input.actorUserId))) return null;
    const exclusionHistory = await this.client.activityMetricExclusion.findMany({
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
      this.client.user.findMany({
        where: search,
        select: adminUserSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
      }),
      this.client.user.findMany({
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
      this.client.user.count({ where: eligibleUser }),
      this.client.user.count({ where: { status: 'ACTIVE', ...eligibleUser } }),
      this.client.postRecord.groupBy({
        by: ['actorUserId'],
        where: { postedAt: period, actorUserId: { notIn: excludedUserIds } },
        _count: { _all: true },
      }),
      this.client.aiUsageEvent.findMany({
        where: { occurredAt: period, actorUserId: { notIn: excludedUserIds } },
        select: { status: true, estimatedCostUsdMicros: true },
      }),
      this.client.lineConnection.findMany({
        where: {
          environment: input.environment,
          status: 'ACTIVE',
          userId: { notIn: excludedUserIds },
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.client.accountDeletionRequest.findMany({
        where: { status: { in: ['REQUESTED', 'PROCESSING', 'BLOCKED'] } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.client.lineMessageDelivery.count({
        where: { environment: input.environment, status: 'SENT', sentAt: period },
      }),
      this.client.lineMessageDeliveryAttempt.count({
        where: {
          delivery: { environment: input.environment },
          status: 'FAILED',
          attemptedAt: period,
        },
      }),
      this.client.supportCase.count({ where: { createdAt: period } }),
      this.client.supportCase.count({ where: { status: 'RESOLVED', resolvedAt: period } }),
      this.client.missionActivity.groupBy({
        by: ['actorUserId'],
        where: {
          occurredAt: period,
          type: 'CONFIRMED',
          actorUserId: { notIn: excludedUserIds },
        },
        _count: { _all: true },
      }),
      this.client.group.findMany({
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
      this.client.missionActivity.findFirst({
        where: { actorUserId: { notIn: excludedUserIds } },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      }),
      this.client.postRecord.findFirst({
        where: { actorUserId: { notIn: excludedUserIds } },
        orderBy: { postedAt: 'desc' },
        select: { postedAt: true },
      }),
    ]);
    const confirmationCount = new Map<string, number>();
    const postCount = new Map<string, number>();
    for (const item of periodConfirmations)
      confirmationCount.set(item.actorUserId, item._count._all);
    for (const item of periodPosts) postCount.set(item.actorUserId, item._count._all);
    const visible = rows.slice(0, input.limit).map((row) => ({
      ...adminUserSummary(row, input.environment),
      periodConfirmations: confirmationCount.get(row.id) ?? 0,
      periodPosts: postCount.get(row.id) ?? 0,
    }));
    const cohort = cohortRows.slice(0, 5000).map((row) => adminUserSummary(row, input.environment));
    const cohortCreatedAt = new Map(
      cohortRows.slice(0, 5000).map((row) => [row.id, row.createdAt]),
    );
    const d1EligibleIds = [...cohortCreatedAt]
      .filter(([, createdAt]) => createdAt.getTime() + 2 * 86_400_000 <= input.to.getTime())
      .map(([id]) => id);
    const d7EligibleIds = [...cohortCreatedAt]
      .filter(([, createdAt]) => createdAt.getTime() + 8 * 86_400_000 <= input.to.getTime())
      .map(([id]) => id);
    const firstWeekEligibleIds = [...cohortCreatedAt]
      .filter(([, createdAt]) => createdAt.getTime() + 7 * 86_400_000 <= input.to.getTime())
      .map(([id]) => id);
    const retentionIds = [
      ...new Set([...d1EligibleIds, ...d7EligibleIds, ...firstWeekEligibleIds]),
    ];
    const [retentionActivities, retentionPosts] = retentionIds.length
      ? await Promise.all([
          this.client.missionActivity.findMany({
            where: { actorUserId: { in: retentionIds }, occurredAt: { lt: input.to } },
            select: { actorUserId: true, occurredAt: true },
          }),
          this.client.postRecord.findMany({
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

  async userDetail(
    input: Parameters<AdminOperationsRepository['userDetail']>[0],
  ): Promise<AdminUserDetail | null> {
    if (!(await this.authorized(input.actorUserId))) return null;
    const [row, operationAudits, metricExclusionAudits, supportCases] = await Promise.all([
      this.client.user.findUnique({
        where: { id: input.userId },
        select: adminUserSelect,
      }),
      this.client.userOperationAudit.findMany({
        where: { targetUserId: input.userId },
        include: { actor: { select: { displayName: true } } },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      }),
      this.client.activityMetricExclusion.findMany({
        where: { targetUserId: input.userId },
        include: { actor: { select: { displayName: true } } },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
      this.client.supportCase.findMany({
        where: { targetUserId: input.userId },
        include: {
          assignee: { select: { displayName: true } },
          notes: {
            include: { author: { select: { displayName: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        take: 50,
      }),
    ]);
    if (!row) return null;
    const timeline = [
      ...row.missionActivities.map((item) => ({
        type: item.type,
        occurredAt: item.occurredAt,
        label: `投稿案：${item.type}`,
        outcome: 'INFO' as const,
      })),
      ...row.postRecords.map((item) => ({
        type: 'POSTED',
        occurredAt: item.postedAt,
        label: '投稿完了',
        outcome: 'SUCCESS' as const,
      })),
      ...row.aiUsageEvents.map((item) => ({
        type: 'AI',
        occurredAt: item.occurredAt,
        label:
          item.status === 'SUCCESS'
            ? 'AI処理成功'
            : `AI処理失敗（${item.errorCode ?? '原因不明'}）`,
        outcome: item.status,
      })),
    ]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 50);
    return {
      user: adminUserSummary(row, input.environment),
      workspaces: row.memberships.map((item) => ({
        id: item.workspace.id,
        name: item.workspace.name,
        role: item.role,
        status: item.status,
      })),
      bunshins: row.bunshins.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        createdAt: item.createdAt,
      })),
      timeline,
      operationAudits: operationAudits.map((audit) => ({
        id: audit.id,
        action: audit.action,
        previousStatus: audit.previousStatus,
        nextStatus: audit.nextStatus,
        reason: audit.reason,
        actorDisplayName: audit.actor.displayName,
        occurredAt: audit.occurredAt,
      })),
      metricExclusionAudits: metricExclusionAudits.map((audit) => ({
        id: audit.id,
        action: audit.action,
        environment: audit.environment,
        reason: audit.reason,
        actorDisplayName: audit.actor.displayName,
        occurredAt: audit.occurredAt,
      })),
      supportCases: supportCases.map((supportCase) => ({
        id: supportCase.id,
        subject: supportCase.subject,
        status: supportCase.status,
        priority: supportCase.priority,
        assigneeUserId: supportCase.assigneeUserId,
        assigneeDisplayName: supportCase.assignee?.displayName ?? null,
        createdAt: supportCase.createdAt,
        updatedAt: supportCase.updatedAt,
        resolvedAt: supportCase.resolvedAt,
        notes: supportCase.notes.map((note) => ({
          id: note.id,
          content: note.content,
          authorDisplayName: note.author.displayName,
          createdAt: note.createdAt,
        })),
      })),
    };
  }

  async setUserStatus(
    input: Parameters<AdminOperationsRepository['setUserStatus']>[0],
  ): Promise<boolean | null> {
    return setAdminUserStatus(this.client, input);
  }

  async setMetricExclusion(
    input: Parameters<AdminOperationsRepository['setMetricExclusion']>[0],
  ): Promise<boolean | null> {
    return setAdminMetricExclusion(this.client, input);
  }

  async createSupportCase(
    input: Parameters<AdminOperationsRepository['createSupportCase']>[0],
  ): Promise<boolean | null> {
    return createAdminSupportCase(this.client, input);
  }

  async updateSupportCase(
    input: Parameters<AdminOperationsRepository['updateSupportCase']>[0],
  ): Promise<boolean | null> {
    return updateAdminSupportCase(this.client, input);
  }

  async listSupportCases(input: Parameters<AdminOperationsRepository['listSupportCases']>[0]) {
    return listAdminSupportCases(this.client, input);
  }
}
