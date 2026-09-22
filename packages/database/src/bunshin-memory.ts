import type { BunshinMemoryRepository } from '@bunshin/application';
import type { BunshinMemory } from '@bunshin/platform-domain';
import { canManageBunshin } from '@bunshin/platform-domain';
import { type Prisma, type PrismaClient, prisma } from './client';

function memory(row: Prisma.BunshinMemoryGetPayload<object>): BunshinMemory {
  return {
    ...row,
    type: row.type,
    sourceType: row.sourceType,
    confidence: row.confidence.toNumber(),
  };
}

export class PrismaBunshinMemoryRepository implements BunshinMemoryRepository {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly ownerOnly = false,
  ) {}
  private async managed(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ...(this.ownerOnly ? { ownerUserId: input.actorUserId } : {}),
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
    if (!(await this.managed(input))) return [];
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

export class PrismaOwnerBunshinMemoryRepository extends PrismaBunshinMemoryRepository {
  constructor(client: PrismaClient = prisma) {
    super(client, true);
  }
}
