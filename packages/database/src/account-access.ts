import type {
  AccountTransaction,
  AccountUnitOfWork,
  CreateUserInput,
  PlatformAdminRepository,
  WorkspaceAccessRepository,
} from '@bunshin/application';
import type { CurrentUser, CurrentUserAccountRepository, VerifiedSessionUser } from '@bunshin/auth';
import type { PlatformAdmin, User, Workspace, WorkspaceMembership } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { type PrismaClient, prisma } from './client';
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

export class PrismaCurrentUserAccountRepository implements CurrentUserAccountRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findActiveByEmailIdentity(providerUserId: string): Promise<CurrentUser | null> {
    const identity = await this.client.authIdentity.findFirst({
      where: { provider: 'EMAIL', providerUserId, user: { status: 'ACTIVE' } },
      select: { id: true, userId: true },
    });
    return identity === null ? null : { userId: identity.userId, authIdentityId: identity.id };
  }

  async emailIdentityExists(providerUserId: string): Promise<boolean> {
    return Boolean(
      await this.client.authIdentity.findFirst({
        where: { provider: 'EMAIL', providerUserId },
        select: { id: true },
      }),
    );
  }

  async provisionEmailIdentity(input: VerifiedSessionUser): Promise<CurrentUser> {
    const existing = await this.findActiveByEmailIdentity(input.providerUserId);
    if (existing !== null) return existing;
    try {
      return await this.client.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            displayName: (
              input.displayName ??
              input.email?.split('@')[0] ??
              'ワタシワークス利用者'
            ).slice(0, 100),
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

  async listForManagement(actorUserId: string) {
    const actor = await this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
      select: { role: true },
    });
    if (!actor) return null;
    const [admins, audits] = await Promise.all([
      this.client.platformAdmin.findMany({
        include: { user: { select: { displayName: true, email: true } } },
        orderBy: [{ status: 'asc' }, { grantedAt: 'asc' }],
      }),
      this.client.platformAdminAudit.findMany({
        include: {
          target: { select: { displayName: true, email: true } },
          actor: { select: { displayName: true, email: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      }),
    ]);
    return { actorRole: actor.role, admins, audits };
  }

  async grantOrUpdate(input: {
    actorUserId: string;
    email: string;
    role: 'SUPER_ADMIN' | 'OPERATOR' | 'SUPPORT';
    reason: string;
  }): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const actor = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
      });
      if (!actor) throw new ApplicationError('FORBIDDEN', 'super admin required');
      const target = await tx.user.findFirst({
        where: { email: { equals: input.email, mode: 'insensitive' }, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!target) throw new ApplicationError('NOT_FOUND', 'active user not found');
      const current = await tx.platformAdmin.findUnique({ where: { userId: target.id } });
      if (
        current?.status === 'ACTIVE' &&
        current.role === 'SUPER_ADMIN' &&
        input.role !== 'SUPER_ADMIN'
      ) {
        const superAdminCount = await tx.platformAdmin.count({
          where: { status: 'ACTIVE', role: 'SUPER_ADMIN' },
        });
        if (superAdminCount <= 1)
          throw new ApplicationError('CONFLICT', 'last super admin cannot be demoted');
      }
      const action = current
        ? current.status === 'REVOKED'
          ? 'REACTIVATED'
          : 'ROLE_CHANGED'
        : 'GRANTED';
      await tx.platformAdmin.upsert({
        where: { userId: target.id },
        create: { userId: target.id, role: input.role, status: 'ACTIVE' },
        update: { role: input.role, status: 'ACTIVE', revokedAt: null },
      });
      await tx.platformAdminAudit.create({
        data: {
          targetUserId: target.id,
          actorUserId: input.actorUserId,
          action,
          previousRole: current?.role ?? null,
          nextRole: input.role,
          previousStatus: current?.status ?? null,
          nextStatus: 'ACTIVE',
          reason: input.reason,
        },
      });
    });
  }

  async revoke(input: { actorUserId: string; adminId: string; reason: string }): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const actor = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
      });
      if (!actor) throw new ApplicationError('FORBIDDEN', 'super admin required');
      const target = await tx.platformAdmin.findUnique({ where: { id: input.adminId } });
      if (!target || target.status !== 'ACTIVE')
        throw new ApplicationError('NOT_FOUND', 'active admin not found');
      if (target.userId === input.actorUserId)
        throw new ApplicationError('CONFLICT', 'self revocation is not allowed');
      if (target.role === 'SUPER_ADMIN') {
        const count = await tx.platformAdmin.count({
          where: { status: 'ACTIVE', role: 'SUPER_ADMIN' },
        });
        if (count <= 1)
          throw new ApplicationError('CONFLICT', 'last super admin cannot be revoked');
      }
      await tx.platformAdmin.update({
        where: { id: target.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await tx.platformAdminAudit.create({
        data: {
          targetUserId: target.userId,
          actorUserId: input.actorUserId,
          action: 'REVOKED',
          previousRole: target.role,
          nextRole: target.role,
          previousStatus: target.status,
          nextStatus: 'REVOKED',
          reason: input.reason,
        },
      });
    });
  }
}
