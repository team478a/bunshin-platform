import type {
  ActivityBadgeRule,
  ActivityContinuityRule,
  ActivityContinuityRuleRepository,
} from '@bunshin/application';
import { type Prisma, type PrismaClient, prisma } from './client';
function activityContinuityRule(
  row: Prisma.ActivityContinuityRuleGetPayload<object>,
): ActivityContinuityRule {
  return { ...row, badges: row.badgeRules as unknown as ActivityBadgeRule[] };
}

export class PrismaActivityContinuityRuleRepository implements ActivityContinuityRuleRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: Parameters<ActivityContinuityRuleRepository['list']>[0]) {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    return (
      await this.client.activityContinuityRule.findMany({
        where: { environment: input.environment },
        orderBy: { version: 'desc' },
      })
    ).map(activityContinuityRule);
  }

  async active(environment: Parameters<ActivityContinuityRuleRepository['active']>[0]) {
    const row = await this.client.activityContinuityRule.findFirst({
      where: { environment, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    return row ? activityContinuityRule(row) : null;
  }

  async create(input: Parameters<ActivityContinuityRuleRepository['create']>[0]) {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!admin) return null;
      const latest = await tx.activityContinuityRule.findFirst({
        where: { environment: input.environment },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const row = await tx.activityContinuityRule.create({
        data: {
          environment: input.environment,
          version: (latest?.version ?? 0) + 1,
          weeklyGoal: input.weeklyGoal,
          dormancyDays: input.dormancyDays,
          stepBuildingDays: input.stepBuildingDays,
          stepContinuingDays: input.stepContinuingDays,
          stepEstablishedDays: input.stepEstablishedDays,
          badgeRules: input.badges as unknown as Prisma.InputJsonValue,
          changeReason: input.changeReason,
          activationReason: null,
          createdByUserId: input.actorUserId,
        },
      });
      return activityContinuityRule(row);
    });
  }

  async activate(input: Parameters<ActivityContinuityRuleRepository['activate']>[0]) {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!admin) return null;
      const target = await tx.activityContinuityRule.findFirst({
        where: { id: input.ruleId, environment: input.environment, status: 'DRAFT' },
      });
      if (!target) return null;
      const now = new Date();
      await tx.activityContinuityRule.updateMany({
        where: { environment: input.environment, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED', supersededAt: now },
      });
      const row = await tx.activityContinuityRule.update({
        where: { id: target.id },
        data: {
          status: 'ACTIVE',
          activatedAt: now,
          activatedByUserId: input.actorUserId,
          activationReason: input.reason,
        },
      });
      return activityContinuityRule(row);
    });
  }
}
