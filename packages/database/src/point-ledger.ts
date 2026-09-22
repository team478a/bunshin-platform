import type {
  PointAccountSnapshot,
  PointLedgerRepository,
  PointUserDashboard,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';
import { applyPointCreditToAccount } from './point-account';
import { pointAccountRecord, pointTransactionRecord, pointWeekKey } from './point-records';

export class PrismaPointLedgerRepository implements PointLedgerRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async activeMember(tx: Prisma.TransactionClient, workspaceId: string, userId: string) {
    return tx.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  private async validAttribution(
    tx: Prisma.TransactionClient,
    input: { workspaceId: string; groupId: string | null; campaignId: string | null },
  ) {
    if (input.campaignId && !input.groupId) return false;
    if (input.groupId) {
      const group = await tx.group.findFirst({
        where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!group) return false;
    }
    if (input.campaignId) {
      const campaign = await tx.campaign.findFirst({
        where: {
          id: input.campaignId,
          workspaceId: input.workspaceId,
          groupId: input.groupId!,
        },
        select: { id: true },
      });
      if (!campaign) return false;
    }
    return true;
  }

  async getAccount(input: { workspaceId: string; actorUserId: string }) {
    const row = await this.client.pointAccount.findFirst({
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

  async getUserDashboard(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    now: Date;
    timezone: string;
  }): Promise<PointUserDashboard | null> {
    const membership = await this.client.workspaceMembership.findFirst({
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

    const groupMembership = await this.client.groupMembership.findFirst({
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

    const campaignParticipations = await this.client.campaignParticipation.findMany({
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

    const account = await this.client.pointAccount.findUnique({
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
        ? this.client.pointTransaction.findMany({
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
        ? this.client.pointTransaction.findMany({
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
      this.client.pointRuleVersion.findMany({
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
      this.client.postRecord.findMany({
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

  async grant(input: Parameters<PointLedgerRepository['grant']>[0]) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          if (!(await this.activeMember(tx, input.workspaceId, input.actorUserId))) return null;
          if (!(await this.validAttribution(tx, input))) return null;
          if (input.ruleVersionId) {
            const rule = await tx.pointRuleVersion.findFirst({
              where: {
                id: input.ruleVersionId,
                status: 'ACTIVE',
                OR: [{ workspaceId: null }, { workspaceId: input.workspaceId }],
              },
              select: { id: true },
            });
            if (!rule) return null;
          }
          const account = await tx.pointAccount.upsert({
            where: {
              workspaceId_userId: {
                workspaceId: input.workspaceId,
                userId: input.actorUserId,
              },
            },
            create: { workspaceId: input.workspaceId, userId: input.actorUserId },
            update: {},
          });
          const existing = await tx.pointTransaction.findUnique({
            where: {
              accountId_idempotencyKey: {
                accountId: account.id,
                idempotencyKey: input.idempotencyKey,
              },
            },
          });
          if (existing && (existing.type !== 'GRANT' || existing.amount !== input.amount))
            throw new ApplicationError('CONFLICT', 'idempotency key payload mismatch');
          if (existing)
            return {
              account: pointAccountRecord(account),
              transaction: pointTransactionRecord(existing),
            };
          const transaction = await tx.pointTransaction.create({
            data: {
              accountId: account.id,
              workspaceId: input.workspaceId,
              userId: input.actorUserId,
              groupId: input.groupId,
              campaignId: input.campaignId,
              ruleVersionId: input.ruleVersionId,
              type: 'GRANT',
              amount: input.amount,
              idempotencyKey: input.idempotencyKey,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
              expiresAt: input.expiresAt,
            },
          });
          const updated = await applyPointCreditToAccount(tx, {
            accountId: account.id,
            transactionId: transaction.id,
            amount: input.amount,
          });
          return {
            account: pointAccountRecord(updated),
            transaction: pointTransactionRecord(transaction),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const account = await this.client.pointAccount.findUnique({
        where: {
          workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId },
        },
      });
      if (!account) throw error;
      const transaction = await this.client.pointTransaction.findUnique({
        where: {
          accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey },
        },
      });
      if (!transaction) throw error;
      return {
        account: pointAccountRecord(account),
        transaction: pointTransactionRecord(transaction),
      };
    }
  }

  async consume(input: Parameters<PointLedgerRepository['consume']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        if (!(await this.activeMember(tx, input.workspaceId, input.actorUserId))) return null;
        if (!(await this.validAttribution(tx, input))) return null;
        const account = await tx.pointAccount.findUnique({
          where: {
            workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId },
          },
        });
        if (!account) return null;
        const existing = await tx.pointTransaction.findUnique({
          where: {
            accountId_idempotencyKey: {
              accountId: account.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing && (existing.type !== 'CONSUME' || existing.amount !== -input.amount))
          throw new ApplicationError('CONFLICT', 'idempotency key payload mismatch');
        if (existing)
          return {
            account: pointAccountRecord(account),
            transaction: pointTransactionRecord(existing),
          };
        const changed = await tx.pointAccount.updateMany({
          where: { id: account.id, availablePoints: { gte: input.amount }, recoveryDue: 0 },
          data: { availablePoints: { decrement: input.amount }, revision: { increment: 1 } },
        });
        if (changed.count !== 1) return null;
        const transaction = await tx.pointTransaction.create({
          data: {
            accountId: account.id,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            groupId: input.groupId,
            campaignId: input.campaignId,
            type: 'CONSUME',
            amount: -input.amount,
            idempotencyKey: input.idempotencyKey,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          },
        });
        const grants = await tx.pointTransaction.findMany({
          where: {
            accountId: account.id,
            type: { in: ['GRANT', 'REFUND'] },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: { consumptions: true },
        });
        grants.sort((left, right) =>
          left.expiresAt === null
            ? right.expiresAt === null
              ? left.createdAt.getTime() - right.createdAt.getTime()
              : 1
            : right.expiresAt === null
              ? -1
              : left.expiresAt.getTime() - right.expiresAt.getTime(),
        );
        let remaining = input.amount;
        for (const grant of grants) {
          const used = grant.consumptions.reduce((sum, link) => sum + link.amount, 0);
          const available = grant.amount - used;
          if (available <= 0) continue;
          const amount = Math.min(remaining, available);
          await tx.pointConsumptionLink.create({
            data: {
              consumptionTransactionId: transaction.id,
              grantTransactionId: grant.id,
              amount,
            },
          });
          remaining -= amount;
          if (remaining === 0) break;
        }
        if (remaining !== 0)
          throw new ApplicationError('CONFLICT', 'point ledger balance mismatch');
        const updated = await tx.pointAccount.findUniqueOrThrow({ where: { id: account.id } });
        return {
          account: pointAccountRecord(updated),
          transaction: pointTransactionRecord(transaction),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async refund(input: Parameters<PointLedgerRepository['refund']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        if (!(await this.activeMember(tx, input.workspaceId, input.actorUserId))) return null;
        const consumption = await tx.pointTransaction.findFirst({
          where: {
            id: input.consumptionTransactionId,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            type: 'CONSUME',
          },
        });
        if (!consumption) return null;
        const existing = await tx.pointTransaction.findUnique({
          where: {
            accountId_idempotencyKey: {
              accountId: consumption.accountId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (
          existing &&
          (existing.type !== 'REFUND' || existing.sourceId !== input.consumptionTransactionId)
        )
          throw new ApplicationError('CONFLICT', 'idempotency key payload mismatch');
        if (existing) {
          const account = await tx.pointAccount.findUniqueOrThrow({
            where: { id: consumption.accountId },
          });
          return {
            account: pointAccountRecord(account),
            transaction: pointTransactionRecord(existing),
          };
        }
        const previous = await tx.pointTransaction.aggregate({
          where: {
            accountId: consumption.accountId,
            type: 'REFUND',
            sourceType: 'CONSUMPTION_REFUND',
            sourceId: consumption.id,
          },
          _sum: { amount: true },
        });
        const amount = Math.abs(consumption.amount) - (previous._sum.amount ?? 0);
        if (amount <= 0) return null;
        const transaction = await tx.pointTransaction.create({
          data: {
            accountId: consumption.accountId,
            workspaceId: consumption.workspaceId,
            userId: consumption.userId,
            groupId: consumption.groupId,
            campaignId: consumption.campaignId,
            type: 'REFUND',
            amount,
            idempotencyKey: input.idempotencyKey,
            sourceType: 'CONSUMPTION_REFUND',
            sourceId: consumption.id,
          },
        });
        const account = await applyPointCreditToAccount(tx, {
          accountId: consumption.accountId,
          transactionId: transaction.id,
          amount,
        });
        return {
          account: pointAccountRecord(account),
          transaction: pointTransactionRecord(transaction),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
