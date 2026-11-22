import type { Prisma, PrismaClient } from '@prisma/client';
import { remainingServiceCreditLots } from './service-credit-lots';

type Tx = Prisma.TransactionClient;
type Scope = { workspaceId: string; groupId: string; groupMembershipId: string; userId: string };

export const FORTUNE_FOLLOW_UP_CREDIT_NAME = '特典クレジット';
export const FORTUNE_FOLLOW_UP_CREDIT_KEY = 'fortune-follow-up:';
export const FORTUNE_FOLLOW_UP_PENDING_MS = 120_000;

export function fortuneFollowUpReservationCutoff(now: Date) {
  return new Date(now.getTime() - FORTUNE_FOLLOW_UP_PENDING_MS);
}

export async function lockFortuneCreditAccount(tx: Tx, scope: Scope) {
  await tx.$queryRaw`SELECT id FROM service_credit_accounts
     WHERE workspace_id=${scope.workspaceId}::uuid AND group_id=${scope.groupId}::uuid
       AND group_membership_id=${scope.groupMembershipId}::uuid AND user_id=${scope.userId}::uuid FOR UPDATE`;
}

export async function readFortuneFollowUpCreditBalance(
  db: PrismaClient | Tx,
  scope: Scope,
  now: Date,
  exchange?: { readingId: string; requestId?: string },
) {
  const account = await db.serviceCreditAccount.findFirst({
    where: scope,
    select: { id: true, availableCredits: true },
  });
  if (!account)
    return { accountId: null, available: 0, lots: [], recordedAt: now, completedExchanges: 0 };

  const [entries, held] = await Promise.all([
    db.serviceCreditLedger.findMany({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        userId: scope.userId,
        accountId: account.id,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        type: true,
        amount: true,
        expiresAt: true,
        sourceId: true,
        lotAllocations: true,
        createdAt: true,
        idempotencyKey: true,
      },
    }),
    db.fortuneReadingFollowUp.aggregate({
      where: {
        status: 'PENDING',
        creditCost: { not: null },
        createdAt: { gt: fortuneFollowUpReservationCutoff(now) },
        reading: {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          memberUserId: scope.userId,
          participant: { groupMembershipId: scope.groupMembershipId },
        },
        ...(exchange?.requestId
          ? { NOT: { readingId: exchange.readingId, id: exchange.requestId } }
          : {}),
      },
      _sum: { creditCost: true },
    }),
  ]);
  const lots = Array.from(remainingServiceCreditLots(entries))
    .filter(([, lot]) => lot.remaining > 0 && (lot.expiresAt === null || lot.expiresAt > now))
    .sort(
      ([, left], [, right]) =>
        (left.expiresAt?.getTime() ?? Infinity) - (right.expiresAt?.getTime() ?? Infinity),
    );
  const available = Math.max(
    0,
    Math.min(
      account.availableCredits,
      lots.reduce((total, [, lot]) => total + lot.remaining, 0),
    ) - (held._sum.creditCost ?? 0),
  );
  const recordedAt = new Date(
    Math.max(now.getTime(), (entries.at(-1)?.createdAt.getTime() ?? 0) + 1),
  );
  const prefix = exchange && `${FORTUNE_FOLLOW_UP_CREDIT_KEY}${exchange.readingId}:`;
  const completedExchanges = prefix
    ? entries.filter((entry) => entry.type === 'CONSUME' && entry.idempotencyKey.startsWith(prefix))
        .length
    : 0;
  return { accountId: account.id, available, lots, recordedAt, completedExchanges };
}

/** Caller holds the account lock and completes the answer in this transaction. */
export async function settleFortuneFollowUpCredits(
  tx: Tx,
  scope: Scope,
  input: { readingId: string; requestId: string; creditCost: number },
  now: Date,
) {
  const { accountId, available, lots, recordedAt } = await readFortuneFollowUpCreditBalance(
    tx,
    scope,
    now,
    input,
  );
  if (!accountId || available < input.creditCost) return false;
  const { availableCredits } = await tx.serviceCreditAccount.update({
    where: { id: accountId },
    data: { availableCredits: { decrement: input.creditCost }, revision: { increment: 1 } },
    select: { availableCredits: true },
  });
  const lotAllocations: Record<string, number> = {};
  let remaining = input.creditCost;
  for (const [lotId, lot] of lots) {
    const amount = Math.min(remaining, lot.remaining);
    lotAllocations[lotId] = amount;
    remaining -= amount;
    if (remaining === 0) break;
  }
  await tx.serviceCreditLedger.create({
    data: {
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      userId: scope.userId,
      accountId,
      type: 'CONSUME',
      amount: -input.creditCost,
      balanceAfter: availableCredits,
      sourceType: 'SYSTEM',
      sourceId: input.requestId,
      lotAllocations,
      idempotencyKey: `${FORTUNE_FOLLOW_UP_CREDIT_KEY}${input.readingId}:${input.requestId}`,
      createdAt: recordedAt,
    },
  });
  return true;
}
