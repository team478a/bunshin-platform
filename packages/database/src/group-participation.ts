import type { GroupParticipationRepository } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
import { groupInvitationRecord, groupMembershipRecord, groupRecord } from './service-records';
export class PrismaGroupParticipationRepository implements GroupParticipationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async canManageWorkspace(workspaceId: string, actorUserId: string) {
    return this.client.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: actorUserId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
        workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  private async canManageGroup(workspaceId: string, groupId: string, actorUserId: string) {
    const [workspaceManager, platformAdmin] = await Promise.all([
      this.canManageWorkspace(workspaceId, actorUserId),
      this.client.platformAdmin.findFirst({
        where: {
          userId: actorUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
        },
        select: { id: true },
      }),
    ]);
    if (workspaceManager !== null || platformAdmin !== null) return true;
    return Boolean(
      await this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          OR: [
            { role: 'MANAGER' },
            {
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
              group: { serviceConfiguration: { isNot: null } },
            },
          ],
          status: 'ACTIVE',
          group: { workspaceId, status: 'ACTIVE' },
          workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
        },
        select: { id: true },
      }),
    );
  }

  async createGroup(input: Parameters<GroupParticipationRepository['createGroup']>[0]) {
    if ((await this.canManageWorkspace(input.workspaceId, input.actorUserId)) === null) return null;
    const created = await this.client.$transaction(
      async (tx) => {
        const now = new Date();
        const entitlement = await tx.organizationEntitlement.findUnique({
          where: { workspaceId: input.workspaceId },
          select: { maxGroups: true, suspended: true, startsAt: true, endsAt: true },
        });
        if (
          entitlement?.suspended ||
          (entitlement?.startsAt && entitlement.startsAt > now) ||
          (entitlement?.endsAt && entitlement.endsAt <= now)
        )
          return null;
        if (entitlement?.maxGroups !== null && entitlement?.maxGroups !== undefined) {
          const count = await tx.group.count({
            where: { workspaceId: input.workspaceId, status: 'ACTIVE' },
          });
          if (count >= entitlement.maxGroups) return null;
        }
        const group = await tx.group.create({
          data: { workspaceId: input.workspaceId, name: input.name },
        });
        await tx.groupMembership.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: group.id,
            userId: input.actorUserId,
            role: 'MANAGER',
            serviceRole: 'SERVICE_OWNER',
            status: 'ACTIVE',
            consentedAt: new Date(),
          },
        });
        return group;
      },
      { isolationLevel: 'Serializable' },
    );
    return created ? groupRecord(created) : null;
  }

  async createInvitation(input: Parameters<GroupParticipationRepository['createInvitation']>[0]) {
    if (!(await this.canManageGroup(input.workspaceId, input.groupId, input.actorUserId)))
      return null;
    const group = await this.client.group.findFirst({
      where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (group === null) return null;
    const created = await this.client.groupInvitation.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        tokenHash: input.tokenHash,
        role: input.role,
        expiresAt: input.expiresAt,
        maxUses: input.maxUses,
        createdByUserId: input.actorUserId,
      },
    });
    return groupInvitationRecord(created);
  }

  async acceptInvitation(input: Parameters<GroupParticipationRepository['acceptInvitation']>[0]) {
    return this.client.$transaction(async (tx) => {
      const invitation = await tx.groupInvitation.findFirst({
        where: {
          tokenHash: input.tokenHash,
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          expiresAt: { gt: input.now },
          group: { status: 'ACTIVE' },
        },
      });
      if (invitation === null || invitation.usedCount >= invitation.maxUses) return null;
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: input.workspaceId },
        select: { maxMembers: true, suspended: true, startsAt: true, endsAt: true },
      });
      if (
        entitlement?.suspended ||
        (entitlement?.startsAt && entitlement.startsAt > input.now) ||
        (entitlement?.endsAt && entitlement.endsAt <= input.now)
      )
        return null;
      const existingActiveGroupMembership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (entitlement?.maxMembers && existingActiveGroupMembership === null) {
        const activeMembers = await tx.groupMembership.findMany({
          where: { workspaceId: input.workspaceId, status: 'ACTIVE' },
          distinct: ['userId'],
          select: { userId: true },
        });
        if (activeMembers.length >= entitlement.maxMembers) return null;
      }
      const existingWorkspaceMembership = await tx.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
          },
        },
      });
      if (existingWorkspaceMembership !== null && existingWorkspaceMembership.status !== 'ACTIVE')
        return null;
      if (existingWorkspaceMembership === null) {
        await tx.workspaceMembership.create({
          data: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            role: 'MEMBER',
          },
        });
      }
      const consumed = await tx.groupInvitation.updateMany({
        where: { id: invitation.id, status: 'ACTIVE', usedCount: invitation.usedCount },
        data: { usedCount: { increment: 1 } },
      });
      if (consumed.count !== 1) return null;
      const nextUses = invitation.usedCount + 1;
      if (nextUses >= invitation.maxUses) {
        await tx.groupInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXHAUSTED' },
        });
      }
      const membership = await tx.groupMembership.upsert({
        where: { groupId_userId: { groupId: invitation.groupId, userId: input.actorUserId } },
        create: {
          workspaceId: input.workspaceId,
          groupId: invitation.groupId,
          userId: input.actorUserId,
          role: invitation.role,
          serviceRole: invitation.role === 'MANAGER' ? 'SERVICE_ADMIN' : 'PARTICIPANT',
          status: 'ACTIVE',
          consentedAt: input.now,
        },
        update: {
          role: invitation.role,
          serviceRole: invitation.role === 'MANAGER' ? 'SERVICE_ADMIN' : 'PARTICIPANT',
          status: 'ACTIVE',
          consentedAt: input.now,
          declinedAt: null,
          revokedAt: null,
        },
      });
      return groupMembershipRecord(membership);
    });
  }

  async declineInvitation(input: Parameters<GroupParticipationRepository['declineInvitation']>[0]) {
    return this.client.$transaction(async (tx) => {
      const invitation = await tx.groupInvitation.findFirst({
        where: {
          tokenHash: input.tokenHash,
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          expiresAt: { gt: input.now },
        },
      });
      if (invitation === null || invitation.usedCount >= invitation.maxUses) return null;
      const consumed = await tx.groupInvitation.updateMany({
        where: { id: invitation.id, status: 'ACTIVE', usedCount: invitation.usedCount },
        data: { usedCount: { increment: 1 }, status: 'EXHAUSTED' },
      });
      if (consumed.count !== 1) return null;
      const membership = await tx.groupMembership.upsert({
        where: { groupId_userId: { groupId: invitation.groupId, userId: input.actorUserId } },
        create: {
          workspaceId: input.workspaceId,
          groupId: invitation.groupId,
          userId: input.actorUserId,
          role: invitation.role,
          status: 'DECLINED',
          declinedAt: input.now,
        },
        update: { status: 'DECLINED', consentedAt: null, declinedAt: input.now },
      });
      return groupMembershipRecord(membership);
    });
  }

  async leaveGroup(input: Parameters<GroupParticipationRepository['leaveGroup']>[0]) {
    const membership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
      },
    });
    if (membership === null) return null;
    return groupMembershipRecord(
      await this.client.groupMembership.update({
        where: { id: membership.id },
        data: { status: 'REVOKED', revokedAt: input.now },
      }),
    );
  }

  async listMemberships(input: Parameters<GroupParticipationRepository['listMemberships']>[0]) {
    const workspaceMembership = await this.client.workspaceMembership.findFirst({
      where: { workspaceId: input.workspaceId, userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (workspaceMembership === null) return null;
    const rows = await this.client.groupMembership.findMany({
      where: { workspaceId: input.workspaceId, userId: input.actorUserId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(groupMembershipRecord);
  }

  async updateMembership(input: Parameters<GroupParticipationRepository['updateMembership']>[0]) {
    return this.client.$transaction(async (tx) => {
      const [workspaceManager, platformAdmin, groupManager] = await Promise.all([
        tx.workspaceMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            status: 'ACTIVE',
            role: { in: ['OWNER', 'ADMIN'] },
          },
          select: { id: true },
        }),
        tx.platformAdmin.findFirst({
          where: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
          },
          select: { id: true },
        }),
        tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.actorUserId,
            role: 'MANAGER',
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
      ]);
      const elevated = workspaceManager !== null || platformAdmin !== null;
      if (!elevated && groupManager === null) return null;

      const target = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          group: { status: 'ACTIVE' },
        },
      });
      if (target === null) return null;

      // A group manager can suspend/restart participants, but only an organization or
      // system administrator can appoint managers or change another manager.
      if (!elevated && (target.role === 'MANAGER' || input.role === 'MANAGER')) return null;

      const removesActiveManager =
        target.role === 'MANAGER' &&
        target.status === 'ACTIVE' &&
        (input.role !== 'MANAGER' || input.status !== 'ACTIVE');
      if (removesActiveManager) {
        const activeManagers = await tx.groupMembership.count({
          where: { groupId: input.groupId, role: 'MANAGER', status: 'ACTIVE' },
        });
        if (activeManagers <= 1) return null;
      }

      const updated = await tx.groupMembership.update({
        where: { id: target.id },
        data: {
          role: input.role,
          status: input.status,
          revokedAt: input.status === 'REVOKED' ? input.now : null,
        },
      });
      const action =
        input.status === 'SUSPENDED'
          ? 'SUSPENDED'
          : input.status === 'REVOKED'
            ? 'REVOKED'
            : target.status !== 'ACTIVE'
              ? 'REACTIVATED'
              : 'ROLE_CHANGED';
      await tx.groupMembershipAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: target.id,
          action,
          beforeData: { role: target.role, status: target.status },
          afterData: { role: updated.role, status: updated.status },
          reason: input.reason,
          performedByUserId: input.actorUserId,
          occurredAt: input.now,
        },
      });
      return groupMembershipRecord(updated);
    });
  }
}
