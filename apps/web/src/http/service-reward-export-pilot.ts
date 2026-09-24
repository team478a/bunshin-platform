import 'server-only';
import {
  buildRewardsPilotMetrics,
  resolveRewardsPilotMeasurementPeriod,
} from '../rewards/rewards-pilot-metrics';
import { displayName, timestamp } from './service-reward-export-format';

const pilotStatusLabel = {
  UPCOMING: '開始前',
  ACTIVE: '実施中',
  COMPLETED: '終了',
  ROLLING: '期間未設定（直近28日）',
} as const;

export async function pilotRows(workspaceId: string, groupId: string, now: Date) {
  const db = await import('@bunshin/database');
  const [policy, registeredParticipants] = await Promise.all([
    db.prisma.groupFeaturePolicy.findFirst({
      where: { workspaceId, groupId, featureKey: 'REWARDS.POINTS_BADGES' },
      select: { startsAt: true, endsAt: true },
    }),
    db.prisma.groupMembership.findMany({
      where: {
        workspaceId,
        groupId,
        status: 'ACTIVE',
        serviceRole: 'PARTICIPANT',
        consentedAt: { not: null },
      },
      select: {
        userId: true,
        user: { select: { displayName: true, email: true } },
      },
    }),
  ]);
  const period = resolveRewardsPilotMeasurementPeriod({
    startsAt: policy?.startsAt ?? null,
    endsAt: policy?.endsAt ?? null,
    now,
  });
  const participants = new Map(
    registeredParticipants.map((membership) => [membership.userId, membership.user] as const),
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
