import type { Prisma } from '@prisma/client';
import { remainingServiceCreditLots } from './service-credit-lots';

/** Caller holds the service lock and has revoked the confirmation in this transaction. */
export async function reverseConfirmedReferralRewards(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; groupId: string },
  referralId: string,
  reason: string,
  now: Date,
) {
  const rewards = await tx.serviceReferralReward.findMany({
    where: {
      ...scope,
      referralId,
      status: 'GRANTED',
      rule: { milestone: 'QUALIFICATION_CONFIRMED' },
    },
    orderBy: { beneficiaryAccountId: 'asc' },
  });
  for (const reward of rewards) {
    const accountId = reward.beneficiaryAccountId;
    await tx.$queryRaw`SELECT id FROM service_credit_accounts WHERE id=${accountId}::uuid AND workspace_id=${scope.workspaceId}::uuid AND group_id=${scope.groupId}::uuid FOR UPDATE`;
    const entries = await tx.serviceCreditLedger.findMany({
      where: { ...scope, accountId, userId: reward.beneficiaryUserId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        idempotencyKey: true,
        type: true,
        amount: true,
        expiresAt: true,
        sourceId: true,
        lotAllocations: true,
      },
    });
    const key = `referral:${referralId}:rule:${reward.ruleId}:membership:${reward.beneficiaryMembershipId}`;
    const grant = entries.find((row) => row.idempotencyKey === key);
    if (!grant) throw new Error('confirmed referral credit grant is missing');
    const amount = remainingServiceCreditLots(entries).get(grant.id)?.remaining ?? 0;
    if (amount > 0) {
      const account = await tx.serviceCreditAccount.update({
        where: { id: accountId },
        data: { availableCredits: { decrement: amount }, revision: { increment: 1 } },
        select: { availableCredits: true },
      });
      await tx.serviceCreditLedger.create({
        data: {
          ...scope,
          accountId,
          userId: reward.beneficiaryUserId,
          type: 'ADJUST',
          amount: -amount,
          balanceAfter: account.availableCredits,
          sourceType: 'REFERRAL',
          sourceId: `grant:${grant.id}`,
          idempotencyKey: `referral-revoke:${reward.id}`,
          createdAt: now,
        },
      });
    }
    await tx.serviceReferralReward.update({
      where: { id: reward.id },
      data: { status: 'REVOKED', revokedAt: now, revocationReason: reason.slice(0, 500) },
    });
  }
}
