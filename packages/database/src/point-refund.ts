import type { PointLedgerRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient } from './client';
import { applyPointCreditToAccount } from './point-account';
import { pointAccountRecord, pointTransactionRecord } from './point-records';
import { activePointMember } from './point-scope';

export async function refundPoints(
  client: PrismaClient,
  input: Parameters<PointLedgerRepository['refund']>[0],
) {
  return client.$transaction(
    async (tx) => {
      if (!(await activePointMember(tx, input.workspaceId, input.actorUserId))) return null;
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
