import type { WeeklyPlan, WeeklyPlanRepository } from '@bunshin/capability-social';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

function weeklyPlan(row: Prisma.WeeklyPlanGetPayload<{ include: { items: true } }>): WeeklyPlan {
  return {
    ...row,
    weekStartDate: dateOnly(row.weekStartDate),
    status: row.status,
    items: row.items
      .map((item) => ({
        ...item,
        scheduledDate: dateOnly(item.scheduledDate),
        recommendedFormat: item.recommendedFormat,
      }))
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.id.localeCompare(b.id)),
  };
}

export class PrismaWeeklyPlanRepository implements WeeklyPlanRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private async authorized(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
    manage: boolean,
  ) {
    const value = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      include: {
        workspace: {
          select: {
            memberships: {
              where: { userId: input.actorUserId, status: 'ACTIVE' },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!value) return null;
    const role = value.workspace.memberships[0]?.role;
    return !manage || (role && canManageBunshin(role, input.actorUserId, value.ownerUserId))
      ? value
      : null;
  }
  private include = { items: true } as const;
  private async plan(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; weeklyPlanId: string },
  ) {
    return client.weeklyPlan.findFirst({
      where: { id: input.weeklyPlanId, workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      include: this.include,
    });
  }
  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ApplicationError('CONFLICT', 'weekly plan or date already exists', error);
    throw error;
  }
  async createPlan(input: Parameters<WeeklyPlanRepository['createPlan']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        return weeklyPlan(
          await tx.weeklyPlan.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              weekStartDate: new Date(`${input.weekStartDate}T00:00:00Z`),
              timezone: input.timezone,
              strategySummary: input.strategySummary ?? null,
            },
            include: this.include,
          }),
        );
      });
    } catch (error) {
      return this.conflict(error);
    }
  }
  async createGeneratedPlan(input: Parameters<WeeklyPlanRepository['createGeneratedPlan']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        const active = await tx.contentPillar.findMany({
          where: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            active: true,
            deletedAt: null,
            id: { in: input.items.map(({ contentPillarId }) => contentPillarId) },
          },
          select: { id: true },
        });
        if (
          new Set(active.map(({ id }) => id)).size !==
          new Set(input.items.map(({ contentPillarId }) => contentPillarId)).size
        )
          return null;
        const campaignIds = [
          ...new Set(input.items.flatMap(({ campaignId }) => (campaignId ? [campaignId] : []))),
        ];
        if (campaignIds.length > 0) {
          const campaigns = await tx.campaign.count({
            where: {
              id: { in: campaignIds },
              status: 'OPEN',
              startsAt: {
                lt: new Date(
                  Date.parse(`${input.weekStartDate}T00:00:00.000Z`) + 7 * 24 * 60 * 60 * 1000,
                ),
              },
              endsAt: { gt: new Date(`${input.weekStartDate}T00:00:00.000Z`) },
              group: {
                status: 'ACTIVE',
                memberships: {
                  some: {
                    userId: input.actorUserId,
                    status: 'ACTIVE',
                    consentedAt: { not: null },
                  },
                },
              },
              participations: {
                some: {
                  userId: input.actorUserId,
                  bunshinId: input.bunshinId,
                  participantWorkspaceId: input.workspaceId,
                  status: 'ACCEPTED',
                },
              },
              productPackVersion: {
                status: 'PUBLISHED',
                assignments: {
                  some: { bunshinId: input.bunshinId, status: 'ACTIVE' },
                },
              },
            },
          });
          if (campaigns !== campaignIds.length) return null;
        }
        const plan = await tx.weeklyPlan.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            weekStartDate: new Date(`${input.weekStartDate}T00:00:00Z`),
            timezone: input.timezone,
            strategySummary: input.strategySummary,
          },
        });
        await tx.weeklyPlanItem.createMany({
          data: input.items.map((item) => ({
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            weeklyPlanId: plan.id,
            scheduledDate: new Date(`${item.scheduledDate}T00:00:00Z`),
            contentPillarId: item.contentPillarId,
            goal: item.goal,
            angle: item.angle,
            recommendedFormat: item.recommendedFormat,
            notes: item.notes,
            campaignId: item.campaignId,
            classification: item.classification,
            businessContentCategory: item.businessContentCategory ?? null,
          })),
        });
        return weeklyPlan((await this.plan(tx, { ...input, weeklyPlanId: plan.id }))!);
      });
    } catch (error) {
      return this.conflict(error);
    }
  }
  async listPlans(input: Parameters<WeeklyPlanRepository['listPlans']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    return (
      await this.client.weeklyPlan.findMany({
        where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
        include: this.include,
        orderBy: [{ weekStartDate: 'desc' }, { id: 'desc' }],
      })
    ).map(weeklyPlan);
  }
  async findPlan(input: Parameters<WeeklyPlanRepository['findPlan']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const row = await this.plan(this.client, input);
    return row ? weeklyPlan(row) : null;
  }
  async updatePlan(input: Parameters<WeeklyPlanRepository['updatePlan']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const row = await this.plan(tx, input);
      if (!row) return null;
      if (row.status !== 'DRAFT')
        throw new ApplicationError('CONFLICT', 'only draft plan is editable');
      return weeklyPlan(
        await tx.weeklyPlan.update({
          where: { id: row.id },
          data: { strategySummary: input.strategySummary },
          include: this.include,
        }),
      );
    });
  }
  private async activePillar(
    tx: Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; contentPillarId: string },
  ) {
    return tx.contentPillar.findFirst({
      where: {
        id: input.contentPillarId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        active: true,
        deletedAt: null,
      },
      select: { id: true },
    });
  }
  private inWeek(plan: { weekStartDate: Date }, value: string) {
    const date = new Date(`${value}T00:00:00Z`);
    const difference = (date.valueOf() - plan.weekStartDate.valueOf()) / 86400000;
    if (!Number.isInteger(difference) || difference < 0 || difference > 6)
      throw new ApplicationError('VALIDATION_ERROR', 'scheduled date is outside plan week');
    return date;
  }
  async createItem(input: Parameters<WeeklyPlanRepository['createItem']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        const plan = await this.plan(tx, input);
        if (!plan) return null;
        if (plan.status !== 'DRAFT')
          throw new ApplicationError('CONFLICT', 'only draft plan is editable');
        if (!(await this.activePillar(tx, input)))
          throw new ApplicationError('NOT_FOUND', 'active content pillar not found');
        await tx.weeklyPlanItem.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            weeklyPlanId: plan.id,
            scheduledDate: this.inWeek(plan, input.scheduledDate),
            contentPillarId: input.contentPillarId,
            goal: input.goal,
            angle: input.angle,
            recommendedFormat: input.recommendedFormat,
            notes: input.notes ?? null,
          },
        });
        return weeklyPlan((await this.plan(tx, input))!);
      });
    } catch (error) {
      return this.conflict(error);
    }
  }
  async updateItem(input: Parameters<WeeklyPlanRepository['updateItem']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        const plan = await this.plan(tx, input);
        if (!plan) return null;
        if (plan.status !== 'DRAFT')
          throw new ApplicationError('CONFLICT', 'only draft plan is editable');
        const item = plan.items.find((value) => value.id === input.itemId);
        if (!item) return null;
        if (
          input.contentPillarId &&
          !(await this.activePillar(tx, { ...input, contentPillarId: input.contentPillarId }))
        )
          throw new ApplicationError('NOT_FOUND', 'active content pillar not found');
        await tx.weeklyPlanItem.update({
          where: { id: item.id },
          data: {
            ...(input.scheduledDate === undefined
              ? {}
              : { scheduledDate: this.inWeek(plan, input.scheduledDate) }),
            ...(input.contentPillarId === undefined
              ? {}
              : { contentPillarId: input.contentPillarId }),
            ...(input.goal === undefined ? {} : { goal: input.goal }),
            ...(input.angle === undefined ? {} : { angle: input.angle }),
            ...(input.recommendedFormat === undefined
              ? {}
              : { recommendedFormat: input.recommendedFormat }),
            ...(input.notes === undefined ? {} : { notes: input.notes }),
          },
        });
        return weeklyPlan((await this.plan(tx, input))!);
      });
    } catch (error) {
      return this.conflict(error);
    }
  }
  async removeItem(input: Parameters<WeeklyPlanRepository['removeItem']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const plan = await this.plan(tx, input);
      if (!plan) return null;
      if (plan.status !== 'DRAFT')
        throw new ApplicationError('CONFLICT', 'only draft plan is editable');
      const item = plan.items.find((value) => value.id === input.itemId);
      if (!item) return null;
      await tx.weeklyPlanItem.delete({ where: { id: item.id } });
      return weeklyPlan((await this.plan(tx, input))!);
    });
  }
  async confirmPlan(input: Parameters<WeeklyPlanRepository['confirmPlan']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const plan = await this.plan(tx, input);
      if (!plan) return null;
      if (plan.status === 'CONFIRMED') return weeklyPlan(plan);
      if (plan.status !== 'DRAFT')
        throw new ApplicationError('CONFLICT', 'expired plan cannot be confirmed');
      if (plan.items.length < 1) throw new ApplicationError('CONFLICT', 'plan requires an item');
      const active = await tx.contentPillar.count({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          id: { in: plan.items.map((item) => item.contentPillarId) },
          active: true,
          deletedAt: null,
        },
      });
      if (active !== new Set(plan.items.map((item) => item.contentPillarId)).size)
        throw new ApplicationError('CONFLICT', 'plan contains inactive pillar');
      return weeklyPlan(
        await tx.weeklyPlan.update({
          where: { id: plan.id },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
          include: this.include,
        }),
      );
    });
  }
  async expirePlan(input: Parameters<WeeklyPlanRepository['expirePlan']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const plan = await this.plan(tx, input);
      if (!plan) return null;
      if (plan.status === 'EXPIRED') return weeklyPlan(plan);
      return weeklyPlan(
        await tx.weeklyPlan.update({
          where: { id: plan.id },
          data: { status: 'EXPIRED', expiredAt: new Date() },
          include: this.include,
        }),
      );
    });
  }
}
