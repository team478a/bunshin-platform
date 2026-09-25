import type { PointAccountSnapshot, PointUserDashboard } from '@bunshin/application';
import type { PrismaClient } from './client';
import { pointAccountRecord, pointTransactionRecord, pointWeekKey } from './point-records';

export async function getPointAccount(
  client: PrismaClient,
  input: { workspaceId: string; actorUserId: string },
) {
  const row = await client.pointAccount.findFirst({
    where: {
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
      workspace: { status: 'ACTIVE' },
      user: { status: 'ACTIVE' },
      AND: {
        workspace: {
          memberships: {
            some: { userId: input.actorUserId, status: 'ACTIVE' },
          },
        },
      },
    },
  });
  return row ? pointAccountRecord(row) : null;
}

export async function getPointUserDashboard(
  client: PrismaClient,
  input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    now: Date;
    timezone: string;
  },
): Promise<PointUserDashboard | null> {
  const membership = await client.workspaceMembership.findFirst({
    where: {
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
      status: 'ACTIVE',
      workspace: { status: 'ACTIVE' },
      user: { status: 'ACTIVE' },
    },
    select: { id: true },
  });
  if (!membership) return null;

  const groupMembership = await client.groupMembership.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      userId: input.actorUserId,
      status: 'ACTIVE',
      group: { status: 'ACTIVE' },
    },
    select: { id: true },
  });
  if (!groupMembership) return null;

  const campaignParticipations = await client.campaignParticipation.findMany({
    where: {
      userId: input.actorUserId,
      status: 'ACCEPTED',
      campaign: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'OPEN',
        startsAt: { lte: input.now },
        endsAt: { gt: input.now },
      },
    },
    select: { campaignId: true, campaign: { select: { name: true } } },
  });
  const campaignIds = campaignParticipations.map(({ campaignId }) => campaignId);

  const account = await client.pointAccount.findUnique({
    where: {
      workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId },
    },
  });
  const emptyAccount: PointAccountSnapshot = {
    id: '',
    workspaceId: input.workspaceId,
    userId: input.actorUserId,
    availablePoints: 0,
    recoveryDue: 0,
    updatedAt: input.now,
  };
  const thirtyDaysLater = new Date(input.now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [transactions, expiring, rules, posts] = await Promise.all([
    account
      ? client.pointTransaction.findMany({
          where: {
            accountId: account.id,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            OR: [{ groupId: input.groupId }, { groupId: null }],
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : [],
    account
      ? client.pointTransaction.findMany({
          where: {
            accountId: account.id,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            type: 'GRANT',
            expiresAt: { gt: input.now, lte: thirtyDaysLater },
          },
          select: {
            amount: true,
            expiresAt: true,
            consumptions: { select: { amount: true } },
          },
          orderBy: { expiresAt: 'asc' },
        })
      : [],
    client.pointRuleVersion.findMany({
      where: {
        status: { in: ['ACTIVE', 'SUSPENDED'] },
        OR: [{ groupId: null }, { groupId: input.groupId }],
        AND: [
          { OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }] },
          { OR: [{ campaignId: null }, { campaignId: { in: campaignIds } }] },
          { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
        ],
      },
      select: {
        ruleKey: true,
        grantAmount: true,
        dailyLimit: true,
        weeklyLimit: true,
        workspaceId: true,
        groupId: true,
        campaignId: true,
        campaign: { select: { name: true } },
        status: true,
        version: true,
      },
      orderBy: [{ ruleKey: 'asc' }, { version: 'desc' }],
    }),
    client.postRecord.findMany({
      where: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        bunshin: { groupId: input.groupId },
      },
      select: { postedAt: true },
      orderBy: { postedAt: 'desc' },
      take: 20,
    }),
  ]);
  const weekKey = pointWeekKey(input.now, input.timezone);
  const uniqueRules = new Map<string, (typeof rules)[number]>();
  rules
    .sort(
      (left, right) =>
        Number(Boolean(right.groupId)) - Number(Boolean(left.groupId)) ||
        Number(right.workspaceId === input.workspaceId) -
          Number(left.workspaceId === input.workspaceId) ||
        right.version - left.version,
    )
    .forEach((rule) => {
      const key = `${rule.campaignId ?? 'service'}:${rule.ruleKey}`;
      if (!uniqueRules.has(key)) uniqueRules.set(key, rule);
    });
  const expiringBalances = expiring
    .map((item) => ({
      expiresAt: item.expiresAt,
      amount: Math.max(
        0,
        item.amount - item.consumptions.reduce((used, link) => used + link.amount, 0),
      ),
    }))
    .filter((item) => item.amount > 0);
  return {
    account: account ? pointAccountRecord(account) : emptyAccount,
    recentTransactions: transactions.map(pointTransactionRecord),
    expiringWithin30Days: expiringBalances.reduce((sum, item) => sum + item.amount, 0),
    nextExpiryAt: expiringBalances[0]?.expiresAt ?? null,
    earningMethods: [...uniqueRules.values()]
      .filter((rule) => rule.status === 'ACTIVE')
      .map((rule) => ({
        ruleKey: rule.ruleKey,
        campaignId: rule.campaignId,
        campaignName: rule.campaign?.name ?? null,
        grantAmount: rule.grantAmount,
        dailyLimit: rule.dailyLimit,
        weeklyLimit: rule.weeklyLimit,
      })),
    weeklyPosts: posts.filter((post) => pointWeekKey(post.postedAt, input.timezone) === weekKey)
      .length,
    weeklyPostGoal: 3,
  };
}
