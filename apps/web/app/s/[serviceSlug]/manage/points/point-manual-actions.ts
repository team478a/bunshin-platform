import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';

const bonusSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(80),
  operationId: z.uuid(),
  userId: z.uuid(),
  amount: z.coerce.number().int().min(1).max(10000),
  reason: z.string().trim().min(3).max(1000),
});

const correctionSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(80),
  operationId: z.uuid(),
  userId: z.uuid(),
  amount: z.coerce.number().int().min(1).max(10000),
  reason: z.string().trim().min(3).max(1000),
});

const recoveryCancellationSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(80),
  operationId: z.uuid(),
  recoveryTransactionId: z.uuid(),
  reason: z.string().trim().min(3).max(1000),
});

const expiryFrom = (now: Date) => {
  const after180Days = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(after180Days.getUTCFullYear(), after180Days.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
};
export async function grantBonus(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = bonusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = `/s/${parsed.data.serviceSlug}/manage/points` as Route;
  try {
    if (parsed.data.userId === actor.userId) throw new Error('SELF_REWARD_NOT_ALLOWED');
    const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const now = new Date();
    await db.prisma.$transaction(
      async (tx) => {
        const [member, configuration] = await Promise.all([
          tx.groupMembership.findFirst({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              userId: parsed.data.userId,
              status: 'ACTIVE',
            },
            select: { userId: true },
          }),
          tx.serviceConfiguration.findFirst({
            where: { workspaceId: service.workspaceId, groupId: service.serviceId },
            select: { id: true, pointIssuanceStopped: true },
          }),
        ]);
        if (!member || !configuration) throw new Error('MEMBER_NOT_FOUND');
        if (configuration.pointIssuanceStopped) throw new Error('POINT_ISSUANCE_STOPPED');
        const account = await tx.pointAccount.upsert({
          where: {
            workspaceId_userId: {
              workspaceId: service.workspaceId,
              userId: member.userId,
            },
          },
          create: { workspaceId: service.workspaceId, userId: member.userId },
          update: {},
        });
        const idempotencyKey = `operator-bonus:${parsed.data.operationId}`;
        const existing = await tx.pointTransaction.findUnique({
          where: {
            accountId_idempotencyKey: {
              accountId: account.id,
              idempotencyKey,
            },
          },
        });
        if (
          existing &&
          (existing.type !== 'GRANT' ||
            existing.amount !== parsed.data.amount ||
            existing.workspaceId !== service.workspaceId ||
            existing.userId !== member.userId ||
            existing.groupId !== service.serviceId ||
            existing.sourceType !== 'OPERATOR_BONUS' ||
            existing.sourceId !== actor.userId)
        )
          throw new Error('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
        if (existing) return;
        const transaction = await tx.pointTransaction.create({
          data: {
            accountId: account.id,
            workspaceId: service.workspaceId,
            userId: member.userId,
            groupId: service.serviceId,
            type: 'GRANT',
            amount: parsed.data.amount,
            idempotencyKey,
            sourceType: 'OPERATOR_BONUS',
            sourceId: actor.userId,
            expiresAt: expiryFrom(now),
            createdAt: now,
          },
        });
        const updated = await db.applyPointCreditToAccount(tx, {
          accountId: account.id,
          transactionId: transaction.id,
          amount: parsed.data.amount,
        });
        await tx.serviceConfigurationAudit.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            configurationId: configuration.id,
            action: 'POINT_BONUS_GRANTED',
            beforeData: {
              availablePoints: account.availablePoints,
              recoveryDue: account.recoveryDue,
            },
            afterData: {
              userId: member.userId,
              amount: parsed.data.amount,
              availablePoints: updated.availablePoints,
              recoveryDue: updated.recoveryDue,
              idempotencyKey,
            },
            reason: parsed.data.reason,
            performedByUserId: actor.userId,
            occurredAt: now,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (error) {
    redirect(
      `${returnPath}?error=${error instanceof Error && error.message === 'POINT_ISSUANCE_STOPPED' ? 'stopped' : 'bonus'}` as Route,
    );
  }
  revalidatePath(returnPath);
  redirect(`${returnPath}?bonus=1` as Route);
}

export async function correctPoints(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = correctionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = `/s/${parsed.data.serviceSlug}/manage/points` as Route;
  try {
    const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const now = new Date();
    await db.prisma.$transaction(
      async (tx) => {
        const [member, configuration] = await Promise.all([
          tx.groupMembership.findFirst({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              userId: parsed.data.userId,
              status: 'ACTIVE',
            },
            select: { userId: true },
          }),
          tx.serviceConfiguration.findFirst({
            where: { workspaceId: service.workspaceId, groupId: service.serviceId },
            select: { id: true },
          }),
        ]);
        if (!member || !configuration) throw new Error('MEMBER_OR_ACCOUNT_NOT_FOUND');
        const idempotencyKey = `operator-recovery:${parsed.data.operationId}`;
        const recovery = await db.registerPointRecovery(tx, {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          userId: member.userId,
          actorUserId: actor.userId,
          amount: parsed.data.amount,
          idempotencyKey,
          now,
        });
        if (!recovery) throw new Error('MEMBER_OR_ACCOUNT_NOT_FOUND');
        if (!recovery.applied) return;
        await tx.serviceConfigurationAudit.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            configurationId: configuration.id,
            action: 'POINT_RECOVERY_REGISTERED',
            beforeData: {
              availablePoints: recovery.before.availablePoints,
              recoveryDue: recovery.before.recoveryDue,
            },
            afterData: {
              userId: member.userId,
              amount: -parsed.data.amount,
              recoveredPoints: recovery.recoveredPoints,
              recoveryAdded: recovery.recoveryAdded,
              availablePoints: recovery.account.availablePoints,
              recoveryDue: recovery.account.recoveryDue,
              idempotencyKey,
            },
            reason: parsed.data.reason,
            performedByUserId: actor.userId,
            occurredAt: now,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  } catch {
    redirect(`${returnPath}?error=recovery` as Route);
  }
  revalidatePath(returnPath);
  revalidatePath('/points');
  revalidatePath(`/s/${parsed.data.serviceSlug}/activity`);
  redirect(`${returnPath}?corrected=1` as Route);
}

export async function cancelRecovery(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = recoveryCancellationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = `/s/${parsed.data.serviceSlug}/manage/points` as Route;
  try {
    const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const now = new Date();
    await db.prisma.$transaction(
      async (tx) => {
        const [configuration, recoveryTransaction] = await Promise.all([
          tx.serviceConfiguration.findFirst({
            where: { workspaceId: service.workspaceId, groupId: service.serviceId },
            select: { id: true },
          }),
          tx.pointTransaction.findFirst({
            where: {
              id: parsed.data.recoveryTransactionId,
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              type: { in: ['REVERSAL', 'RECOVERY'] },
              sourceType: 'OPERATOR_RECOVERY',
            },
            select: { userId: true },
          }),
        ]);
        if (!configuration || !recoveryTransaction) throw new Error('POINT_RECOVERY_NOT_FOUND');
        const idempotencyKey = `operator-recovery-cancellation:${parsed.data.operationId}`;
        const cancellation = await db.cancelPointRecovery(tx, {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          userId: recoveryTransaction.userId,
          actorUserId: actor.userId,
          recoveryTransactionId: parsed.data.recoveryTransactionId,
          idempotencyKey,
          now,
        });
        if (!cancellation) throw new Error('POINT_RECOVERY_NOT_FOUND');
        if (!cancellation.applied) return;
        await tx.serviceConfigurationAudit.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            configurationId: configuration.id,
            action: 'POINT_RECOVERY_CANCELLED',
            beforeData: {
              availablePoints: cancellation.before.availablePoints,
              recoveryDue: cancellation.before.recoveryDue,
            },
            afterData: {
              userId: recoveryTransaction.userId,
              recoveryTransactionId: parsed.data.recoveryTransactionId,
              amount: cancellation.amount,
              recoveredPointsRestored: cancellation.recoveredPointsRestored,
              recoveryDueCancelled: cancellation.recoveryDueCancelled,
              availablePoints: cancellation.account.availablePoints,
              recoveryDue: cancellation.account.recoveryDue,
              idempotencyKey,
            },
            reason: parsed.data.reason,
            performedByUserId: actor.userId,
            occurredAt: now,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  } catch {
    redirect(`${returnPath}?error=recovery-cancellation` as Route);
  }
  revalidatePath(returnPath);
  revalidatePath('/points');
  redirect(`${returnPath}?recoveryCancelled=1` as Route);
}
