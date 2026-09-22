import type {
  BunshinCapabilityAssignment,
  BunshinCapabilityAssignmentRepository,
} from '@bunshin/application';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { type Prisma, type PrismaClient, prisma } from './client';

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
