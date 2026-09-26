import type { ContentPillar, ContentPillarRepository } from '@bunshin/capability-social';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';

function contentPillar(row: Prisma.ContentPillarGetPayload<object>): ContentPillar {
  return row;
}

export class PrismaContentPillarRepository implements ContentPillarRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async ensureNotReferencedByConfirmedPlan(
    client: Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; pillarId: string },
  ) {
    const references = await client.weeklyPlanItem.count({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        contentPillarId: input.pillarId,
        weeklyPlan: { status: 'CONFIRMED' },
      },
    });
    if (references > 0) {
      throw new ApplicationError(
        'CONFLICT',
        'content pillar is referenced by a confirmed weekly plan',
      );
    }
  }

  private async accessible(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
  ) {
    return client.bunshin.findFirst({
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
      select: { id: true },
    });
  }

  private async managed(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
  ) {
    const bunshin = await client.bunshin.findFirst({
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
      if (!input.active) await this.ensureNotReferencedByConfirmedPlan(tx, input);
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
      await this.ensureNotReferencedByConfirmedPlan(tx, input);
      return contentPillar(
        await tx.contentPillar.update({
          where: { id: row.id },
          data: { active: false, deletedAt: new Date() },
        }),
      );
    });
  }
}
