import type {
  ServiceReferralRewardRuleRecord,
  ServiceReferralRewardRuleRepository,
} from '@bunshin/application';
import { type PrismaClient, prisma } from './client';

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
