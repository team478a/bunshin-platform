import {
  calculateAdminRetention,
  calculateFirstWeekThreePostKpi,
  type AdminOperationsRepository,
  type AdminOperationsSnapshot,
  type AdminUserDetail,
  type AdminUserStage,
  type AdminUserSummary,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
const adminUserSelect = {
  id: true,
  displayName: true,
  email: true,
  status: true,
  createdAt: true,
  identities: { select: { provider: true } },
  memberships: {
    select: { role: true, status: true, workspace: { select: { id: true, name: true } } },
  },
  groupMemberships: {
    where: { status: 'ACTIVE' },
    select: { groupId: true, group: { select: { name: true } } },
  },
  activityMetricExclusionsAsTarget: {
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    select: { environment: true, action: true, occurredAt: true },
  },
  bunshins: {
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      capabilityAssignments: {
        where: { capabilityType: 'SOCIAL', status: 'ACTIVE' },
        select: { id: true },
      },
      socialAccountStrategies: {
        where: { status: 'APPROVED' },
        select: { id: true },
      },
    },
  },
  missionActivities: {
    orderBy: { occurredAt: 'desc' },
    take: 50,
    select: { type: true, occurredAt: true },
  },
  postRecords: {
    orderBy: { postedAt: 'desc' },
    take: 50,
    select: { postedAt: true },
  },
  aiUsageEvents: {
    orderBy: { occurredAt: 'desc' },
    take: 50,
    select: { status: true, occurredAt: true, estimatedCostUsdMicros: true, errorCode: true },
  },
  lineConnections: {
    select: { environment: true, status: true, friendshipStatus: true, updatedAt: true },
  },
  accountDeletionRequests: {
    where: { status: { in: ['REQUESTED', 'PROCESSING', 'BLOCKED'] } },
    select: { id: true },
  },
  _count: { select: { postRecords: true, aiUsageEvents: true } },
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;
const copyActivityTypes = new Set([
  'COPIED_TEXT',
  'COPIED_SLIDE',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SCRIPT',
]);

function adminUserSummary(
  row: AdminUserRow,
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION',
  now = new Date(),
): AdminUserSummary {
  const activityTypes = new Set(row.missionActivities.map(({ type }) => type));
  let stage: AdminUserStage = 'REGISTERED';
  if (row.bunshins.length > 0) stage = 'BUNSHIN_CREATED';
  if (row.bunshins.some(({ capabilityAssignments }) => capabilityAssignments.length > 0))
    stage = 'SOCIAL_ACTIVATED';
  if (row.bunshins.some(({ socialAccountStrategies }) => socialAccountStrategies.length > 0))
    stage = 'STRATEGY_APPROVED';
  if (activityTypes.has('VIEWED')) stage = 'MISSION_VIEWED';
  if (activityTypes.has('ACCEPTED')) stage = 'MISSION_ACCEPTED';
  if ([...activityTypes].some((type) => copyActivityTypes.has(type))) stage = 'COPIED';
  if (row.postRecords.length > 0) stage = 'POSTED';

  const lineConnections = row.lineConnections.filter((item) => item.environment === environment);
  const activityDates = [
    row.createdAt,
    ...row.missionActivities.map(({ occurredAt }) => occurredAt),
    ...row.postRecords.map(({ postedAt }) => postedAt),
    ...row.aiUsageEvents.map(({ occurredAt }) => occurredAt),
    ...lineConnections.map(({ updatedAt }) => updatedAt),
  ];
  const lastActiveAt = new Date(Math.max(...activityDates.map((value) => value.getTime())));
  const deletionPending = row.accountDeletionRequests.length > 0;
  const latestMetricAction = row.activityMetricExclusionsAsTarget.find(
    (item) => item.environment === environment,
  );
  let attentionReason: string | null = null;
  if (row.status !== 'ACTIVE') attentionReason = '利用停止・退会済み';
  else if (deletionPending) attentionReason = '退会処理待ち';
  else if (row.bunshins.length === 0 && now.getTime() - row.createdAt.getTime() >= 86_400_000)
    attentionReason = '投稿パートナーが未作成';
  else if (now.getTime() - lastActiveAt.getTime() >= 7 * 86_400_000)
    attentionReason = '7日以上利用がありません';
  else if (row.aiUsageEvents.filter(({ status }) => status === 'FAILED').length >= 3)
    attentionReason = 'AI処理が繰り返し失敗';

  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    status: row.status,
    createdAt: row.createdAt,
    authProviders: [...new Set(row.identities.map(({ provider }) => provider))],
    bunshinCount: row.bunshins.length,
    postCount: row._count.postRecords,
    aiCalls: row._count.aiUsageEvents,
    aiFailedCalls: row.aiUsageEvents.filter(({ status }) => status === 'FAILED').length,
    lineConnected: lineConnections.some(({ status }) => status === 'ACTIVE'),
    lineFollowing: lineConnections.some(({ friendshipStatus }) => friendshipStatus === 'FOLLOWING'),
    deletionPending,
    lastActiveAt,
    stage,
    attentionReason,
    excludedFromMetrics: latestMetricAction?.action === 'EXCLUDED',
    periodConfirmations: 0,
    periodPosts: 0,
  };
}

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
    return this.client.$transaction(async (tx) => {
      const actor = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!actor) return null;
      const target = await tx.user.findUnique({
        where: { id: input.userId },
        include: { platformAdmin: { select: { status: true } } },
      });
      if (!target) return null;
      if (
        target.status === 'DELETED' ||
        target.status === input.status ||
        target.platformAdmin?.status === 'ACTIVE'
      )
        return false;
      await tx.user.update({ where: { id: target.id }, data: { status: input.status } });
      if (input.status === 'SUSPENDED') {
        await tx.lineNotificationPreference.updateMany({
          where: { userId: target.id, enabled: true },
          data: { enabled: false },
        });
      }
      await tx.userOperationAudit.create({
        data: {
          targetUserId: target.id,
          actorUserId: input.actorUserId,
          action: input.status === 'SUSPENDED' ? 'SUSPENDED' : 'REACTIVATED',
          previousStatus: target.status,
          nextStatus: input.status,
          reason: input.reason,
        },
      });
      return true;
    });
  }

  async setMetricExclusion(
    input: Parameters<AdminOperationsRepository['setMetricExclusion']>[0],
  ): Promise<boolean | null> {
    return this.client.$transaction(async (tx) => {
      const actor = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!actor) return null;
      const target = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });
      if (!target) return null;
      const latest = await tx.activityMetricExclusion.findFirst({
        where: { targetUserId: target.id, environment: input.environment },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: { action: true },
      });
      const nextAction = input.excluded ? 'EXCLUDED' : 'INCLUDED';
      if ((latest?.action ?? 'INCLUDED') === nextAction) return false;
      await tx.activityMetricExclusion.create({
        data: {
          targetUserId: target.id,
          actorUserId: input.actorUserId,
          environment: input.environment,
          action: nextAction,
          reason: input.reason,
        },
      });
      return true;
    });
  }

  async createSupportCase(
    input: Parameters<AdminOperationsRepository['createSupportCase']>[0],
  ): Promise<boolean | null> {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT'] },
        },
        select: { id: true },
      });
      if (!admin) return false;
      if (!(await tx.user.findUnique({ where: { id: input.userId }, select: { id: true } })))
        return null;
      await tx.supportCase.create({
        data: {
          targetUserId: input.userId,
          createdByUserId: input.actorUserId,
          assigneeUserId: input.actorUserId,
          subject: input.subject,
          priority: input.priority,
          notes: { create: { authorUserId: input.actorUserId, content: input.note } },
        },
      });
      return true;
    });
  }

  async updateSupportCase(
    input: Parameters<AdminOperationsRepository['updateSupportCase']>[0],
  ): Promise<boolean | null> {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT'] },
        },
        select: { id: true },
      });
      if (!admin) return false;
      const supportCase = await tx.supportCase.findFirst({
        where: { id: input.supportCaseId, targetUserId: input.userId },
        select: { id: true },
      });
      if (!supportCase) return null;
      if (input.assigneeUserId) {
        const assignee = await tx.platformAdmin.findFirst({
          where: { userId: input.assigneeUserId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!assignee) return false;
      }
      await tx.supportCase.update({
        where: { id: supportCase.id },
        data: {
          status: input.status,
          priority: input.priority,
          assigneeUserId: input.assigneeUserId,
          resolvedAt: input.status === 'RESOLVED' ? new Date() : null,
          notes: { create: { authorUserId: input.actorUserId, content: input.note } },
        },
      });
      return true;
    });
  }

  async listSupportCases(input: Parameters<AdminOperationsRepository['listSupportCases']>[0]) {
    if (!(await this.authorized(input.actorUserId))) return null;
    return (
      await this.client.supportCase.findMany({
        where: input.status ? { status: input.status } : {},
        include: {
          target: { select: { displayName: true, email: true } },
          assignee: { select: { displayName: true } },
        },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: 200,
      })
    ).map((item) => ({
      id: item.id,
      targetUserId: item.targetUserId,
      targetDisplayName: item.target.displayName,
      targetEmail: item.target.email,
      subject: item.subject,
      status: item.status,
      priority: item.priority,
      assigneeDisplayName: item.assignee?.displayName ?? null,
      updatedAt: item.updatedAt,
    }));
  }
}
