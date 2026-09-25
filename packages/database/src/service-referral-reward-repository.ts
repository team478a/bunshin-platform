import type {
  ServiceReferralRewardGrant,
  ServiceReferralRewardRepository,
} from '@bunshin/application';
import { type PrismaClient, prisma } from './client';

export class PrismaServiceReferralRewardRepository implements ServiceReferralRewardRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async completeMilestone(
    input: Parameters<ServiceReferralRewardRepository['completeMilestone']>[0],
  ): Promise<ServiceReferralRewardGrant[]> {
    return this.client.$transaction(async (tx) => {
      const referredMembership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.referredUserId,
          status: 'ACTIVE',
          group: { status: 'ACTIVE' },
        },
        select: { id: true, userId: true },
      });
      if (referredMembership === null) return [];
      const referral = await tx.serviceReferral.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          referredMembershipId: referredMembership.id,
          status: { not: 'REJECTED' },
        },
        include: { referralCode: { select: { groupMembershipId: true, userId: true } } },
      });
      if (referral === null) return [];

      await tx.serviceReferral.update({
        where: { id: referral.id },
        data:
          input.milestone === 'ONBOARDING_COMPLETED'
            ? {
                status:
                  referral.firstPostReportedAt === null
                    ? 'ONBOARDING_COMPLETED'
                    : 'FIRST_POST_REPORTED',
                onboardingCompletedAt: referral.onboardingCompletedAt ?? input.now,
              }
            : {
                status: 'FIRST_POST_REPORTED',
                firstPostReportedAt: referral.firstPostReportedAt ?? input.now,
              },
      });

      const rules = await tx.serviceReferralRewardRule.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'ACTIVE',
          milestone: input.milestone,
        },
        orderBy: { createdAt: 'asc' },
      });
      const grants: ServiceReferralRewardGrant[] = [];
      const monthStart = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1));

      for (const rule of rules) {
        const beneficiary =
          rule.recipient === 'REFERRED'
            ? referredMembership
            : await tx.groupMembership.findFirst({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  id: referral.referralCode.groupMembershipId,
                  userId: referral.referralCode.userId,
                  status: 'ACTIVE',
                },
                select: { id: true, userId: true },
              });
        if (beneficiary === null) continue;
        if (rule.monthlyGrantLimit !== null) {
          const alreadyGranted = await tx.serviceReferralReward.count({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              ruleId: rule.id,
              beneficiaryMembershipId: beneficiary.id,
              status: 'GRANTED',
              grantedAt: { gte: monthStart },
            },
          });
          if (alreadyGranted >= rule.monthlyGrantLimit) continue;
        }

        const account = await tx.serviceCreditAccount.upsert({
          where: {
            workspaceId_groupId_groupMembershipId: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: beneficiary.id,
            },
          },
          create: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: beneficiary.id,
            userId: beneficiary.userId,
          },
          update: {},
          select: { id: true },
        });
        const reward = await tx.serviceReferralReward.createMany({
          data: [
            {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              referralId: referral.id,
              ruleId: rule.id,
              beneficiaryAccountId: account.id,
              beneficiaryUserId: beneficiary.userId,
              beneficiaryMembershipId: beneficiary.id,
              status: 'GRANTED',
              creditAmount: rule.creditAmount,
              grantedAt: input.now,
            },
          ],
          skipDuplicates: true,
        });
        if (reward.count === 0) continue;
        const updatedAccount = await tx.serviceCreditAccount.update({
          where: { id: account.id },
          data: { availableCredits: { increment: rule.creditAmount }, revision: { increment: 1 } },
          select: { availableCredits: true },
        });
        await tx.serviceCreditLedger.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            accountId: account.id,
            userId: beneficiary.userId,
            type: 'GRANT',
            amount: rule.creditAmount,
            balanceAfter: updatedAccount.availableCredits,
            sourceType: 'REFERRAL',
            sourceId: referral.id,
            idempotencyKey: `referral:${referral.id}:rule:${rule.id}:membership:${beneficiary.id}`,
            expiresAt:
              rule.expiresAfterDays === null
                ? null
                : new Date(input.now.getTime() + rule.expiresAfterDays * 24 * 60 * 60 * 1000),
          },
        });
        grants.push({
          ruleId: rule.id,
          beneficiaryMembershipId: beneficiary.id,
          creditAmount: rule.creditAmount,
        });
      }
      return grants;
    });
  }
}
