import { createHash, randomUUID } from 'node:crypto';
import { FORTUNE_REFERRAL_PROFILE } from '@bunshin/capability-fortune';
import type { Prisma } from '@prisma/client';
import {
  fortuneReferralConditions,
  readFortuneReferralProgress,
} from './fortune-referral-evidence';
import { reverseConfirmedReferralRewards } from './service-referral-reward-reversal';

/** Runs after a verified refund while holding the service lock, in the payment transaction. */
export async function revokeFortuneReferralAfterRefund(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; groupId: string },
  purchase: { groupMembershipId: string; buyerUserId: string },
  providerEventId: string,
  checkedAt: Date,
) {
  const referral = await tx.serviceReferral.findFirst({
    where: {
      ...scope,
      referredMembershipId: purchase.groupMembershipId,
      referredUserId: purchase.buyerUserId,
      qualificationState: 'CONFIRMED',
      confirmedPolicy: { profileKey: FORTUNE_REFERRAL_PROFILE },
    },
    include: { confirmedPolicy: true },
  });
  if (!referral?.confirmedPolicy || !referral.confirmedAt) return;
  const { minimumPaidPurchases } = fortuneReferralConditions(referral.confirmedPolicy);
  if (minimumPaidPurchases === 0) return;
  const { paidPurchases } = await readFortuneReferralProgress(tx, scope, referral, checkedAt);
  if (paidPurchases >= minimumPaidPurchases) return;

  const reason = 'Stripeの返金により有効な購入件数が紹介条件を下回りました。';
  const revision = referral.qualificationRevision + 1;
  const now = new Date(Math.max(checkedAt.getTime(), referral.confirmedAt.getTime()));
  await tx.serviceReferral.update({
    where: { id: referral.id },
    data: { qualificationState: 'REVOKED', qualificationRevision: revision, revokedAt: now },
  });
  await tx.serviceReferralQualificationAudit.create({
    data: {
      ...scope,
      referralId: referral.id,
      commandId: randomUUID(),
      actorUserId: null,
      kind: 'PAYMENT_REVOKE',
      reason,
      beforeRevision: referral.qualificationRevision,
      fingerprint: createHash('sha256').update(providerEventId).digest('hex'),
      result: {
        before: { state: 'CONFIRMED', revision: referral.qualificationRevision },
        after: { state: 'REVOKED', revision, revokedAt: now.toISOString() },
      },
      occurredAt: now,
    },
  });
  await reverseConfirmedReferralRewards(tx, scope, referral.id, reason, now);
}
