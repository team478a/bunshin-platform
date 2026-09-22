import { ApplicationError } from '@bunshin/shared';
import type { Prisma } from './client';
import { pointAccountRecord, pointTransactionRecord } from './point-records';

export async function applyPointCreditToAccount(
  tx: Prisma.TransactionClient,
  input: { accountId: string; transactionId: string; amount: number },
) {
  const account = await tx.pointAccount.findUniqueOrThrow({ where: { id: input.accountId } });
  const recoveryApplied = Math.min(account.recoveryDue, input.amount);
  if (recoveryApplied > 0) {
    const recoveries = await tx.pointTransaction.findMany({
      where: { accountId: account.id, type: 'RECOVERY' },
      include: { consumptionFor: true },
      orderBy: { createdAt: 'asc' },
    });
    let remaining = recoveryApplied;
    for (const recovery of recoveries) {
      const linked = recovery.consumptionFor.reduce((sum, item) => sum + item.amount, 0);
      const outstanding = Math.max(0, Math.abs(recovery.amount) - linked);
      const amount = Math.min(remaining, outstanding);
      if (amount === 0) continue;
      await tx.pointConsumptionLink.create({
        data: {
          consumptionTransactionId: recovery.id,
          grantTransactionId: input.transactionId,
          amount,
        },
      });
      remaining -= amount;
      if (remaining === 0) break;
    }
    if (remaining !== 0)
      throw new ApplicationError('CONFLICT', 'point recovery attribution mismatch');
  }
  return tx.pointAccount.update({
    where: { id: account.id },
    data: {
      recoveryDue: { decrement: recoveryApplied },
      availablePoints: { increment: input.amount - recoveryApplied },
      revision: { increment: 1 },
    },
  });
}

export async function registerPointRecovery(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    groupId: string;
    userId: string;
    actorUserId: string;
    amount: number;
    idempotencyKey: string;
    now: Date;
  },
) {
  const account = await tx.pointAccount.findFirst({
    where: { workspaceId: input.workspaceId, userId: input.userId },
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
  if (
    existing &&
    (!['REVERSAL', 'RECOVERY'].includes(existing.type) ||
      existing.amount !== -input.amount ||
      existing.workspaceId !== input.workspaceId ||
      existing.userId !== input.userId ||
      existing.groupId !== input.groupId ||
      existing.sourceType !== 'OPERATOR_RECOVERY' ||
      existing.sourceId !== input.actorUserId)
  )
    throw new ApplicationError('CONFLICT', 'idempotency key payload mismatch');
  if (existing) return { applied: false as const };
  const recoveredPoints = Math.min(account.availablePoints, input.amount);
  const recoveryAdded = input.amount - recoveredPoints;
  const changed = await tx.pointAccount.updateMany({
    where: {
      id: account.id,
      availablePoints: account.availablePoints,
      recoveryDue: account.recoveryDue,
      revision: account.revision,
    },
    data: {
      availablePoints: { decrement: recoveredPoints },
      recoveryDue: { increment: recoveryAdded },
      revision: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new ApplicationError('CONFLICT', 'point account changed');
  const transaction = await tx.pointTransaction.create({
    data: {
      accountId: account.id,
      workspaceId: input.workspaceId,
      userId: input.userId,
      groupId: input.groupId,
      type: recoveryAdded > 0 ? 'RECOVERY' : 'REVERSAL',
      amount: -input.amount,
      idempotencyKey: input.idempotencyKey,
      sourceType: 'OPERATOR_RECOVERY',
      sourceId: input.actorUserId,
      createdAt: input.now,
    },
  });
  const grants = await tx.pointTransaction.findMany({
    where: {
      accountId: account.id,
      type: { in: ['GRANT', 'REFUND'] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
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
  let remaining = recoveredPoints;
  for (const grant of grants) {
    const linked = grant.consumptions.reduce((sum, item) => sum + item.amount, 0);
    const amount = Math.min(remaining, Math.max(0, grant.amount - linked));
    if (amount === 0) continue;
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
    throw new ApplicationError('CONFLICT', 'point recovery attribution mismatch');
  const updated = await tx.pointAccount.findUniqueOrThrow({ where: { id: account.id } });
  return {
    applied: true as const,
    before: pointAccountRecord(account),
    account: pointAccountRecord(updated),
    recoveredPoints,
    recoveryAdded,
    transaction: pointTransactionRecord(transaction),
  };
}

export async function cancelPointRecovery(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    groupId: string;
    userId: string;
    actorUserId: string;
    recoveryTransactionId: string;
    idempotencyKey: string;
    now: Date;
  },
) {
  const recovery = await tx.pointTransaction.findFirst({
    where: {
      id: input.recoveryTransactionId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      userId: input.userId,
      type: { in: ['REVERSAL', 'RECOVERY'] },
      sourceType: 'OPERATOR_RECOVERY',
    },
    include: { account: true, consumptionFor: true },
  });
  if (!recovery) return null;
  const existingCancellation = await tx.pointTransaction.findFirst({
    where: {
      accountId: recovery.accountId,
      type: 'REFUND',
      sourceType: 'OPERATOR_RECOVERY_CANCELLATION',
      sourceId: recovery.id,
    },
  });
  if (existingCancellation) return { applied: false as const };
  const existingIdempotency = await tx.pointTransaction.findUnique({
    where: {
      accountId_idempotencyKey: {
        accountId: recovery.accountId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existingIdempotency)
    throw new ApplicationError('CONFLICT', 'idempotency key payload mismatch');
  const amount = Math.abs(recovery.amount);
  const recoveredPoints = recovery.consumptionFor.reduce((sum, item) => sum + item.amount, 0);
  if (recoveredPoints > amount)
    throw new ApplicationError('CONFLICT', 'point recovery attribution mismatch');
  const recoveryDueCancelled = amount - recoveredPoints;
  const account = recovery.account;
  if (account.recoveryDue < recoveryDueCancelled)
    throw new ApplicationError('CONFLICT', 'point recovery balance mismatch');
  const changed = await tx.pointAccount.updateMany({
    where: {
      id: account.id,
      availablePoints: account.availablePoints,
      recoveryDue: account.recoveryDue,
      revision: account.revision,
    },
    data: {
      availablePoints: { increment: recoveredPoints },
      recoveryDue: { decrement: recoveryDueCancelled },
      revision: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new ApplicationError('CONFLICT', 'point account changed');
  const cancellation = await tx.pointTransaction.create({
    data: {
      accountId: account.id,
      workspaceId: input.workspaceId,
      userId: input.userId,
      groupId: input.groupId,
      type: 'REFUND',
      amount,
      idempotencyKey: input.idempotencyKey,
      sourceType: 'OPERATOR_RECOVERY_CANCELLATION',
      sourceId: recovery.id,
      createdAt: input.now,
    },
  });
  if (recoveryDueCancelled > 0) {
    await tx.pointConsumptionLink.create({
      data: {
        consumptionTransactionId: recovery.id,
        grantTransactionId: cancellation.id,
        amount: recoveryDueCancelled,
      },
    });
  }
  const updated = await tx.pointAccount.findUniqueOrThrow({ where: { id: account.id } });
  return {
    applied: true as const,
    before: pointAccountRecord(account),
    account: pointAccountRecord(updated),
    amount,
    recoveredPointsRestored: recoveredPoints,
    recoveryDueCancelled,
    recoveryTransaction: pointTransactionRecord(recovery),
    cancellationTransaction: pointTransactionRecord(cancellation),
  };
}
