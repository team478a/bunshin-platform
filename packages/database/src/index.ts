import { PrismaClient } from '@prisma/client/index';
import type {
  AccountTransaction,
  AccountUnitOfWork,
  CreateUserInput,
  PlatformAdminRepository,
  WorkspaceAccessRepository,
} from '@bunshin/application';
import type { PlatformAdmin, User, Workspace, WorkspaceMembership } from '@bunshin/platform-domain';
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

export async function checkDatabaseReadiness(client: PrismaClient = prisma): Promise<void> {
  try {
    await client.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new ApplicationError('DATABASE_UNAVAILABLE', 'Database readiness check failed', error);
  }
}
