import type { PointLedgerRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient } from './client';
import { pointAccountRecord, pointTransactionRecord } from './point-records';
import { activePointMember, validPointAttribution } from './point-scope';

export async function consumePoints(
  client: PrismaClient,
  input: Parameters<PointLedgerRepository['consume']>[0],
) {
  return client.$transaction(
    async (tx) => {
      if (!(await activePointMember(tx, input.workspaceId, input.actorUserId))) return null;
      if (!(await validPointAttribution(tx, input))) return null;
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
      if (remaining !== 0) throw new ApplicationError('CONFLICT', 'point ledger balance mismatch');
      const updated = await tx.pointAccount.findUniqueOrThrow({ where: { id: account.id } });
      return {
        account: pointAccountRecord(updated),
        transaction: pointTransactionRecord(transaction),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
