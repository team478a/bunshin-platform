import type {
  ServiceCreditAdjustmentRepository,
  ServiceCreditConsumptionRepository,
  ServiceCreditConsumptionResult,
  ServiceCreditExpirationRepository,
  ServiceReferralRewardGrant,
  ServiceReferralRewardRepository,
  ServiceReferralRewardRuleRecord,
  ServiceReferralRewardRuleRepository,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
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

/**
 * The account is optional so legacy services can keep their point or badge
 * entitlement flow. Once a member has a service credit account, a social
 * image request consumes exactly one credit under a request-specific key.
 */
export class PrismaServiceCreditConsumptionRepository implements ServiceCreditConsumptionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async consumeForSocialImage(
    input: Parameters<ServiceCreditConsumptionRepository['consumeForSocialImage']>[0],
  ): Promise<ServiceCreditConsumptionResult> {
    return this.client.$transaction(async (tx) => {
      const account = await tx.serviceCreditAccount.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          userId: input.userId,
        },
        select: { id: true, availableCredits: true },
      });
      if (account === null) return { status: 'NOT_CONFIGURED' };

      const existing = await tx.serviceCreditLedger.findUnique({
        where: {
          accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey },
        },
        select: { type: true, balanceAfter: true },
      });
      if (existing?.type === 'CONSUME')
        return { status: 'CONSUMED', availableCredits: existing.balanceAfter };
      if (existing !== null) throw new Error('service credit idempotency key conflict');

      const consumed = await tx.serviceCreditAccount.updateMany({
        where: {
          id: account.id,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          userId: input.userId,
          availableCredits: { gte: 1 },
        },
        data: { availableCredits: { decrement: 1 }, revision: { increment: 1 } },
      });
      if (consumed.count === 0) return { status: 'INSUFFICIENT' };
      const updated = await tx.serviceCreditAccount.findUniqueOrThrow({
        where: { id: account.id },
        select: { availableCredits: true },
      });
      await tx.serviceCreditLedger.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          accountId: account.id,
          userId: input.userId,
          type: 'CONSUME',
          amount: -1,
          balanceAfter: updated.availableCredits,
          sourceType: 'SYSTEM',
          sourceId: input.imageRequestId,
          idempotencyKey: input.idempotencyKey,
          expiresAt: null,
          createdAt: input.now,
        },
      });
      return { status: 'CONSUMED', availableCredits: updated.availableCredits };
    });
  }

  async refundSocialImage(
    input: Parameters<ServiceCreditConsumptionRepository['refundSocialImage']>[0],
  ): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const account = await tx.serviceCreditAccount.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          userId: input.userId,
        },
        select: { id: true },
      });
      if (account === null) return;
      const alreadyRefunded = await tx.serviceCreditLedger.findUnique({
        where: {
          accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey },
        },
        select: { id: true },
      });
      if (alreadyRefunded !== null) return;
      const sourceConsumption = await tx.serviceCreditLedger.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          accountId: account.id,
          userId: input.userId,
          type: 'CONSUME',
          sourceId: input.imageRequestId,
        },
        select: { id: true },
      });
      if (sourceConsumption === null) return;
      const updated = await tx.serviceCreditAccount.update({
        where: { id: account.id },
        data: { availableCredits: { increment: 1 }, revision: { increment: 1 } },
        select: { availableCredits: true },
      });
      await tx.serviceCreditLedger.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          accountId: account.id,
          userId: input.userId,
          type: 'REFUND',
          amount: 1,
          balanceAfter: updated.availableCredits,
          sourceType: 'SYSTEM',
          sourceId: input.imageRequestId,
          idempotencyKey: input.idempotencyKey,
          expiresAt: null,
          createdAt: input.now,
        },
      });
    });
  }
}

/** Expiry is derived from append-only entries so a spent grant is never expired twice. */
export class PrismaServiceCreditExpirationRepository implements ServiceCreditExpirationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async expire(input: Parameters<ServiceCreditExpirationRepository['expire']>[0]) {
    const accounts = await this.client.serviceCreditAccount.findMany({
      where: {
        ledgerEntries: { some: { type: 'GRANT', expiresAt: { lte: input.now } } },
      },
      select: { id: true, workspaceId: true, groupId: true, groupMembershipId: true, userId: true },
      take: input.limit,
    });
    let expired = 0;
    for (const account of accounts) {
      expired += await this.client.$transaction(
        async (tx) => {
          const entries = await tx.serviceCreditLedger.findMany({
            where: {
              accountId: account.id,
              workspaceId: account.workspaceId,
              groupId: account.groupId,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, type: true, amount: true, expiresAt: true, sourceId: true },
          });
          const lots = new Map<string, { remaining: number; expiresAt: Date | null }>();
          const consume = (amount: number) => {
            let remaining = amount;
            const candidates = [...lots.entries()]
              .filter(([, lot]) => lot.remaining > 0)
              .sort(([, left], [, right]) => {
                if (left.expiresAt === null) return right.expiresAt === null ? 0 : 1;
                if (right.expiresAt === null) return -1;
                return left.expiresAt.getTime() - right.expiresAt.getTime();
              });
            for (const [, lot] of candidates) {
              const used = Math.min(lot.remaining, remaining);
              lot.remaining -= used;
              remaining -= used;
              if (remaining === 0) break;
            }
          };
          for (const entry of entries) {
            if (entry.type === 'GRANT')
              lots.set(entry.id, { remaining: entry.amount, expiresAt: entry.expiresAt });
            else if (entry.type === 'CONSUME' || (entry.type === 'ADJUST' && entry.amount < 0))
              consume(-entry.amount);
            else if (entry.type === 'REFUND' || (entry.type === 'ADJUST' && entry.amount > 0))
              lots.set(entry.id, { remaining: entry.amount, expiresAt: null });
            else if (entry.type === 'EXPIRE' && entry.sourceId?.startsWith('grant:')) {
              const grant = lots.get(entry.sourceId.slice('grant:'.length));
              if (grant) grant.remaining = Math.max(0, grant.remaining + entry.amount);
            }
          }
          const expiredLots = [...lots.entries()].filter(
            ([, lot]) => lot.remaining > 0 && lot.expiresAt !== null && lot.expiresAt <= input.now,
          );
          const amount = expiredLots.reduce((sum, [, lot]) => sum + lot.remaining, 0);
          if (amount === 0) return 0;
          const updated = await tx.serviceCreditAccount.update({
            where: { id: account.id },
            data: { availableCredits: { decrement: amount }, revision: { increment: 1 } },
            select: { availableCredits: true },
          });
          for (const [grantId, lot] of expiredLots) {
            await tx.serviceCreditLedger.create({
              data: {
                workspaceId: account.workspaceId,
                groupId: account.groupId,
                accountId: account.id,
                userId: account.userId,
                type: 'EXPIRE',
                amount: -lot.remaining,
                balanceAfter: updated.availableCredits,
                sourceType: 'SYSTEM',
                sourceId: `grant:${grantId}`,
                idempotencyKey: `expire:grant:${grantId}`,
                expiresAt: null,
                createdAt: input.now,
              },
            });
          }
          return amount;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }
    return expired;
  }
}

export class PrismaServiceCreditAdjustmentRepository implements ServiceCreditAdjustmentRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async adjust(input: Parameters<ServiceCreditAdjustmentRepository['adjust']>[0]) {
    return this.client.$transaction(async (tx) => {
      const actor = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
        },
        select: { id: true },
      });
      const member = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          id: input.membershipId,
          status: 'ACTIVE',
          serviceRole: 'PARTICIPANT',
        },
        select: { id: true, userId: true },
      });
      if (!actor || !member) return null;
      let account = await tx.serviceCreditAccount.findUnique({
        where: {
          workspaceId_groupId_groupMembershipId: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: member.id,
          },
        },
        select: { id: true, availableCredits: true },
      });
      if (!account && input.amount < 0) return null;
      if (!account) {
        account = await tx.serviceCreditAccount.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: member.id,
            userId: member.userId,
          },
          select: { id: true, availableCredits: true },
        });
      }
      if (account.availableCredits + input.amount < 0) return null;
      const existing = await tx.serviceCreditLedger.findUnique({
        where: {
          accountId_idempotencyKey: { accountId: account.id, idempotencyKey: input.idempotencyKey },
        },
        select: { balanceAfter: true },
      });
      if (existing) return { availableCredits: existing.balanceAfter };
      const updated = await tx.serviceCreditAccount.update({
        where: { id: account.id },
        data: { availableCredits: { increment: input.amount }, revision: { increment: 1 } },
        select: { availableCredits: true },
      });
      await tx.serviceCreditLedger.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          accountId: account.id,
          userId: member.userId,
          type: 'ADJUST',
          amount: input.amount,
          balanceAfter: updated.availableCredits,
          sourceType: 'ADMIN',
          sourceId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          expiresAt: null,
          createdAt: input.now,
        },
      });
      const configuration = await tx.serviceConfiguration.findFirst({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        select: { id: true },
      });
      if (configuration)
        await tx.serviceConfigurationAudit.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            configurationId: configuration.id,
            action: 'SERVICE_CREDIT_ADJUSTED',
            beforeData: { availableCredits: account.availableCredits },
            afterData: {
              membershipId: member.id,
              amount: input.amount,
              availableCredits: updated.availableCredits,
            },
            reason: input.reason,
            performedByUserId: input.actorUserId,
            occurredAt: input.now,
          },
        });
      return updated;
    });
  }
}

export class PrismaServiceReferralRewardRuleRepository implements ServiceReferralRewardRuleRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listCurrent(input: { workspaceId: string; groupId: string }) {
    const rows = await this.client.serviceReferralRewardRule.findMany({
      where: { workspaceId: input.workspaceId, groupId: input.groupId },
      orderBy: [{ ruleKey: 'asc' }, { version: 'desc' }],
    });
    const current = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!current.has(row.ruleKey)) current.set(row.ruleKey, row);
    }
    return [...current.values()].map((row) => ({
      id: row.id,
      ruleKey: row.ruleKey,
      version: row.version,
      status: row.status as ServiceReferralRewardRuleRecord['status'],
      milestone: row.milestone,
      recipient: row.recipient,
      creditAmount: row.creditAmount,
      expiresAfterDays: row.expiresAfterDays,
      monthlyGrantLimit: row.monthlyGrantLimit,
      createdAt: row.createdAt,
    }));
  }

  async saveVersion(
    input: Parameters<ServiceReferralRewardRuleRepository['saveVersion']>[0],
  ): Promise<ServiceReferralRewardRuleRecord> {
    return this.client.$transaction(async (tx) => {
      const latest = await tx.serviceReferralRewardRule.aggregate({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ruleKey: input.rule.ruleKey,
        },
        _max: { version: true },
      });
      await tx.serviceReferralRewardRule.updateMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ruleKey: input.rule.ruleKey,
          status: { in: ['DRAFT', 'ACTIVE', 'SUSPENDED'] },
        },
        data: { status: 'SUPERSEDED', supersededAt: input.now },
      });
      const created = await tx.serviceReferralRewardRule.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ruleKey: input.rule.ruleKey,
          version: (latest._max.version ?? 0) + 1,
          status: input.status,
          milestone: input.rule.milestone,
          recipient: input.rule.recipient,
          creditAmount: input.rule.creditAmount,
          expiresAfterDays: input.rule.expiresAfterDays ?? null,
          monthlyGrantLimit: input.rule.monthlyGrantLimit ?? null,
          createdByUserId: input.actorUserId,
        },
      });
      return {
        id: created.id,
        ruleKey: created.ruleKey,
        version: created.version,
        status: created.status as ServiceReferralRewardRuleRecord['status'],
        milestone: created.milestone,
        recipient: created.recipient,
        creditAmount: created.creditAmount,
        expiresAfterDays: created.expiresAfterDays,
        monthlyGrantLimit: created.monthlyGrantLimit,
        createdAt: created.createdAt,
      };
    });
  }
}
