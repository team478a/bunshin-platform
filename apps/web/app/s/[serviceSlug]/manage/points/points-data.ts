import 'server-only';

import { buildRewardsPilotReadiness } from '../../../../../src/rewards/rewards-pilot-readiness';
import {
  buildRewardsPilotMetrics,
  resolveRewardsPilotMeasurementPeriod,
} from '../../../../../src/rewards/rewards-pilot-metrics';
import { getRewardsPilotExpiryNotice } from '../../../../../src/rewards/rewards-pilot-expiry';
import { RULES } from './actions';

export async function loadPointSettingsData({
  workspaceId,
  serviceId,
  actorUserId,
}: {
  workspaceId: string;
  serviceId: string;
  actorUserId: string;
}) {
  const db = await import('@bunshin/database');
  const now = new Date();
  const memberships = await db.prisma.groupMembership.findMany({
    where: {
      workspaceId: workspaceId,
      groupId: serviceId,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      userId: true,
      user: { select: { displayName: true, email: true } },
      serviceRole: true,
      consentedAt: true,
    },
    orderBy: { user: { displayName: 'asc' } },
  });
  const memberUserIds = memberships.map(({ userId }) => userId);
  const bonusRecipients = memberships.filter(({ userId }) => userId !== actorUserId);
  const [pointConfiguration, rewardsPolicy, platformAdmin] = await Promise.all([
    db.prisma.serviceConfiguration.findFirstOrThrow({
      where: { workspaceId: workspaceId, groupId: serviceId },
      select: { pointIssuanceStopped: true },
    }),
    db.prisma.groupFeaturePolicy.findFirst({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        featureKey: 'REWARDS.POINTS_BADGES',
      },
      select: { status: true, startsAt: true, endsAt: true },
    }),
    db.prisma.platformAdmin.findFirst({
      where: {
        userId: actorUserId,
        status: 'ACTIVE',
        role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
      },
      select: { id: true },
    }),
  ]);
  const [
    versions,
    campaigns,
    rewardSettings,
    globalRewardCatalog,
    history,
    pointAccounts,
    servicePointTransactions,
    badgeAwards,
  ] = await Promise.all([
    db.prisma.pointRuleVersion.findMany({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        campaignId: null,
        ruleKey: { in: RULES.map((rule) => rule.key) },
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      include: { budget: true },
      orderBy: [{ ruleKey: 'asc' }, { version: 'desc' }],
    }),
    db.prisma.campaign.findMany({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        status: { in: ['DRAFT', 'OPEN'] },
        endsAt: { gt: now },
      },
      select: {
        id: true,
        name: true,
        status: true,
        startsAt: true,
        endsAt: true,
        pointRuleVersions: {
          where: {
            status: { in: ['ACTIVE', 'SUSPENDED'] },
            ruleKey: { in: RULES.map((rule) => rule.key) },
          },
          include: { budget: true },
          orderBy: { version: 'desc' },
        },
      },
      orderBy: [{ startsAt: 'asc' }, { name: 'asc' }],
    }),
    db.prisma.servicePointRewardSetting.findMany({
      where: { workspaceId: workspaceId, groupId: serviceId },
      select: { rewardType: true, status: true, pointCost: true },
    }),
    db.prisma.pointRewardCatalogItem.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      select: { rewardType: true, pointCost: true, version: true },
      orderBy: [{ rewardType: 'asc' }, { version: 'desc' }],
    }),
    db.prisma.serviceConfigurationAudit.findMany({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        action: {
          in: [
            'POINT_RULES_UPDATED',
            'CAMPAIGN_POINT_RULES_UPDATED',
            'POINT_BONUS_GRANTED',
            'POINT_BALANCE_CORRECTED',
            'POINT_RECOVERY_REGISTERED',
            'POINT_RECOVERY_CANCELLED',
            'POINT_ISSUANCE_STOPPED',
            'POINT_ISSUANCE_RESUMED',
            'POINT_REWARDS_UPDATED',
          ],
        },
      },
      select: {
        id: true,
        action: true,
        afterData: true,
        reason: true,
        occurredAt: true,
        performedBy: { select: { displayName: true, email: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 30,
    }),
    db.prisma.pointAccount.findMany({
      where: { workspaceId: workspaceId, userId: { in: memberUserIds } },
      select: { userId: true, availablePoints: true, recoveryDue: true, updatedAt: true },
    }),
    db.prisma.pointTransaction.groupBy({
      by: ['userId'],
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        userId: { in: memberUserIds },
      },
      _sum: { amount: true },
      _max: { createdAt: true },
    }),
    db.prisma.badgeAward.groupBy({
      by: ['userId'],
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        userId: { in: memberUserIds },
        status: 'ACTIVE',
      },
      _count: { _all: true },
      _max: { awardedAt: true },
    }),
  ]);
  const recoveryTransactions = await db.prisma.pointTransaction.findMany({
    where: {
      workspaceId: workspaceId,
      groupId: serviceId,
      type: { in: ['REVERSAL', 'RECOVERY'] },
      sourceType: 'OPERATOR_RECOVERY',
    },
    select: {
      id: true,
      userId: true,
      amount: true,
      createdAt: true,
      user: { select: { displayName: true, email: true } },
      consumptionFor: { select: { amount: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const recoveryCancellations = recoveryTransactions.length
    ? await db.prisma.pointTransaction.findMany({
        where: {
          workspaceId: workspaceId,
          groupId: serviceId,
          type: 'REFUND',
          sourceType: 'OPERATOR_RECOVERY_CANCELLATION',
          sourceId: { in: recoveryTransactions.map(({ id }) => id) },
        },
        select: { sourceId: true },
      })
    : [];
  const cancelledRecoveryIds = new Set(
    recoveryCancellations.flatMap(({ sourceId }) => (sourceId ? [sourceId] : [])),
  );
  const cancellableRecoveries = recoveryTransactions.filter(
    ({ id }) => !cancelledRecoveryIds.has(id),
  );
  const current = new Map<string, (typeof versions)[number]>();
  for (const version of versions)
    if (!current.has(version.ruleKey)) current.set(version.ruleKey, version);
  const currentRewardSettings = new Map(
    rewardSettings.map((setting) => [setting.rewardType, setting]),
  );
  const globalRewardDefaults = new Map<string, number>();
  for (const reward of globalRewardCatalog)
    if (!globalRewardDefaults.has(reward.rewardType))
      globalRewardDefaults.set(reward.rewardType, reward.pointCost);
  const pilotPeriod = resolveRewardsPilotMeasurementPeriod({
    startsAt: rewardsPolicy?.startsAt ?? null,
    endsAt: rewardsPolicy?.endsAt ?? null,
    now,
  });
  const rewardsPolicyActive = Boolean(
    rewardsPolicy &&
    rewardsPolicy.status === 'ENABLED' &&
    (!rewardsPolicy.startsAt || rewardsPolicy.startsAt <= now) &&
    (!rewardsPolicy.endsAt || rewardsPolicy.endsAt > now),
  );
  const configuredFourWeekPilot = Boolean(
    rewardsPolicy?.status === 'ENABLED' &&
    rewardsPolicy.startsAt &&
    rewardsPolicy.endsAt &&
    rewardsPolicy.endsAt > now &&
    rewardsPolicy.endsAt.getTime() - rewardsPolicy.startsAt.getTime() >= 28 * 24 * 60 * 60 * 1000,
  );
  const activeRewardsPilotMembers = memberships.filter(
    (membership) => membership.consentedAt && membership.serviceRole === 'PARTICIPANT',
  );
  const rewardsPilotActiveCount = activeRewardsPilotMembers.length;
  const activePointRuleCount = RULES.filter((rule) => {
    const saved = current.get(rule.key);
    return !saved || saved.status === 'ACTIVE';
  }).length;
  const pilotReadiness = buildRewardsPilotReadiness({
    policyStatus: rewardsPolicy?.status ?? null,
    startsAt: rewardsPolicy?.startsAt ?? null,
    endsAt: rewardsPolicy?.endsAt ?? null,
    now,
    activeParticipantCount: rewardsPilotActiveCount,
    pointIssuanceStopped: pointConfiguration.pointIssuanceStopped,
    activeRuleCount: activePointRuleCount,
  });
  const rewardsPilotUserIds = [
    ...new Set(activeRewardsPilotMembers.map((membership) => membership.userId)),
  ];
  const rewardsPilotCount = rewardsPilotUserIds.length;
  const policyExpiryNotice = getRewardsPilotExpiryNotice(rewardsPolicy?.endsAt ?? null, now);
  const [pilotPosts, pilotGrantTransactions, pilotRedemptions] = await Promise.all([
    db.prisma.postRecord.findMany({
      where: {
        workspaceId: workspaceId,
        actorUserId: { in: rewardsPilotUserIds },
        postedAt: { gte: pilotPeriod.from, lt: pilotPeriod.toExclusive },
        bunshin: { groupId: serviceId },
      },
      select: { actorUserId: true, postedAt: true },
    }),
    db.prisma.pointTransaction.findMany({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        userId: { in: rewardsPilotUserIds },
        type: 'GRANT',
        createdAt: { gte: pilotPeriod.from, lt: pilotPeriod.toExclusive },
      },
      select: { userId: true, amount: true },
    }),
    db.prisma.pointRedemption.findMany({
      where: {
        workspaceId: workspaceId,
        userId: { in: rewardsPilotUserIds },
        consumptionTransaction: { groupId: serviceId },
        status: 'CONFIRMED',
        confirmedAt: { gte: pilotPeriod.from, lt: pilotPeriod.toExclusive },
      },
      select: { userId: true, pointCost: true },
    }),
  ]);
  const rewardsPilotMetrics = buildRewardsPilotMetrics({
    participantIds: rewardsPilotUserIds,
    posts: pilotPosts.map((post) => ({ userId: post.actorUserId, postedAt: post.postedAt })),
    transactions: [
      ...pilotGrantTransactions.map((transaction) => ({
        userId: transaction.userId,
        type: 'GRANT' as const,
        amount: transaction.amount,
      })),
      ...pilotRedemptions.map((redemption) => ({
        userId: redemption.userId,
        type: 'CONSUME' as const,
        amount: -redemption.pointCost,
      })),
    ],
  });
  const recentRedemptions = await db.prisma.pointRedemption.findMany({
    where: {
      workspaceId: workspaceId,
      consumptionTransaction: { groupId: serviceId },
    },
    select: {
      id: true,
      status: true,
      pointCost: true,
      createdAt: true,
      confirmedAt: true,
      user: { select: { displayName: true, email: true } },
      catalogItem: { select: { title: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const pilotPercentage = (count: number) =>
    rewardsPilotCount === 0 ? '—' : `${Math.round((count / rewardsPilotCount) * 100)}%`;
  const pilotPeriodEnd = new Date(
    Math.max(pilotPeriod.from.getTime(), pilotPeriod.toExclusive.getTime() - 1),
  );
  const formatPilotDate = (value: Date) =>
    value.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const pilotPeriodLabel = `${formatPilotDate(pilotPeriod.from)}〜${formatPilotDate(pilotPeriodEnd)}`;
  const configuredPilotPeriodLabel =
    rewardsPolicy?.startsAt && rewardsPolicy.endsAt
      ? `${formatPilotDate(rewardsPolicy.startsAt)}〜${formatPilotDate(rewardsPolicy.endsAt)}`
      : null;
  const memberName = new Map(
    memberships.map((membership) => [
      membership.userId,
      membership.user.displayName || membership.user.email || '参加者',
    ]),
  );
  const pointAccountByUser = new Map(pointAccounts.map((account) => [account.userId, account]));
  const pointChangeByUser = new Map<string, number>();
  const badgeCountByUser = new Map<string, number>();
  const latestActivityByUser = new Map<string, Date>();
  for (const transaction of servicePointTransactions) {
    pointChangeByUser.set(transaction.userId, transaction._sum.amount ?? 0);
    if (transaction._max.createdAt)
      latestActivityByUser.set(transaction.userId, transaction._max.createdAt);
  }
  for (const award of badgeAwards) {
    badgeCountByUser.set(award.userId, award._count._all);
    const latest = latestActivityByUser.get(award.userId);
    if (award._max.awardedAt && (!latest || award._max.awardedAt > latest))
      latestActivityByUser.set(award.userId, award._max.awardedAt);
  }
  for (const account of pointAccounts) {
    const latest = latestActivityByUser.get(account.userId);
    if (!latest || account.updatedAt > latest)
      latestActivityByUser.set(account.userId, account.updatedAt);
  }

  return {
    memberships,
    bonusRecipients,
    pointConfiguration,
    platformAdmin,
    campaigns,
    history,
    cancellableRecoveries,
    current,
    currentRewardSettings,
    globalRewardDefaults,
    rewardsPolicyActive,
    configuredFourWeekPilot,
    rewardsPilotActiveCount,
    pilotReadiness,
    policyExpiryNotice,
    rewardsPilotMetrics,
    recentRedemptions,
    pilotPercentage,
    pilotPeriod,
    pilotPeriodLabel,
    configuredPilotPeriodLabel,
    memberName,
    pointAccountByUser,
    pointChangeByUser,
    badgeCountByUser,
    latestActivityByUser,
    rewardsPilotFeatureKey: db.REWARDS_PILOT_FEATURE_KEY,
  };
}

export type PointSettingsData = Awaited<ReturnType<typeof loadPointSettingsData>>;
