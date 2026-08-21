import { Prisma, PrismaClient } from '@prisma/client';
import type {
  AccountTransaction,
  AccountUnitOfWork,
  BunshinRepository,
  CreateBunshinInput,
  CreateUserInput,
  PlatformAdminRepository,
  ScopedBunshinReference,
  UpdateBunshinInput,
  WorkspaceAccessRepository,
  OwnerKnowledgeRepository,
  KnowledgeGrantRepository,
  BunshinMemoryRepository,
  BunshinCapabilityAssignmentRepository,
  BunshinCapabilityAssignment,
} from '@bunshin/application';
import type { CurrentUser, CurrentUserAccountRepository, VerifiedSessionUser } from '@bunshin/auth';
import {
  parsePreferredFormats,
  type ContentPillar,
  type ContentPillarRepository,
  type WeeklyPlan,
  type WeeklyPlanRepository,
  type DailyMission,
  type DailyMissionRepository,
  type DailyMissionStatus,
  type MissionDecision,
  type MissionActivity,
  type MissionEngagementRepository,
  type PostRecord,
  type MissionFeedback,
  type MissionOutcomeRepository,
  type SocialProfile,
  type SocialProfileRepository,
  type SocialAccountStrategy,
  type SocialAccountStrategyRepository,
} from '@bunshin/capability-social';
import type {
  BunshinAggregate,
  PlatformAdmin,
  User,
  Workspace,
  WorkspaceMembership,
  OwnerKnowledge,
  BunshinKnowledgeGrant,
  BunshinMemory,
} from '@bunshin/platform-domain';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

const globalPrisma = globalThis as unknown as { bunshinPrisma?: PrismaClient };
export const prisma = globalPrisma.bunshinPrisma ?? new PrismaClient({ log: ['warn', 'error'] });
if (process.env['NODE_ENV'] !== 'production') globalPrisma.bunshinPrisma = prisma;

function user(row: Awaited<ReturnType<PrismaClient['user']['create']>>): User {
  return { ...row, email: row.email, status: row.status };
}

function contentPillar(row: Prisma.ContentPillarGetPayload<object>): ContentPillar {
  return row;
}

export class PrismaContentPillarRepository implements ContentPillarRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async accessible(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
  ) {
    return client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }

  private async managed(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
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
    const role = bunshin?.workspace.memberships[0]?.role;
    return bunshin !== null &&
      role !== undefined &&
      canManageBunshin(role, input.actorUserId, bunshin.ownerUserId)
      ? bunshin
      : null;
  }

  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApplicationError('CONFLICT', 'content pillar title already exists', error);
    }
    throw error;
  }

  async create(input: Parameters<ContentPillarRepository['create']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if ((await this.managed(tx, input)) === null) return null;
        return contentPillar(
          await tx.contentPillar.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              title: input.title,
              description: input.description ?? null,
              weight: input.weight,
            },
          }),
        );
      });
    } catch (error) {
      return this.conflict(error);
    }
  }

  async list(input: Parameters<ContentPillarRepository['list']>[0]) {
    if ((await this.accessible(this.client, input)) === null) return null;
    const rows = await this.client.contentPillar.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(contentPillar);
  }

  async find(input: Parameters<ContentPillarRepository['find']>[0]) {
    if ((await this.accessible(this.client, input)) === null) return null;
    const row = await this.client.contentPillar.findFirst({
      where: {
        id: input.pillarId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        deletedAt: null,
      },
    });
    return row === null ? null : contentPillar(row);
  }

  async update(input: Parameters<ContentPillarRepository['update']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if ((await this.managed(tx, input)) === null) return null;
        const row = await tx.contentPillar.findFirst({
          where: {
            id: input.pillarId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            deletedAt: null,
          },
        });
        if (row === null) return null;
        return contentPillar(
          await tx.contentPillar.update({
            where: { id: row.id },
            data: {
              ...(input.title === undefined ? {} : { title: input.title }),
              ...(input.description === undefined ? {} : { description: input.description }),
              ...(input.weight === undefined ? {} : { weight: input.weight }),
            },
          }),
        );
      });
    } catch (error) {
      return this.conflict(error);
    }
  }

  async setActive(input: Parameters<ContentPillarRepository['setActive']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.contentPillar.findFirst({
        where: {
          id: input.pillarId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          deletedAt: null,
        },
      });
      if (row === null) return null;
      if (row.active === input.active) return contentPillar(row);
      return contentPillar(
        await tx.contentPillar.update({ where: { id: row.id }, data: { active: input.active } }),
      );
    });
  }

  async softDelete(input: Parameters<ContentPillarRepository['softDelete']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.contentPillar.findFirst({
        where: { id: input.pillarId, workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      });
      if (row === null) return null;
      if (row.deletedAt !== null) return contentPillar(row);
      return contentPillar(
        await tx.contentPillar.update({
          where: { id: row.id },
          data: { active: false, deletedAt: new Date() },
        }),
      );
    });
  }
}

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
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
    manage: boolean,
  ) {
    const value = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
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

const missionDate = (value: Date) => value.toISOString().slice(0, 10);
type MissionRow = Prisma.DailyMissionGetPayload<{ include: { content: true } }>;
function dailyMission(row: MissionRow): DailyMission {
  if (!row.content) throw new ApplicationError('INTERNAL_ERROR', 'mission content missing');
  return {
    ...row,
    missionDate: missionDate(row.missionDate),
    status: row.status,
    format: row.format,
    content: row.content.contentJson as Record<string, unknown>,
  };
}
export class PrismaDailyMissionRepository implements DailyMissionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private include = { content: true } as const;
  private async authorized(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
    manage: boolean,
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
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
    if (!bunshin) return null;
    const role = bunshin.workspace.memberships[0]?.role;
    return !manage || (role && canManageBunshin(role, input.actorUserId, bunshin.ownerUserId))
      ? bunshin
      : null;
  }
  private async row(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; dailyMissionId: string },
  ) {
    return client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
      include: this.include,
    });
  }
  async create(input: Parameters<DailyMissionRepository['create']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        if (
          input.socialProfileId &&
          !(await tx.socialProfile.findFirst({
            where: {
              id: input.socialProfileId,
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
            },
          }))
        )
          return null;
        if (
          input.weeklyPlanItemId &&
          !(await tx.weeklyPlanItem.findFirst({
            where: {
              id: input.weeklyPlanItemId,
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
            },
          }))
        )
          return null;
        const created = await tx.dailyMission.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            socialProfileId: input.socialProfileId ?? null,
            weeklyPlanItemId: input.weeklyPlanItemId ?? null,
            missionDate: new Date(`${input.missionDate}T00:00:00Z`),
            format: input.format,
            estimatedMinutes: input.estimatedMinutes,
            topic: input.topic,
            angle: input.angle,
            reason: input.reason,
            qualityScore: input.qualityScore ?? null,
          },
        });
        await tx.missionContent.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: created.id,
            format: input.format,
            contentJson: input.content as Prisma.InputJsonValue,
          },
        });
        await tx.missionDecision.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: created.id,
          },
        });
        return dailyMission((await this.row(tx, { ...input, dailyMissionId: created.id }))!);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'daily mission already exists', error);
      throw error;
    }
  }
  async list(input: Parameters<DailyMissionRepository['list']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    return (
      await this.client.dailyMission.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          ...(input.from || input.to
            ? {
                missionDate: {
                  ...(input.from ? { gte: new Date(`${input.from}T00:00:00Z`) } : {}),
                  ...(input.to ? { lte: new Date(`${input.to}T00:00:00Z`) } : {}),
                },
              }
            : {}),
        },
        include: this.include,
        orderBy: [{ missionDate: 'desc' }, { id: 'desc' }],
      })
    ).map(dailyMission);
  }
  async find(input: Parameters<DailyMissionRepository['find']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const value = await this.row(this.client, input);
    return value ? dailyMission(value) : null;
  }
  async transition(input: Parameters<DailyMissionRepository['transition']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const row = await this.row(tx, input);
      if (!row) return null;
      if (row.status === input.status) return dailyMission(row);
      const allowed: Record<DailyMissionStatus, DailyMissionStatus[]> = {
        GENERATED: ['VIEWED', 'STARTED', 'COMPLETED', 'SKIPPED', 'EXPIRED'],
        VIEWED: ['STARTED', 'COMPLETED', 'SKIPPED', 'EXPIRED'],
        STARTED: ['COMPLETED', 'SKIPPED', 'EXPIRED'],
        COMPLETED: [],
        SKIPPED: [],
        EXPIRED: [],
      };
      if (!allowed[row.status].includes(input.status))
        throw new ApplicationError('CONFLICT', 'invalid mission transition');
      const now = new Date();
      return dailyMission(
        await tx.dailyMission.update({
          where: { id: row.id },
          data: {
            status: input.status,
            ...(input.status === 'VIEWED' ? { viewedAt: now } : {}),
            ...(input.status === 'STARTED' ? { startedAt: now } : {}),
            ...(input.status === 'COMPLETED' ? { completedAt: now } : {}),
            ...(input.status === 'SKIPPED' ? { skippedAt: now } : {}),
            ...(input.status === 'EXPIRED' ? { expiredAt: now } : {}),
          },
          include: this.include,
        }),
      );
    });
  }
}

export class PrismaDailyMissionGenerationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async claim(input: {
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    missionDate: string;
    idempotencyKey: string;
  }) {
    const authorized = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
    if (!authorized) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    const missionDate = new Date(`${input.missionDate}T00:00:00.000Z`);
    try {
      return {
        record: await this.client.dailyMissionGeneration.create({
          data: { ...input, missionDate, status: 'PENDING' },
        }),
        acquired: true,
      };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.client.dailyMissionGeneration.findFirst({
        where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId, missionDate },
      });
      if (!existing) throw error;
      if (existing.actorUserId !== input.actorUserId)
        throw new ApplicationError('CONFLICT', 'daily mission generation already claimed');
      if (existing.status === 'FAILED') {
        return {
          record: await this.client.dailyMissionGeneration.update({
            where: { id: existing.id },
            data: { status: 'PENDING', idempotencyKey: input.idempotencyKey, errorCategory: null },
          }),
          acquired: true,
        };
      }
      if (existing.idempotencyKey !== input.idempotencyKey)
        throw new ApplicationError('CONFLICT', 'daily mission generation already claimed');
      return { record: existing, acquired: false };
    }
  }

  async complete(input: {
    id: string;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    dailyMissionId: string;
  }) {
    const result = await this.client.dailyMissionGeneration.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
      },
      data: { status: 'COMPLETED', dailyMissionId: input.dailyMissionId, errorCategory: null },
    });
    if (result.count !== 1) throw new ApplicationError('NOT_FOUND', 'generation not found');
  }

  async fail(input: {
    id: string;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    errorCategory: string;
  }) {
    const result = await this.client.dailyMissionGeneration.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
      },
      data: { status: 'FAILED', errorCategory: input.errorCategory },
    });
    if (result.count !== 1) throw new ApplicationError('NOT_FOUND', 'generation not found');
  }
}

function missionDecision(row: Prisma.MissionDecisionGetPayload<object>): MissionDecision {
  return row;
}
function missionActivity(row: Prisma.MissionActivityGetPayload<object>): MissionActivity {
  return {
    ...row,
    metadata: row.metadata as Record<string, unknown> | null,
  };
}
export class PrismaMissionEngagementRepository implements MissionEngagementRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private async authorized(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
    manage: boolean,
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
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
    if (!bunshin) return null;
    const role = bunshin.workspace.memberships[0]?.role;
    return !manage || (role && canManageBunshin(role, input.actorUserId, bunshin.ownerUserId))
      ? bunshin
      : null;
  }
  private mission(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; dailyMissionId: string },
  ) {
    return client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
    });
  }
  private existingActivity(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      bunshinId: string;
      actorUserId: string;
      idempotencyKey: string;
    },
  ) {
    return client.missionActivity.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }
  private assertSameEvent(
    value: Prisma.MissionActivityGetPayload<object>,
    input: { dailyMissionId: string; type: string; metadata?: Record<string, unknown> | null },
  ) {
    const metadata = (value.metadata ?? null) as Record<string, unknown> | null;
    if (
      value.dailyMissionId !== input.dailyMissionId ||
      value.type !== input.type ||
      JSON.stringify(metadata) !== JSON.stringify(input.metadata ?? null)
    )
      throw new ApplicationError('CONFLICT', 'idempotency key was already used');
    return missionActivity(value);
  }
  async getDecision(input: Parameters<MissionEngagementRepository['getDecision']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const value = await this.client.missionDecision.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
      },
    });
    return value ? missionDecision(value) : null;
  }
  async decide(input: Parameters<MissionEngagementRepository['decide']>[0]) {
    const type = input.decision;
    const operation = async () =>
      this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        if (!(await this.mission(tx, input))) return null;
        const existing = await this.existingActivity(tx, input);
        if (existing) {
          const activity = this.assertSameEvent(existing, { ...input, type, metadata: null });
          const decision = await tx.missionDecision.findUniqueOrThrow({
            where: { dailyMissionId: input.dailyMissionId },
          });
          return { decision: missionDecision(decision), activity };
        }
        const now = new Date();
        const decision = await tx.missionDecision.update({
          where: { dailyMissionId: input.dailyMissionId },
          data: {
            decision: input.decision,
            rejectionReason: input.rejectionReason,
            rejectionDetail: input.rejectionDetail,
            decidedAt: now,
          },
        });
        const activity = await tx.missionActivity.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
            actorUserId: input.actorUserId,
            type,
            occurredAt: now,
            idempotencyKey: input.idempotencyKey,
            metadata: Prisma.JsonNull,
          },
        });
        return { decision: missionDecision(decision), activity: missionActivity(activity) };
      });
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.existingActivity(this.client, input);
      if (!existing) throw error;
      const activity = this.assertSameEvent(existing, { ...input, type, metadata: null });
      const decision = await this.client.missionDecision.findUniqueOrThrow({
        where: { dailyMissionId: input.dailyMissionId },
      });
      return { decision: missionDecision(decision), activity };
    }
  }
  async listActivities(input: Parameters<MissionEngagementRepository['listActivities']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    if (!(await this.mission(this.client, input))) return null;
    return (
      await this.client.missionActivity.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
        },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      })
    ).map(missionActivity);
  }
  async appendActivity(input: Parameters<MissionEngagementRepository['appendActivity']>[0]) {
    const operation = async () =>
      this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        if (!(await this.mission(tx, input))) return null;
        const existing = await this.existingActivity(tx, input);
        if (existing) return this.assertSameEvent(existing, input);
        return missionActivity(
          await tx.missionActivity.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              dailyMissionId: input.dailyMissionId,
              actorUserId: input.actorUserId,
              type: input.type,
              idempotencyKey: input.idempotencyKey,
              metadata:
                input.metadata === null
                  ? Prisma.JsonNull
                  : (input.metadata as Prisma.InputJsonValue),
            },
          }),
        );
      });
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.existingActivity(this.client, input);
      if (!existing) throw error;
      return this.assertSameEvent(existing, input);
    }
  }
}

function postRecord(row: Prisma.PostRecordGetPayload<object>): PostRecord {
  return { ...row, manualMetrics: row.manualMetrics as Record<string, unknown> | null };
}
function missionFeedback(row: Prisma.MissionFeedbackGetPayload<object>): MissionFeedback {
  return row;
}
export class PrismaMissionOutcomeRepository implements MissionOutcomeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private async authorized(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
    manage: boolean,
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
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
    if (!bunshin) return null;
    const role = bunshin.workspace.memberships[0]?.role;
    return !manage || (role && canManageBunshin(role, input.actorUserId, bunshin.ownerUserId))
      ? bunshin
      : null;
  }
  private mission(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; dailyMissionId: string },
  ) {
    return client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
      include: { decision: true, socialProfile: { select: { platform: true } } },
    });
  }
  private activityByKey(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; actorUserId: string; idempotencyKey: string },
  ) {
    return client.missionActivity.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }
  async getPost(input: Parameters<MissionOutcomeRepository['getPost']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const value = await this.client.postRecord.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
      },
    });
    return value ? postRecord(value) : null;
  }
  async recordPost(input: Parameters<MissionOutcomeRepository['recordPost']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const mission = await this.mission(tx, input);
      if (!mission) return null;
      if (mission.decision?.decision !== 'ACCEPTED')
        throw new ApplicationError('CONFLICT', 'mission must be accepted before posting');
      if (mission.socialProfile && mission.socialProfile.platform !== input.platform)
        throw new ApplicationError('VALIDATION_ERROR', 'platform does not match mission profile');
      const existing = await tx.postRecord.findUnique({
        where: { dailyMissionId: input.dailyMissionId },
      });
      if (existing) {
        if (existing.platform !== input.platform || existing.postUrl !== input.postUrl)
          throw new ApplicationError('CONFLICT', 'post record already exists');
        const activity = await tx.missionActivity.findFirstOrThrow({
          where: { dailyMissionId: input.dailyMissionId, type: 'POSTED' },
          orderBy: { occurredAt: 'asc' },
        });
        return { post: postRecord(existing), activity: missionActivity(activity) };
      }
      const collision = await this.activityByKey(tx, input);
      if (collision) throw new ApplicationError('CONFLICT', 'idempotency key was already used');
      const post = await tx.postRecord.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          platform: input.platform,
          postedAt: input.postedAt,
          postUrl: input.postUrl,
          externalPostId: null,
          source: 'MANUAL',
          manualMetrics: Prisma.JsonNull,
          idempotencyKey: input.idempotencyKey,
        },
      });
      const activity = await tx.missionActivity.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          type: 'POSTED',
          occurredAt: input.postedAt,
          idempotencyKey: input.idempotencyKey,
          metadata: Prisma.JsonNull,
        },
      });
      return { post: postRecord(post), activity: missionActivity(activity) };
    });
  }
  async getFeedback(input: Parameters<MissionOutcomeRepository['getFeedback']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const value = await this.client.missionFeedback.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
      },
    });
    return value ? missionFeedback(value) : null;
  }
  async recordFeedback(input: Parameters<MissionOutcomeRepository['recordFeedback']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      if (
        !(await tx.postRecord.findFirst({
          where: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
          },
        }))
      )
        return null;
      const type = `FEEDBACK_${input.rating}` as const;
      const existingActivity = await this.activityByKey(tx, input);
      if (existingActivity) {
        if (
          existingActivity.dailyMissionId !== input.dailyMissionId ||
          existingActivity.type !== type
        )
          throw new ApplicationError('CONFLICT', 'idempotency key was already used');
        const feedback = await tx.missionFeedback.findUniqueOrThrow({
          where: { dailyMissionId: input.dailyMissionId },
        });
        return { feedback: missionFeedback(feedback), activity: missionActivity(existingActivity) };
      }
      const feedback = await tx.missionFeedback.upsert({
        where: { dailyMissionId: input.dailyMissionId },
        create: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          rating: input.rating,
        },
        update: { actorUserId: input.actorUserId, rating: input.rating },
      });
      const activity = await tx.missionActivity.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          dailyMissionId: input.dailyMissionId,
          actorUserId: input.actorUserId,
          type,
          idempotencyKey: input.idempotencyKey,
          metadata: Prisma.JsonNull,
        },
      });
      return { feedback: missionFeedback(feedback), activity: missionActivity(activity) };
    });
  }
}

function workspace(row: Awaited<ReturnType<PrismaClient['workspace']['create']>>): Workspace {
  return { ...row, type: row.type, status: row.status };
}

function membership(
  row: Awaited<ReturnType<PrismaClient['workspaceMembership']['create']>>,
): WorkspaceMembership {
  return { ...row, role: row.role, status: row.status };
}

export class PrismaAccountUnitOfWork implements AccountUnitOfWork {
  constructor(private readonly client: PrismaClient = prisma) {}

  transaction<T>(operation: (transaction: AccountTransaction) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      const adapter: AccountTransaction = {
        createUser: async (input: CreateUserInput) =>
          user(
            await tx.user.create({
              data: { displayName: input.displayName, email: input.email ?? null },
            }),
          ),
        createAuthIdentity: async (input) => {
          await tx.authIdentity.create({ data: input });
        },
        createPersonalWorkspace: async (input) =>
          workspace(await tx.workspace.create({ data: { type: 'PERSONAL', name: input.name } })),
        createOwnerMembership: async (input) =>
          membership(await tx.workspaceMembership.create({ data: { ...input, role: 'OWNER' } })),
      };
      return operation(adapter);
    });
  }
}

export class PrismaCurrentUserAccountRepository implements CurrentUserAccountRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findActiveByEmailIdentity(providerUserId: string): Promise<CurrentUser | null> {
    const identity = await this.client.authIdentity.findFirst({
      where: { provider: 'EMAIL', providerUserId, user: { status: 'ACTIVE' } },
      select: { id: true, userId: true },
    });
    return identity === null ? null : { userId: identity.userId, authIdentityId: identity.id };
  }

  async provisionEmailIdentity(input: VerifiedSessionUser): Promise<CurrentUser> {
    const existing = await this.findActiveByEmailIdentity(input.providerUserId);
    if (existing !== null) return existing;
    try {
      return await this.client.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            displayName: (input.displayName ?? input.email?.split('@')[0] ?? 'BUNSHIN User').slice(
              0,
              100,
            ),
            email: input.email,
          },
        });
        const identity = await tx.authIdentity.create({
          data: {
            userId: createdUser.id,
            provider: 'EMAIL',
            providerUserId: input.providerUserId,
          },
        });
        const workspace = await tx.workspace.create({
          data: { type: 'PERSONAL', name: `${createdUser.displayName}のワークスペース` },
        });
        await tx.workspaceMembership.create({
          data: { workspaceId: workspace.id, userId: createdUser.id, role: 'OWNER' },
        });
        return { userId: createdUser.id, authIdentityId: identity.id };
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const raced = await this.findActiveByEmailIdentity(input.providerUserId);
        if (raced !== null) return raced;
      }
      throw error;
    }
  }
}

export async function listActiveWorkspacesForUser(
  userId: string,
  client: PrismaClient = prisma,
): Promise<Array<{ id: string; name: string }>> {
  return client.workspace.findMany({
    where: {
      status: 'ACTIVE',
      memberships: { some: { userId, status: 'ACTIVE' } },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
}

export class PrismaWorkspaceAccessRepository implements WorkspaceAccessRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findAccessibleWorkspace(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<Workspace | null> {
    const row = await this.client.workspace.findFirst({
      where: {
        id: input.workspaceId,
        status: 'ACTIVE',
        memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
      },
    });
    return row === null ? null : workspace(row);
  }

  async updateWorkspaceName(input: {
    actorUserId: string;
    workspaceId: string;
    name: string;
  }): Promise<Workspace | null> {
    const authorized = await this.client.workspace.findFirst({
      where: {
        id: input.workspaceId,
        memberships: {
          some: { userId: input.actorUserId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
        },
      },
      select: { id: true },
    });
    if (authorized === null) return null;
    return workspace(
      await this.client.workspace.update({
        where: { id: authorized.id },
        data: { name: input.name },
      }),
    );
  }
}

export class PrismaPlatformAdminRepository implements PlatformAdminRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async findActivePlatformAdminByUserId(userId: string): Promise<PlatformAdmin | null> {
    const row = await this.client.platformAdmin.findFirst({ where: { userId, status: 'ACTIVE' } });
    return row === null ? null : { ...row, role: row.role, status: row.status };
  }
}

const bunshinRelations = {
  objectives: { orderBy: { priority: 'asc' as const } },
  audiences: { orderBy: { createdAt: 'asc' as const } },
  personality: true,
} satisfies Prisma.BunshinInclude;

type BunshinRow = Prisma.BunshinGetPayload<{ include: typeof bunshinRelations }>;

function stringArray(value: Prisma.JsonValue, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new ApplicationError('DATABASE_UNAVAILABLE', `${field} contains invalid persisted data`);
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new ApplicationError(
        'DATABASE_UNAVAILABLE',
        `${field} contains invalid persisted data`,
      );
    }
    result.push(item);
  }
  return result;
}

function bunshinAggregate(row: BunshinRow): BunshinAggregate {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    ownerUserId: row.ownerUserId,
    name: row.name,
    slug: row.slug,
    type: row.type,
    status: row.status,
    objectiveSummary: row.objectiveSummary,
    audienceSummary: row.audienceSummary,
    personalitySummary: row.personalitySummary,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    objectives: row.objectives.map((item) => ({ ...item, status: item.status })),
    audiences: row.audiences.map((item) => ({
      ...item,
      painPoints: stringArray(item.painPoints, 'painPoints'),
      desires: stringArray(item.desires, 'desires'),
      excludedAudience: stringArray(item.excludedAudience, 'excludedAudience'),
    })),
    personality:
      row.personality === null
        ? null
        : {
            ...row.personality,
            forbiddenExpressions: stringArray(
              row.personality.forbiddenExpressions,
              'forbiddenExpressions',
            ),
            preferredExpressions: stringArray(
              row.personality.preferredExpressions,
              'preferredExpressions',
            ),
            facePolicy: row.personality.facePolicy,
          },
  };
}

export class PrismaBunshinRepository implements BunshinRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async create(input: CreateBunshinInput & { slug: string }): Promise<BunshinAggregate> {
    return this.client.$transaction(async (tx) => {
      const ownerUserId = input.ownerUserId ?? input.actorUserId;
      const [actorMembership, ownerMembership] = await Promise.all([
        tx.workspaceMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            status: 'ACTIVE',
            workspace: { status: 'ACTIVE' },
          },
          select: { id: true },
        }),
        tx.workspaceMembership.findFirst({
          where: { workspaceId: input.workspaceId, userId: ownerUserId, status: 'ACTIVE' },
          select: { id: true },
        }),
      ]);
      if (actorMembership === null || ownerMembership === null) {
        throw new ApplicationError('NOT_FOUND', 'workspace not found');
      }

      const data: Prisma.BunshinCreateInput = {
        workspace: { connect: { id: input.workspaceId } },
        ownerUser: { connect: { id: ownerUserId } },
        name: input.name,
        slug: input.slug,
        type: input.type,
        objectiveSummary: input.objectiveSummary,
        audienceSummary: input.audienceSummary,
        personalitySummary: input.personalitySummary,
        avatarUrl: input.avatarUrl ?? null,
        ...(input.objectives === undefined ? {} : { objectives: { create: input.objectives } }),
        ...(input.audiences === undefined ? {} : { audiences: { create: input.audiences } }),
        ...(input.personality === undefined ? {} : { personality: { create: input.personality } }),
      };
      const row = await tx.bunshin.create({
        data,
        include: bunshinRelations,
      });
      return bunshinAggregate(row);
    });
  }

  async list(input: { workspaceId: string; actorUserId: string }): Promise<BunshinAggregate[]> {
    const rows = await this.client.bunshin.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      orderBy: { updatedAt: 'desc' },
      include: bunshinRelations,
    });
    return rows.map(bunshinAggregate);
  }

  async find(input: ScopedBunshinReference): Promise<BunshinAggregate | null> {
    const row = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      include: bunshinRelations,
    });
    return row === null ? null : bunshinAggregate(row);
  }

  async update(input: UpdateBunshinInput): Promise<BunshinAggregate | null> {
    return this.updateManaged(input, {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.objectiveSummary === undefined ? {} : { objectiveSummary: input.objectiveSummary }),
      ...(input.audienceSummary === undefined ? {} : { audienceSummary: input.audienceSummary }),
      ...(input.personalitySummary === undefined
        ? {}
        : { personalitySummary: input.personalitySummary }),
      ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
    });
  }

  async archive(input: ScopedBunshinReference): Promise<BunshinAggregate | null> {
    return this.updateManaged(input, { status: 'ARCHIVED', archivedAt: new Date() });
  }

  private async updateManaged(
    input: ScopedBunshinReference,
    data: Prisma.BunshinUpdateInput,
  ): Promise<BunshinAggregate | null> {
    return this.client.$transaction(async (tx) => {
      const authorized = await tx.bunshin.findFirst({
        where: {
          id: input.bunshinId,
          workspaceId: input.workspaceId,
          status: { not: 'ARCHIVED' },
          workspace: { status: 'ACTIVE' },
          AND: {
            workspace: {
              memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
            },
          },
        },
        select: {
          id: true,
          ownerUserId: true,
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
      const membership = authorized?.workspace.memberships[0];
      if (
        authorized === null ||
        membership === undefined ||
        !canManageBunshin(membership.role, input.actorUserId, authorized.ownerUserId)
      ) {
        return null;
      }
      return bunshinAggregate(
        await tx.bunshin.update({ where: { id: authorized.id }, data, include: bunshinRelations }),
      );
    });
  }
}

export async function checkDatabaseReadiness(client: PrismaClient = prisma): Promise<void> {
  try {
    await client.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new ApplicationError('DATABASE_UNAVAILABLE', 'Database readiness check failed', error);
  }
}

function knowledge(row: Prisma.OwnerKnowledgeGetPayload<object>): OwnerKnowledge {
  return { ...row, type: row.type, sourceType: row.sourceType, status: row.status };
}
function grant(row: Prisma.BunshinKnowledgeGrantGetPayload<object>): BunshinKnowledgeGrant {
  return { ...row, status: row.status };
}

export class PrismaOwnerKnowledgeRepository implements OwnerKnowledgeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async create(input: Parameters<OwnerKnowledgeRepository['create']>[0]) {
    const member = await this.client.workspaceMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!member) throw new ApplicationError('NOT_FOUND', 'workspace not found');
    return knowledge(
      await this.client.ownerKnowledge.create({
        data: {
          workspaceId: input.workspaceId,
          ownerUserId: input.actorUserId,
          type: input.type,
          title: input.title,
          content: input.content,
          sourceType: 'MANUAL',
        },
      }),
    );
  }
  async listOwned(input: Parameters<OwnerKnowledgeRepository['listOwned']>[0]) {
    const rows = await this.client.ownerKnowledge.findMany({
      where: {
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: 'ACTIVE',
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(knowledge);
  }
  async findOwned(input: Parameters<OwnerKnowledgeRepository['findOwned']>[0]) {
    const row = await this.client.ownerKnowledge.findFirst({
      where: {
        id: input.knowledgeId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: 'ACTIVE',
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
    });
    return row ? knowledge(row) : null;
  }
  async updateOwned(input: Parameters<OwnerKnowledgeRepository['updateOwned']>[0]) {
    const found = await this.findOwned(input);
    if (!found) return null;
    return knowledge(
      await this.client.ownerKnowledge.update({
        where: { id: found.id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.content === undefined ? {} : { content: input.content }),
          ...(input.type === undefined ? {} : { type: input.type }),
        },
      }),
    );
  }
  async archiveOwned(input: Parameters<OwnerKnowledgeRepository['archiveOwned']>[0]) {
    return this.client.$transaction(async (tx) => {
      const row = await tx.ownerKnowledge.findFirst({
        where: {
          id: input.knowledgeId,
          workspaceId: input.workspaceId,
          ownerUserId: input.actorUserId,
          status: 'ACTIVE',
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
        },
      });
      if (!row) return null;
      const now = new Date();
      await tx.bunshinKnowledgeGrant.updateMany({
        where: { ownerKnowledgeId: row.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now },
      });
      return knowledge(
        await tx.ownerKnowledge.update({
          where: { id: row.id },
          data: { status: 'ARCHIVED', archivedAt: now },
        }),
      );
    });
  }
}

export class PrismaKnowledgeGrantRepository implements KnowledgeGrantRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async grant(input: Parameters<KnowledgeGrantRepository['grant']>[0]) {
    return this.client.$transaction(async (tx) => {
      const bunshin = await tx.bunshin.findFirst({
        where: {
          id: input.bunshinId,
          workspaceId: input.workspaceId,
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
      const item = await tx.ownerKnowledge.findFirst({
        where: { id: input.knowledgeId, workspaceId: input.workspaceId, status: 'ACTIVE' },
      });
      const role = bunshin?.workspace.memberships[0]?.role;
      if (
        !bunshin ||
        !item ||
        !role ||
        !canManageBunshin(role, input.actorUserId, bunshin.ownerUserId)
      )
        return null;
      const now = new Date();
      return grant(
        await tx.bunshinKnowledgeGrant.upsert({
          where: {
            workspaceId_bunshinId_ownerKnowledgeId: {
              workspaceId: input.workspaceId,
              bunshinId: bunshin.id,
              ownerKnowledgeId: item.id,
            },
          },
          create: {
            workspaceId: input.workspaceId,
            bunshinId: bunshin.id,
            ownerKnowledgeId: item.id,
            grantedByUserId: input.actorUserId,
          },
          update: {
            status: 'ACTIVE',
            grantedAt: now,
            revokedAt: null,
            grantedByUserId: input.actorUserId,
          },
        }),
      );
    });
  }
  async revoke(input: Parameters<KnowledgeGrantRepository['revoke']>[0]) {
    const authorized = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: { memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } } },
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
    const role = authorized?.workspace.memberships[0]?.role;
    if (!authorized || !role || !canManageBunshin(role, input.actorUserId, authorized.ownerUserId))
      return null;
    const row = await this.client.bunshinKnowledgeGrant.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        ownerKnowledgeId: input.knowledgeId,
        status: 'ACTIVE',
      },
    });
    if (!row) return null;
    return grant(
      await this.client.bunshinKnowledgeGrant.update({
        where: { id: row.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }),
    );
  }
  async listGrantedKnowledge(
    input: Parameters<KnowledgeGrantRepository['listGrantedKnowledge']>[0],
  ) {
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
    if (!bunshin) return [];
    const rows = await this.client.ownerKnowledge.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: 'ACTIVE',
        grants: {
          some: { workspaceId: input.workspaceId, bunshinId: bunshin.id, status: 'ACTIVE' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(knowledge);
  }
}

function memory(row: Prisma.BunshinMemoryGetPayload<object>): BunshinMemory {
  return {
    ...row,
    type: row.type,
    sourceType: row.sourceType,
    confidence: row.confidence.toNumber(),
  };
}

export class PrismaBunshinMemoryRepository implements BunshinMemoryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private async managed(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
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
    const role = bunshin?.workspace.memberships[0]?.role;
    return bunshin && role && canManageBunshin(role, input.actorUserId, bunshin.ownerUserId)
      ? bunshin
      : null;
  }
  async create(input: Parameters<BunshinMemoryRepository['create']>[0]) {
    if (!(await this.managed(input))) return null;
    return memory(
      await this.client.bunshinMemory.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          type: input.type,
          content: input.content,
          summary: input.summary ?? null,
          sourceType: 'USER_INPUT',
          sourceId: null,
          confidence: input.confidence,
          importance: input.importance,
        },
      }),
    );
  }
  async list(input: Parameters<BunshinMemoryRepository['list']>[0]) {
    const accessible = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
    if (!accessible) return [];
    const rows = await this.client.bunshinMemory.findMany({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        deletedAt: null,
        ...(input.includeInactive ? {} : { active: true }),
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(memory);
  }
  async find(input: Parameters<BunshinMemoryRepository['find']>[0]) {
    const rows = await this.list({ ...input, includeInactive: true });
    return rows.find((item) => item.id === input.memoryId) ?? null;
  }
  async update(input: Parameters<BunshinMemoryRepository['update']>[0]) {
    if (!(await this.managed(input))) return null;
    const row = await this.client.bunshinMemory.findFirst({
      where: {
        id: input.memoryId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        deletedAt: null,
      },
    });
    if (!row) return null;
    return memory(
      await this.client.bunshinMemory.update({
        where: { id: row.id },
        data: {
          ...(input.type === undefined ? {} : { type: input.type }),
          ...(input.content === undefined ? {} : { content: input.content }),
          ...(input.summary === undefined ? {} : { summary: input.summary }),
          ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
          ...(input.importance === undefined ? {} : { importance: input.importance }),
        },
      }),
    );
  }
  async setActive(input: Parameters<BunshinMemoryRepository['setActive']>[0]) {
    if (!(await this.managed(input))) return null;
    const row = await this.client.bunshinMemory.findFirst({
      where: {
        id: input.memoryId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        deletedAt: null,
      },
    });
    if (!row) return null;
    return memory(
      await this.client.bunshinMemory.update({
        where: { id: row.id },
        data: { active: input.active },
      }),
    );
  }
  async softDelete(input: Parameters<BunshinMemoryRepository['softDelete']>[0]) {
    if (!(await this.managed(input))) return null;
    const row = await this.client.bunshinMemory.findFirst({
      where: {
        id: input.memoryId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        deletedAt: null,
      },
    });
    if (!row) return null;
    return memory(
      await this.client.bunshinMemory.update({
        where: { id: row.id },
        data: { active: false, deletedAt: new Date() },
      }),
    );
  }
}

function capabilityAssignment(
  row: Prisma.BunshinCapabilityAssignmentGetPayload<object>,
): BunshinCapabilityAssignment {
  return {
    ...row,
    capabilityType: row.capabilityType,
    status: row.status,
    config: row.config,
  };
}

export class PrismaBunshinCapabilityAssignmentRepository implements BunshinCapabilityAssignmentRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async managed(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
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
    const role = bunshin?.workspace.memberships[0]?.role;
    return bunshin !== null &&
      role !== undefined &&
      canManageBunshin(role, input.actorUserId, bunshin.ownerUserId)
      ? bunshin
      : null;
  }

  async assign(input: Parameters<BunshinCapabilityAssignmentRepository['assign']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.bunshinCapabilityAssignment.upsert({
        where: {
          workspaceId_bunshinId_capabilityType: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            capabilityType: input.capabilityType,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          capabilityType: input.capabilityType,
          assignedByUserId: input.actorUserId,
          config: {},
        },
        update: {},
      });
      if (row.status === 'LOCKED') {
        throw new ApplicationError('CONFLICT', 'locked capability cannot be activated');
      }
      if (row.status === 'ACTIVE') return capabilityAssignment(row);
      return capabilityAssignment(
        await tx.bunshinCapabilityAssignment.update({
          where: { id: row.id },
          data: {
            status: 'ACTIVE',
            assignedByUserId: input.actorUserId,
            activatedAt: new Date(),
          },
        }),
      );
    });
  }

  async list(input: Parameters<BunshinCapabilityAssignmentRepository['list']>[0]) {
    const accessible = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
    if (accessible === null) return null;
    const rows = await this.client.bunshinCapabilityAssignment.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(capabilityAssignment);
  }

  async find(input: Parameters<BunshinCapabilityAssignmentRepository['find']>[0]) {
    const rows = await this.list(input);
    if (rows === null) return null;
    return rows.find((row) => row.capabilityType === input.capabilityType) ?? null;
  }

  async setStatus(input: Parameters<BunshinCapabilityAssignmentRepository['setStatus']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.bunshinCapabilityAssignment.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          capabilityType: input.capabilityType,
        },
      });
      if (row === null) return null;
      if (row.status === 'LOCKED') {
        throw new ApplicationError('CONFLICT', 'locked capability cannot be changed');
      }
      if (row.status === input.status) return capabilityAssignment(row);
      return capabilityAssignment(
        await tx.bunshinCapabilityAssignment.update({
          where: { id: row.id },
          data: {
            status: input.status,
            ...(input.status === 'ACTIVE' ? { activatedAt: new Date() } : {}),
          },
        }),
      );
    });
  }
}

function socialProfile(row: Prisma.SocialProfileGetPayload<object>): SocialProfile {
  try {
    return {
      ...row,
      platform: row.platform,
      postingFrequency: row.postingFrequency,
      preferredFormats: parsePreferredFormats(row.preferredFormats),
      status: row.status,
    };
  } catch (error) {
    throw new ApplicationError('INTERNAL_ERROR', 'invalid persisted social profile', error);
  }
}

export class PrismaSocialProfileRepository implements SocialProfileRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async accessible(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
  ) {
    return client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }

  private async managed(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
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
    const role = bunshin?.workspace.memberships[0]?.role;
    return bunshin !== null &&
      role !== undefined &&
      canManageBunshin(role, input.actorUserId, bunshin.ownerUserId)
      ? bunshin
      : null;
  }

  async create(input: Parameters<SocialProfileRepository['create']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if ((await this.managed(tx, input)) === null) return null;
        return socialProfile(
          await tx.socialProfile.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              platform: input.platform,
              handle: input.handle ?? null,
              profileUrl: input.profileUrl ?? null,
              purpose: input.purpose,
              postingFrequency: input.postingFrequency,
              preferredFormats: input.preferredFormats,
            },
          }),
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApplicationError('CONFLICT', 'social profile already exists', error);
      }
      throw error;
    }
  }

  async list(input: Parameters<SocialProfileRepository['list']>[0]) {
    if ((await this.accessible(this.client, input)) === null) return null;
    const rows = await this.client.socialProfile.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      orderBy: [{ platform: 'asc' }],
    });
    return rows.map(socialProfile);
  }

  async findByPlatform(input: Parameters<SocialProfileRepository['findByPlatform']>[0]) {
    if ((await this.accessible(this.client, input)) === null) return null;
    const row = await this.client.socialProfile.findUnique({
      where: {
        workspaceId_bunshinId_platform: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          platform: input.platform,
        },
      },
    });
    return row === null ? null : socialProfile(row);
  }

  async update(input: Parameters<SocialProfileRepository['update']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.socialProfile.findUnique({
        where: {
          workspaceId_bunshinId_platform: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            platform: input.platform,
          },
        },
        select: { id: true },
      });
      if (row === null) return null;
      return socialProfile(
        await tx.socialProfile.update({
          where: { id: row.id },
          data: {
            ...(input.handle === undefined ? {} : { handle: input.handle }),
            ...(input.profileUrl === undefined ? {} : { profileUrl: input.profileUrl }),
            ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
            ...(input.postingFrequency === undefined
              ? {}
              : { postingFrequency: input.postingFrequency }),
            ...(input.preferredFormats === undefined
              ? {}
              : { preferredFormats: input.preferredFormats }),
          },
        }),
      );
    });
  }

  async setActive(input: Parameters<SocialProfileRepository['setActive']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const row = await tx.socialProfile.findUnique({
        where: {
          workspaceId_bunshinId_platform: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            platform: input.platform,
          },
        },
      });
      if (row === null) return null;
      const status = input.active ? 'ACTIVE' : 'INACTIVE';
      if (row.status === status) return socialProfile(row);
      return socialProfile(
        await tx.socialProfile.update({ where: { id: row.id }, data: { status } }),
      );
    });
  }
}

function socialAccountStrategy(
  row: Prisma.SocialAccountStrategyGetPayload<object>,
): SocialAccountStrategy {
  return { ...row, availableMinutes: row.availableMinutes as 3 | 5 | 10 | 20 };
}

export class PrismaSocialAccountStrategyRepository implements SocialAccountStrategyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private managed(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; actorUserId: string; bunshinId: string },
  ) {
    return client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: {
            some: { userId: input.actorUserId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
          },
        },
      },
      select: { id: true },
    });
  }
  private accessible(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }
  async createVersion(input: Parameters<SocialAccountStrategyRepository['createVersion']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if ((await this.managed(tx, input)) === null) return null;
        const profile = await tx.socialProfile.findFirst({
          where: {
            id: input.socialProfileId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            platform: input.platform,
          },
          select: { id: true },
        });
        if (profile === null) return null;
        await tx.$queryRaw<Array<{ lock: string }>>`
          SELECT pg_advisory_xact_lock(hashtext(${input.socialProfileId}))::text AS lock
        `;
        const latest = await tx.socialAccountStrategy.aggregate({
          where: { socialProfileId: input.socialProfileId },
          _max: { version: true },
        });
        const { actorUserId, status, ...data } = input;
        void actorUserId;
        return socialAccountStrategy(
          await tx.socialAccountStrategy.create({
            data: {
              ...data,
              destinationDetail: input.destinationDetail ?? null,
              status: status ?? 'DRAFT',
              version: (latest._max.version ?? 0) + 1,
            },
          }),
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'strategy version conflict', error);
      throw error;
    }
  }
  async list(input: Parameters<SocialAccountStrategyRepository['list']>[0]) {
    if ((await this.accessible(input)) === null) return null;
    const profile = await this.client.socialProfile.findFirst({
      where: {
        id: input.socialProfileId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
      select: { id: true },
    });
    if (profile === null) return null;
    return (
      await this.client.socialAccountStrategy.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          socialProfileId: input.socialProfileId,
        },
        orderBy: { version: 'desc' },
      })
    ).map(socialAccountStrategy);
  }
  async approve(input: Parameters<SocialAccountStrategyRepository['approve']>[0]) {
    return this.client.$transaction(async (tx) => {
      if ((await this.managed(tx, input)) === null) return null;
      const target = await tx.socialAccountStrategy.findFirst({
        where: { id: input.strategyId, workspaceId: input.workspaceId, bunshinId: input.bunshinId },
        select: { id: true, socialProfileId: true, status: true },
      });
      if (target === null) return null;
      if (target.status === 'SUPERSEDED')
        throw new ApplicationError('CONFLICT', 'superseded strategy cannot be approved');
      if (target.status === 'APPROVED')
        return socialAccountStrategy(
          await tx.socialAccountStrategy.findUniqueOrThrow({ where: { id: target.id } }),
        );
      const now = new Date();
      await tx.socialAccountStrategy.updateMany({
        where: { socialProfileId: target.socialProfileId, status: 'APPROVED' },
        data: { status: 'SUPERSEDED', supersededAt: now },
      });
      return socialAccountStrategy(
        await tx.socialAccountStrategy.update({
          where: { id: target.id },
          data: { status: 'APPROVED', approvedAt: now, supersededAt: null },
        }),
      );
    });
  }
}
