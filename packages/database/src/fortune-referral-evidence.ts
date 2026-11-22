import {
  projectServiceReferralRegistrationOrigin,
  type ReferralQualificationConditions,
} from '@bunshin/application';
import {
  evaluateFortuneReferralQualification,
  FORTUNE_REFERRAL_PROFILE,
  FORTUNE_REFERRAL_PROFILE_REVISION,
  normalizeFortuneReferralConditions,
} from '@bunshin/capability-fortune';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma, ServiceReferralQualificationPolicyVersion } from '@prisma/client';
import { isServiceUsageMemberPermitted } from './member-usage-authorization';

type Scope = { workspaceId: string; groupId: string };

export async function hasFortuneReferralProfile(tx: Prisma.TransactionClient, scope: Scope) {
  return Boolean(await tx.fortuneServiceSetting.findFirst({ where: scope, select: { id: true } }));
}

export function fortuneReferralConditions(row: ServiceReferralQualificationPolicyVersion) {
  if (
    row.profileKey !== FORTUNE_REFERRAL_PROFILE ||
    row.profileRevision !== FORTUNE_REFERRAL_PROFILE_REVISION ||
    !row.conditions ||
    typeof row.conditions !== 'object' ||
    Array.isArray(row.conditions)
  )
    throw new ApplicationError('CONFLICT', 'invalid fortune referral policy');
  return normalizeFortuneReferralConditions(row.conditions as ReferralQualificationConditions);
}

export async function readFortuneReferralProgress(
  tx: Prisma.TransactionClient,
  scope: Scope,
  referral: { referredMembershipId: string; referredUserId: string; registeredAt: Date | null },
  now: Date,
) {
  if (!referral.registeredAt) return { freeReadingDays: 0, paidPurchases: 0 };
  const [freeReadingDays, paidPurchases] = await Promise.all([
    tx.fortuneReading.count({
      where: {
        ...scope,
        memberUserId: referral.referredUserId,
        freeFirstViewedAt: { gte: referral.registeredAt, lte: now },
      },
    }),
    tx.fortuneCommercePurchase.count({
      where: {
        ...scope,
        groupMembershipId: referral.referredMembershipId,
        buyerUserId: referral.referredUserId,
        status: 'PAID',
        liveMode: true,
        paidAt: { gte: referral.registeredAt, lte: now },
        createdAt: { gte: referral.registeredAt },
        refundedAmountYen: 0,
        providerPaymentIntentId: { not: null },
      },
    }),
  ]);
  return { freeReadingDays, paidPurchases };
}

export async function decideFortuneReferral(
  tx: Prisma.TransactionClient,
  row: Prisma.ServiceReferralGetPayload<{
    include: { referralCode: { select: { groupMembershipId: true; userId: true; status: true } } };
  }>,
  policy: ServiceReferralQualificationPolicyVersion,
  now: Date,
): Promise<ReturnType<typeof evaluateFortuneReferralQualification>> {
  const scope = { workspaceId: row.workspaceId, groupId: row.groupId };
  const member = {
    workspaceId: row.workspaceId,
    serviceId: row.groupId,
    groupMembershipId: row.referredMembershipId,
    userId: row.referredUserId,
  };
  if (
    row.referralCode.status !== 'ACTIVE' ||
    !(await isServiceUsageMemberPermitted(tx, member, now)) ||
    !(await isServiceUsageMemberPermitted(
      tx,
      {
        ...member,
        groupMembershipId: row.referralCode.groupMembershipId,
        userId: row.referralCode.userId,
      },
      now,
    ))
  )
    return 'REJECTED';
  const enrollment = await tx.fortuneServiceSetting.findFirst({
    where: {
      ...scope,
      enabled: true,
      configuration: { visibility: 'PUBLIC', registration: { is: { referralEnabled: true } } },
    },
    select: { id: true },
  });
  if (!enrollment) return 'SUSPENDED';
  const audits = row.registeredAt
    ? await tx.groupMembershipAuditLog.findMany({
        where: {
          ...scope,
          groupMembershipId: member.groupMembershipId,
          performedByUserId: member.userId,
          occurredAt: row.registeredAt,
        },
        take: 2,
      })
    : [];
  return evaluateFortuneReferralQualification(
    {
      scope: member,
      ruleKey: policy.policyKey,
      version: policy.version,
      status: policy.status as 'ACTIVE' | 'SUSPENDED',
      timezone: policy.timezone,
      requireNewRegistration: true,
    },
    fortuneReferralConditions(policy),
    {
      scope: member,
      referralId: row.id,
      referrer: row.referralCode,
      referred: member,
      status: row.status,
      registeredAt: row.registeredAt,
      newRegistration: projectServiceReferralRegistrationOrigin(
        member,
        row.registeredAt,
        audits,
        true,
      ),
      uniqueAttribution: true,
      review: row.qualificationReview as 'UNKNOWN' | 'CLEAR' | 'REQUIRED',
      completeness: 'COMPLETE',
      ...(await readFortuneReferralProgress(tx, scope, row, now)),
    },
    now,
  );
}

export async function summarizeFortuneReferralProgress(tx: Prisma.TransactionClient, scope: Scope) {
  const [clicks, [registrations], totals] = await Promise.all([
    tx.serviceReferralClick.count({ where: scope }),
    tx.$queryRaw<{ registrations: bigint; freeReadingMembers: bigint; paidMembers: bigint }[]>`
      SELECT count(*) AS registrations,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM fortune_readings d
          WHERE d.workspace_id=r.workspace_id AND d.group_id=r.group_id
            AND d.member_user_id=r.referred_user_id AND d.free_first_viewed_at >= r.registered_at
        )) AS "freeReadingMembers",
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM fortune_commerce_purchases p
          WHERE p.workspace_id=r.workspace_id AND p.group_id=r.group_id
            AND p.group_membership_id=r.referred_membership_id AND p.buyer_user_id=r.referred_user_id
            AND p.paid_at >= r.registered_at AND p.created_at >= r.registered_at AND p.live_mode
            AND p.provider_payment_intent_id IS NOT NULL AND p.status='PAID' AND p.refunded_amount_yen=0
        )) AS "paidMembers"
      FROM service_referrals r WHERE r.workspace_id=${scope.workspaceId}::uuid AND r.group_id=${scope.groupId}::uuid
        AND r.registered_at IS NOT NULL AND r.status <> 'REJECTED'`,
    tx.serviceCreditLedger.groupBy({
      by: ['type'],
      where: { ...scope, OR: [{ type: 'GRANT', sourceType: 'REFERRAL' }, { type: 'CONSUME' }] },
      _sum: { amount: true },
    }),
  ]);
  return {
    clicks,
    registrations: Number(registrations?.registrations ?? 0),
    freeReadingMembers: Number(registrations?.freeReadingMembers ?? 0),
    paidMembers: Number(registrations?.paidMembers ?? 0),
    grantedCredits: totals.find((row) => row.type === 'GRANT')?._sum.amount ?? 0,
    consumedCredits: -(totals.find((row) => row.type === 'CONSUME')?._sum.amount ?? 0),
  };
}
