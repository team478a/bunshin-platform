import { PrismaClient } from '@prisma/client/index';
import type { Prisma } from '@prisma/client/index';
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
} from '@bunshin/application';
import type {
  BunshinAggregate,
  PlatformAdmin,
  User,
  Workspace,
  WorkspaceMembership,
} from '@bunshin/platform-domain';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

const globalPrisma = globalThis as unknown as { bunshinPrisma?: PrismaClient };
export const prisma = globalPrisma.bunshinPrisma ?? new PrismaClient({ log: ['warn', 'error'] });
if (process.env['NODE_ENV'] !== 'production') globalPrisma.bunshinPrisma = prisma;

function user(row: Awaited<ReturnType<PrismaClient['user']['create']>>): User {
  return { ...row, email: row.email, status: row.status };
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
