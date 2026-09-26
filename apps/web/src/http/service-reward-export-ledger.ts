import 'server-only';
import { displayName, serviceRoleLabel, timestamp } from './service-reward-export-format';

export async function summaryRows(workspaceId: string, groupId: string) {
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

export async function pointRows(workspaceId: string, groupId: string) {
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
      redemption: {
        select: {
          status: true,
          pointCost: true,
          catalogItem: { select: { title: true } },
        },
      },
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
      '交換内容',
      '交換状態',
      '交換WP',
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
      transaction.redemption?.catalogItem.title ?? '',
      transaction.redemption?.status ?? '',
      transaction.redemption?.pointCost ?? '',
      timestamp(transaction.expiresAt),
    ]),
  ];
}

export async function badgeRows(workspaceId: string, groupId: string) {
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
