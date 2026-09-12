import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import {
  buildRewardsPilotMetrics,
  participatedInRewardsPilotPeriod,
  resolveRewardsPilotMeasurementPeriod,
} from '../rewards/rewards-pilot-metrics';
import { resolveManagedServiceContext } from '../services/public-service';
import { csv } from './admin-report-export';

const exportKinds = ['summary', 'points', 'badges', 'audit', 'pilot'] as const;
type ExportKind = (typeof exportKinds)[number];

const displayName = (user: { displayName: string; email: string | null }) =>
  user.displayName || user.email || '参加者';

const serviceRoleLabel = (role: string) =>
  role === 'SERVICE_OWNER'
    ? 'サービス所有者'
    : role === 'SERVICE_ADMIN'
      ? '運営管理者'
      : role === 'CONTENT_EDITOR'
        ? 'コンテンツ担当者'
        : '参加者';

const timestamp = (value: Date | null) => value?.toISOString() ?? '';

const jsonCell = (value: unknown) =>
  value === null || value === undefined ? '' : JSON.stringify(value);

const pointAuditActionLabel = (action: string) =>
  action === 'POINT_RULES_UPDATED'
    ? 'ポイント獲得条件を変更'
    : action === 'POINT_BONUS_GRANTED'
      ? 'ボーナスポイントを付与'
      : action === 'POINT_BALANCE_CORRECTED'
        ? 'ポイント残高を訂正'
        : action === 'POINT_RECOVERY_REGISTERED'
          ? '誤付与ポイントを回収'
          : action === 'POINT_RECOVERY_CANCELLED'
            ? '誤付与ポイントの回収を取消'
            : action;

const badgeAuditActionLabels: Record<string, string> = {
  GROUP_BADGE_CREATED_AND_SUBMITTED: 'バッジを作成',
  GROUP_BADGE_REVISED_BY_SERVICE_OPERATOR: 'バッジを編集',
  GROUP_BADGE_SUSPENDED_BY_SERVICE_OPERATOR: 'バッジを停止',
  GROUP_BADGE_REACTIVATED_BY_SERVICE_OPERATOR: 'バッジを再開',
  GROUP_BADGE_SUBMITTED: 'バッジを審査へ提出',
  GROUP_BADGE_APPROVED: 'バッジを承認',
  GROUP_BADGE_REJECTED: 'バッジを却下',
  GROUP_BADGE_CANDIDATE_NOMINATED: '参加者をバッジ候補に追加',
  BADGE_CANDIDATE_APPROVED: '参加者へバッジを付与',
  BADGE_CANDIDATE_REJECTED: 'バッジ候補を却下',
  BADGE_AWARD_REVOKED_BY_SERVICE_OPERATOR: 'バッジ付与を取り消し',
};

async function summaryRows(workspaceId: string, groupId: string) {
  const db = await import('@bunshin/database');
  const memberships = await db.prisma.groupMembership.findMany({
    where: { workspaceId, groupId, status: 'ACTIVE' },
    select: {
      userId: true,
      serviceRole: true,
      user: { select: { displayName: true, email: true } },
    },
    orderBy: { user: { displayName: 'asc' } },
  });
  const userIds = memberships.map(({ userId }) => userId);
  const [accounts, pointChanges, badgeAwards] = await Promise.all([
    db.prisma.pointAccount.findMany({
      where: { workspaceId, userId: { in: userIds } },
      select: { userId: true, availablePoints: true, recoveryDue: true, updatedAt: true },
    }),
    db.prisma.pointTransaction.groupBy({
      by: ['userId'],
      where: { workspaceId, groupId, userId: { in: userIds } },
      _sum: { amount: true },
      _max: { createdAt: true },
    }),
    db.prisma.badgeAward.groupBy({
      by: ['userId'],
      where: { workspaceId, groupId, userId: { in: userIds }, status: 'ACTIVE' },
      _count: { _all: true },
      _max: { awardedAt: true },
    }),
  ]);
  const accountByUser = new Map(accounts.map((value) => [value.userId, value]));
  const pointsByUser = new Map(pointChanges.map((value) => [value.userId, value]));
  const badgesByUser = new Map(badgeAwards.map((value) => [value.userId, value]));
  return [
    [
      '参加者ID',
      '参加者名',
      'メール',
      '役割',
      '現在のWP',
      '回収未済WP',
      'サービス内の増減',
      '獲得バッジ数',
      '最終更新',
    ],
    ...memberships.map((membership) => {
      const account = accountByUser.get(membership.userId);
      const point = pointsByUser.get(membership.userId);
      const badge = badgesByUser.get(membership.userId);
      const dates = [account?.updatedAt, point?._max.createdAt, badge?._max.awardedAt].filter(
        (value): value is Date => Boolean(value),
      );
      const latest = dates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      return [
        membership.userId,
        displayName(membership.user),
        membership.user.email ?? '',
        serviceRoleLabel(membership.serviceRole),
        account?.availablePoints ?? 0,
        account?.recoveryDue ?? 0,
        point?._sum.amount ?? 0,
        badge?._count._all ?? 0,
        timestamp(latest),
      ];
    }),
  ];
}

async function pointRows(workspaceId: string, groupId: string) {
  const db = await import('@bunshin/database');
  const transactions = await db.prisma.pointTransaction.findMany({
    where: { workspaceId, groupId },
    select: {
      id: true,
      userId: true,
      type: true,
      amount: true,
      sourceType: true,
      sourceId: true,
      expiresAt: true,
      createdAt: true,
      user: { select: { displayName: true, email: true } },
      ruleVersion: { select: { ruleKey: true, version: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return [
    [
      '取引ID',
      '日時',
      '参加者ID',
      '参加者名',
      'メール',
      '増減WP',
      '種類',
      'ルール',
      'ルール版',
      '発生元',
      '発生元ID',
      '有効期限',
    ],
    ...transactions.map((transaction) => [
      transaction.id,
      timestamp(transaction.createdAt),
      transaction.userId,
      displayName(transaction.user),
      transaction.user.email ?? '',
      transaction.amount,
      transaction.type,
      transaction.ruleVersion?.ruleKey ?? '',
      transaction.ruleVersion?.version ?? '',
      transaction.sourceType,
      transaction.sourceId ?? '',
      timestamp(transaction.expiresAt),
    ]),
  ];
}

async function badgeRows(workspaceId: string, groupId: string) {
  const db = await import('@bunshin/database');
  const awards = await db.prisma.badgeAward.findMany({
    where: { workspaceId, groupId },
    select: {
      id: true,
      userId: true,
      status: true,
      awardedAt: true,
      revokedAt: true,
      expiredAt: true,
      sourceType: true,
      sourceId: true,
      user: { select: { displayName: true, email: true } },
      badgeVersion: {
        select: { version: true, title: true, definition: { select: { code: true } } },
      },
    },
    orderBy: { awardedAt: 'desc' },
  });
  return [
    [
      '付与ID',
      '付与日時',
      '参加者ID',
      '参加者名',
      'メール',
      'バッジコード',
      'バッジ名',
      '版',
      '状態',
      '取消日時',
      '失効日時',
      '付与元',
      '付与元ID',
    ],
    ...awards.map((award) => [
      award.id,
      timestamp(award.awardedAt),
      award.userId,
      displayName(award.user),
      award.user.email ?? '',
      award.badgeVersion.definition.code,
      award.badgeVersion.title,
      award.badgeVersion.version,
      award.status,
      timestamp(award.revokedAt),
      timestamp(award.expiredAt),
      award.sourceType,
      award.sourceId,
    ]),
  ];
}

async function auditRows(workspaceId: string, groupId: string) {
  const db = await import('@bunshin/database');
  const [pointAudits, badgeAudits] = await Promise.all([
    db.prisma.serviceConfigurationAudit.findMany({
      where: {
        workspaceId,
        groupId,
        action: {
          in: [
            'POINT_RULES_UPDATED',
            'POINT_BONUS_GRANTED',
            'POINT_BALANCE_CORRECTED',
            'POINT_RECOVERY_REGISTERED',
            'POINT_RECOVERY_CANCELLED',
          ],
        },
      },
      select: {
        id: true,
        action: true,
        beforeData: true,
        afterData: true,
        reason: true,
        occurredAt: true,
        performedBy: { select: { displayName: true, email: true } },
      },
    }),
    db.prisma.badgeAdminAuditLog.findMany({
      where: { workspaceId, groupId },
      select: {
        id: true,
        action: true,
        beforeData: true,
        afterData: true,
        reason: true,
        occurredAt: true,
        badgeDefinition: {
          select: {
            code: true,
            versions: { select: { title: true }, orderBy: { version: 'desc' }, take: 1 },
          },
        },
        badgeVersion: {
          select: { title: true, definition: { select: { code: true } } },
        },
        badgeAward: {
          select: {
            userId: true,
            user: { select: { displayName: true, email: true } },
          },
        },
        performedBy: { select: { displayName: true, email: true } },
      },
    }),
  ]);
  const targetUserIds = new Set<string>();
  for (const audit of [...pointAudits, ...badgeAudits]) {
    const data =
      audit.afterData && typeof audit.afterData === 'object' && !Array.isArray(audit.afterData)
        ? (audit.afterData as Record<string, unknown>)
        : {};
    const userId =
      typeof data.targetUserId === 'string'
        ? data.targetUserId
        : typeof data.userId === 'string'
          ? data.userId
          : null;
    if (userId) targetUserIds.add(userId);
  }
  const users = await db.prisma.user.findMany({
    where: { id: { in: [...targetUserIds] } },
    select: { id: true, displayName: true, email: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  const rows = [
    ...pointAudits.map((audit) => {
      const data =
        audit.afterData && typeof audit.afterData === 'object' && !Array.isArray(audit.afterData)
          ? (audit.afterData as Record<string, unknown>)
          : {};
      const targetUserId = typeof data.userId === 'string' ? data.userId : '';
      const target = targetUserId ? userById.get(targetUserId) : null;
      return {
        id: audit.id,
        occurredAt: audit.occurredAt,
        category: 'ポイント',
        action: pointAuditActionLabel(audit.action),
        actor: displayName(audit.performedBy),
        targetUserId,
        target: target ? displayName(target) : '',
        badgeCode: '',
        badgeTitle: '',
        reason: audit.reason,
        beforeData: audit.beforeData,
        afterData: audit.afterData,
      };
    }),
    ...badgeAudits.map((audit) => {
      const data =
        audit.afterData && typeof audit.afterData === 'object' && !Array.isArray(audit.afterData)
          ? (audit.afterData as Record<string, unknown>)
          : {};
      const targetUserId =
        audit.badgeAward?.userId ??
        (typeof data.targetUserId === 'string'
          ? data.targetUserId
          : typeof data.userId === 'string'
            ? data.userId
            : '');
      const target = audit.badgeAward?.user ?? (targetUserId ? userById.get(targetUserId) : null);
      return {
        id: audit.id,
        occurredAt: audit.occurredAt,
        category: 'バッジ',
        action: badgeAuditActionLabels[audit.action] ?? audit.action,
        actor: displayName(audit.performedBy),
        targetUserId,
        target: target ? displayName(target) : '',
        badgeCode: audit.badgeVersion?.definition.code ?? audit.badgeDefinition?.code ?? '',
        badgeTitle: audit.badgeVersion?.title ?? audit.badgeDefinition?.versions[0]?.title ?? '',
        reason: audit.reason,
        beforeData: audit.beforeData,
        afterData: audit.afterData,
      };
    }),
  ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
  return [
    [
      '履歴ID',
      '日時',
      '分類',
      '操作',
      '実行者',
      '対象参加者ID',
      '対象参加者名',
      'バッジコード',
      'バッジ名',
      '理由',
      '変更前',
      '変更後',
    ],
    ...rows.map((row) => [
      row.id,
      timestamp(row.occurredAt),
      row.category,
      row.action,
      row.actor,
      row.targetUserId,
      row.target,
      row.badgeCode,
      row.badgeTitle,
      row.reason,
      jsonCell(row.beforeData),
      jsonCell(row.afterData),
    ]),
  ];
}

const pilotStatusLabel = {
  UPCOMING: '開始前',
  ACTIVE: '実施中',
  COMPLETED: '終了',
  ROLLING: '期間未設定（直近28日）',
} as const;

async function pilotRows(workspaceId: string, groupId: string, now: Date) {
  const db = await import('@bunshin/database');
  const [policy, assignments] = await Promise.all([
    db.prisma.groupFeaturePolicy.findFirst({
      where: { workspaceId, groupId, featureKey: 'REWARDS.POINTS_BADGES' },
      select: { startsAt: true, endsAt: true },
    }),
    db.prisma.groupMemberFeatureAssignment.findMany({
      where: {
        workspaceId,
        groupId,
        featureKey: 'REWARDS.POINTS_BADGES',
        status: 'ENABLED',
      },
      select: {
        status: true,
        startsAt: true,
        endsAt: true,
        groupMembership: {
          select: {
            userId: true,
            user: { select: { displayName: true, email: true } },
          },
        },
      },
    }),
  ]);
  const period = resolveRewardsPilotMeasurementPeriod({
    startsAt: policy?.startsAt ?? null,
    endsAt: policy?.endsAt ?? null,
    now,
  });
  const participants = new Map(
    assignments
      .filter((assignment) => participatedInRewardsPilotPeriod(assignment, period))
      .map(
        (assignment) =>
          [assignment.groupMembership.userId, assignment.groupMembership.user] as const,
      ),
  );
  const participantIds = [...participants.keys()];
  const timestampRange = { gte: period.from, lt: period.toExclusive };
  const [posts, grants, redemptions] = await Promise.all([
    db.prisma.postRecord.findMany({
      where: {
        workspaceId,
        actorUserId: { in: participantIds },
        postedAt: timestampRange,
        bunshin: { groupId },
      },
      select: { actorUserId: true, postedAt: true },
    }),
    db.prisma.pointTransaction.findMany({
      where: {
        workspaceId,
        groupId,
        userId: { in: participantIds },
        type: 'GRANT',
        createdAt: timestampRange,
      },
      select: { userId: true, amount: true },
    }),
    db.prisma.pointRedemption.findMany({
      where: {
        workspaceId,
        userId: { in: participantIds },
        consumptionTransaction: { groupId },
        status: 'CONFIRMED',
        confirmedAt: timestampRange,
      },
      select: { userId: true, pointCost: true },
    }),
  ]);
  const metricPosts = posts.map((post) => ({
    userId: post.actorUserId,
    postedAt: post.postedAt,
  }));
  const transactions = [
    ...grants.map((grant) => ({
      userId: grant.userId,
      type: 'GRANT' as const,
      amount: grant.amount,
    })),
    ...redemptions.map((redemption) => ({
      userId: redemption.userId,
      type: 'CONSUME' as const,
      amount: -redemption.pointCost,
    })),
  ];
  const total = buildRewardsPilotMetrics({ participantIds, posts: metricPosts, transactions });
  const rows: Array<Array<string | number | null>> = [
    [
      '行',
      '試験状態',
      '集計開始',
      '集計終了（この日時より前）',
      '参加者ID',
      '参加者名',
      'メール',
      '投稿した',
      '3日以上続けた',
      'ポイントを使った',
      '投稿数',
      '付与WP',
      '利用WP',
      '確認候補',
    ],
    [
      '全体',
      pilotStatusLabel[period.status],
      timestamp(period.from),
      timestamp(period.toExclusive),
      '',
      '',
      '',
      `${total.postingUserCount}人（${total.participantCount ? Math.round((total.postingUserCount / total.participantCount) * 100) : 0}%）`,
      `${total.continuedUserCount}人（${total.participantCount ? Math.round((total.continuedUserCount / total.participantCount) * 100) : 0}%）`,
      `${total.redemptionUserCount}人（${total.participantCount ? Math.round((total.redemptionUserCount / total.participantCount) * 100) : 0}%）`,
      total.postCount,
      total.grantedPoints,
      total.consumedPoints,
      `${total.reviewCandidates.length}人`,
    ],
  ];
  for (const [userId, user] of participants) {
    const metrics = buildRewardsPilotMetrics({
      participantIds: [userId],
      posts: metricPosts,
      transactions,
    });
    rows.push([
      '参加者',
      pilotStatusLabel[period.status],
      timestamp(period.from),
      timestamp(period.toExclusive),
      userId,
      displayName(user),
      user.email ?? '',
      metrics.postingUserCount ? 'はい' : 'いいえ',
      metrics.continuedUserCount ? 'はい' : 'いいえ',
      metrics.redemptionUserCount ? 'はい' : 'いいえ',
      metrics.postCount,
      metrics.grantedPoints,
      metrics.consumedPoints,
      metrics.reviewCandidates.flatMap(({ reasons }) => reasons).join('／'),
    ]);
  }
  return rows;
}

export async function serviceRewardExportResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const requestedKind = new URL(request.url).searchParams.get('kind') ?? 'summary';
    if (!exportKinds.includes(requestedKind as ExportKind))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reward export kind');
    const kind = requestedKind as ExportKind;
    const rows =
      kind === 'pilot'
        ? await pilotRows(service.workspaceId, service.serviceId, new Date())
        : kind === 'audit'
          ? await auditRows(service.workspaceId, service.serviceId)
          : kind === 'points'
            ? await pointRows(service.workspaceId, service.serviceId)
            : kind === 'badges'
              ? await badgeRows(service.workspaceId, service.serviceId)
              : await summaryRows(service.workspaceId, service.serviceId);
    return new Response(csv(rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="service-rewards-${kind}-${service.configuration.slug}.csv"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
