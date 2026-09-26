import type { ServiceStaffRoleRepository } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
import { serviceStaffRoleRecord } from './service-records';

export class PrismaServiceStaffRoleRepository implements ServiceStaffRoleRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async canManage(workspaceId: string, groupId: string, actorUserId: string) {
    const [platformAdmin, owner] = await Promise.all([
      this.client.platformAdmin.findFirst({
        where: { userId: actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      }),
      this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          status: 'ACTIVE',
          serviceRole: 'SERVICE_OWNER',
          group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
        },
        select: { id: true },
      }),
    ]);
    return platformAdmin !== null || owner !== null;
  }

  async list(input: Parameters<ServiceStaffRoleRepository['list']>[0]) {
    if (!(await this.canManage(input.workspaceId, input.groupId, input.actorUserId))) return null;
    const rows = await this.client.groupMembership.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      orderBy: [{ serviceRole: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(serviceStaffRoleRecord);
  }

  async set(input: Parameters<ServiceStaffRoleRepository['set']>[0]) {
    return this.client.$transaction(async (tx) => {
      const [platformAdmin, owner] = await Promise.all([
        tx.platformAdmin.findFirst({
          where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
          select: { id: true },
        }),
        tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.actorUserId,
            status: 'ACTIVE',
            serviceRole: 'SERVICE_OWNER',
            group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
          },
          select: { id: true },
        }),
      ]);
      if (platformAdmin === null && owner === null) return null;
      const target = await tx.groupMembership.findFirst({
        where: {
          id: input.membershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { in: ['ACTIVE', 'SUSPENDED'] },
          group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
        },
      });
      if (target === null || target.serviceRole === input.serviceRole)
        return target === null ? null : serviceStaffRoleRecord(target);
      if (target.serviceRole === 'SERVICE_OWNER' && input.serviceRole !== 'SERVICE_OWNER') {
        const owners = await tx.groupMembership.count({
          where: {
            groupId: input.groupId,
            serviceRole: 'SERVICE_OWNER',
            status: 'ACTIVE',
          },
        });
        if (owners <= 1) return null;
      }
      const legacyRole = ['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(input.serviceRole)
        ? 'MANAGER'
        : 'PARTICIPANT';
      const updated = await tx.groupMembership.update({
        where: { id: target.id },
        data: { serviceRole: input.serviceRole, role: legacyRole },
      });
      await tx.groupMembershipAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: target.id,
          action: 'ROLE_CHANGED',
          beforeData: { role: target.role, serviceRole: target.serviceRole, status: target.status },
          afterData: {
            role: updated.role,
            serviceRole: updated.serviceRole,
            status: updated.status,
          },
          reason: input.reason,
          performedByUserId: input.actorUserId,
          occurredAt: input.now,
        },
      });
      return serviceStaffRoleRecord(updated);
    });
  }
}
