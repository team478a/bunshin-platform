import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { resolveManagedServiceContext } from '../services/public-service';
import { csv } from './admin-report-export';

const exportKinds = ['summary', 'points', 'badges'] as const;
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
      select: { userId: true, availablePoints: true, updatedAt: true },
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
      kind === 'points'
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
