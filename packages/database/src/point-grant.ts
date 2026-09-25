import type { PointLedgerRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient } from './client';
import { applyPointCreditToAccount } from './point-account';
import { pointAccountRecord, pointTransactionRecord } from './point-records';
import { activePointMember, validPointAttribution } from './point-scope';

export async function grantPoints(
  client: PrismaClient,
  input: Parameters<PointLedgerRepository['grant']>[0],
) {
  try {
    return await client.$transaction(
      async (tx) => {
        if (!(await activePointMember(tx, input.workspaceId, input.actorUserId))) return null;
        if (!(await validPointAttribution(tx, input))) return null;
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
    const account = await client.pointAccount.findUnique({
      where: {
        workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId },
      },
    });
    if (!account) throw error;
    const transaction = await client.pointTransaction.findUnique({
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
