import type { ExternalTrackingLinkRepository } from '@bunshin/application';
import { Prisma, type PrismaClient } from './client';

export class PrismaExternalTrackingAdminCommands {
  constructor(
    private readonly client: PrismaClient,
    private readonly serviceId: string | undefined,
    private readonly manage: (workspaceId: string, actorUserId: string) => Promise<boolean>,
    private readonly serviceMatches: (groupId: string) => boolean,
  ) {}

  async createSystem(input: Parameters<ExternalTrackingLinkRepository['createSystem']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    if (!this.serviceMatches(input.groupId)) return null;
    const group = await this.client.group.findFirst({
      where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!group) return null;
    return this.client.$transaction(async (tx) => {
      const created = await tx.externalTrackingSystem.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          name: input.name,
          systemType: input.systemType,
          externalSystemId: input.externalSystemId,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: created.workspaceId,
          groupId: created.groupId,
          resourceType: 'SYSTEM',
          resourceId: created.id,
          action: 'CREATED',
          afterData: { name: created.name, systemType: created.systemType, status: created.status },
          performedByUserId: input.actorUserId,
        },
      });
      return created;
    });
  }

  async addAllowedDomain(input: Parameters<ExternalTrackingLinkRepository['addAllowedDomain']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    const system = await this.client.externalTrackingSystem.findFirst({
      where: {
        id: input.systemId,
        workspaceId: input.workspaceId,
        status: 'ACTIVE',
        ...(this.serviceId ? { groupId: this.serviceId } : {}),
      },
    });
    if (!system) return null;
    return this.client.$transaction(async (tx) => {
      const created = await tx.externalTrackingAllowedDomain.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: system.groupId,
          systemId: system.id,
          hostname: input.hostname,
          allowSubdomains: input.allowSubdomains,
          shortener: input.shortener,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: created.workspaceId,
          groupId: created.groupId,
          resourceType: 'DOMAIN',
          resourceId: created.id,
          action: 'CREATED',
          afterData: {
            hostname: created.hostname,
            allowSubdomains: created.allowSubdomains,
            shortener: created.shortener,
            status: created.status,
          },
          performedByUserId: input.actorUserId,
        },
      });
      return created;
    });
  }

  async upsertMemberIdentity(
    input: Parameters<ExternalTrackingLinkRepository['upsertMemberIdentity']>[0],
  ) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const system = await tx.externalTrackingSystem.findFirst({
        where: {
          id: input.systemId,
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          ...(this.serviceId ? { groupId: this.serviceId } : {}),
        },
      });
      if (!system) return null;
      const membership = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: system.groupId,
          status: 'ACTIVE',
          consentedAt: { not: null },
        },
      });
      if (!membership) return null;
      const before = await tx.externalTrackingMemberIdentity.findUnique({
        where: {
          systemId_groupMembershipId: {
            systemId: system.id,
            groupMembershipId: membership.id,
          },
        },
      });
      const saved = await tx.externalTrackingMemberIdentity.upsert({
        where: {
          systemId_groupMembershipId: {
            systemId: system.id,
            groupMembershipId: membership.id,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          groupId: system.groupId,
          systemId: system.id,
          groupMembershipId: membership.id,
          commonUserId: input.commonUserId,
          agencyId: input.agencyId,
          externalMemberId: input.externalMemberId,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
        update: {
          commonUserId: input.commonUserId,
          agencyId: input.agencyId,
          externalMemberId: input.externalMemberId,
          status: 'ACTIVE',
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: saved.workspaceId,
          groupId: saved.groupId,
          resourceType: 'MEMBER_IDENTITY',
          resourceId: saved.id,
          action: before ? 'UPDATED' : 'CREATED',
          beforeData: before ? { status: before.status } : Prisma.JsonNull,
          afterData: {
            status: saved.status,
            hasCommonUserId: Boolean(saved.commonUserId),
            hasAgencyId: Boolean(saved.agencyId),
            hasExternalMemberId: Boolean(saved.externalMemberId),
          },
          performedByUserId: input.actorUserId,
        },
      });
      return saved;
    });
  }

  async createLink(input: Parameters<ExternalTrackingLinkRepository['createLink']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const system = await tx.externalTrackingSystem.findFirst({
        where: {
          id: input.systemId,
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          ...(this.serviceId ? { groupId: this.serviceId } : {}),
        },
      });
      if (!system) return null;
      const domain = await tx.externalTrackingAllowedDomain.findFirst({
        where: {
          id: input.allowedDomainId,
          workspaceId: input.workspaceId,
          groupId: system.groupId,
          systemId: system.id,
          status: 'ACTIVE',
        },
      });
      if (!domain) return null;
      if (input.memberIdentityId) {
        const member = await tx.externalTrackingMemberIdentity.findFirst({
          where: {
            id: input.memberIdentityId,
            workspaceId: input.workspaceId,
            groupId: system.groupId,
            systemId: system.id,
            status: 'ACTIVE',
          },
        });
        if (!member) return null;
      }
      if (
        input.productPackId &&
        !(await tx.productPack.findFirst({
          where: {
            id: input.productPackId,
            workspaceId: input.workspaceId,
            groupId: system.groupId,
          },
        }))
      )
        return null;
      if (
        input.campaignId &&
        !(await tx.campaign.findFirst({
          where: { id: input.campaignId, workspaceId: input.workspaceId, groupId: system.groupId },
        }))
      )
        return null;
      const created = await tx.externalTrackingLink.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: system.groupId,
          systemId: system.id,
          allowedDomainId: domain.id,
          memberIdentityId: input.memberIdentityId,
          productPackId: input.productPackId,
          campaignId: input.campaignId,
          scopeType: input.scopeType,
          scopeKey: input.scopeKey,
          name: input.name,
          externalLinkId: input.externalLinkId,
          referralToken: input.referralToken,
          url: input.url,
          startsAt: input.startsAt,
          expiresAt: input.expiresAt,
          notes: input.notes,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: created.workspaceId,
          groupId: created.groupId,
          resourceType: 'LINK',
          resourceId: created.id,
          action: 'CREATED',
          afterData: {
            name: created.name,
            scopeType: created.scopeType,
            scopeKey: created.scopeKey,
            status: created.status,
            allowedDomainId: created.allowedDomainId,
            startsAt: created.startsAt,
            expiresAt: created.expiresAt,
          },
          performedByUserId: input.actorUserId,
        },
      });
      return created;
    });
  }

  async activateLink(input: Parameters<ExternalTrackingLinkRepository['activateLink']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const link = await tx.externalTrackingLink.findFirst({
        where: {
          id: input.linkId,
          workspaceId: input.workspaceId,
          ...(this.serviceId ? { groupId: this.serviceId } : {}),
          status: { in: ['DRAFT', 'SUSPENDED'] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
          system: { status: 'ACTIVE' },
          allowedDomain: { status: 'ACTIVE' },
        },
      });
      if (!link) return null;
      const duplicate = await tx.externalTrackingLink.findFirst({
        where: {
          systemId: link.systemId,
          scopeKey: link.scopeKey,
          status: 'ACTIVE',
          deletedAt: null,
          id: { not: link.id },
        },
        select: { id: true },
      });
      if (duplicate) return null;
      const updated = await tx.externalTrackingLink.update({
        where: { id: link.id },
        data: {
          status: 'ACTIVE',
          activatedAt: input.now,
          suspendedAt: null,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: updated.workspaceId,
          groupId: updated.groupId,
          resourceType: 'LINK',
          resourceId: updated.id,
          action: 'ACTIVATED',
          beforeData: { status: link.status },
          afterData: { status: updated.status },
          performedByUserId: input.actorUserId,
        },
      });
      return updated;
    });
  }

  async suspendLink(input: Parameters<ExternalTrackingLinkRepository['suspendLink']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    const link = await this.client.externalTrackingLink.findFirst({
      where: {
        id: input.linkId,
        workspaceId: input.workspaceId,
        status: { in: ['DRAFT', 'ACTIVE'] },
        ...(this.serviceId ? { groupId: this.serviceId } : {}),
      },
      select: { id: true, status: true },
    });
    if (!link) return null;
    return this.client.$transaction(async (tx) => {
      const updated = await tx.externalTrackingLink.update({
        where: { id: link.id },
        data: {
          status: 'SUSPENDED',
          suspendedAt: input.now,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: updated.workspaceId,
          groupId: updated.groupId,
          resourceType: 'LINK',
          resourceId: updated.id,
          action: 'SUSPENDED',
          beforeData: { status: link.status },
          afterData: { status: updated.status },
          performedByUserId: input.actorUserId,
        },
      });
      return updated;
    });
  }

  async updateLink(input: Parameters<ExternalTrackingLinkRepository['updateLink']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const link = await tx.externalTrackingLink.findFirst({
        where: {
          id: input.linkId,
          workspaceId: input.workspaceId,
          ...(this.serviceId ? { groupId: this.serviceId } : {}),
          status: { in: ['DRAFT', 'SUSPENDED'] },
        },
      });
      if (!link) return null;
      const domain = await tx.externalTrackingAllowedDomain.findFirst({
        where: {
          id: input.allowedDomainId,
          workspaceId: input.workspaceId,
          groupId: link.groupId,
          systemId: link.systemId,
          status: 'ACTIVE',
        },
      });
      if (!domain) return null;
      const updated = await tx.externalTrackingLink.update({
        where: { id: link.id },
        data: {
          allowedDomainId: domain.id,
          name: input.name,
          url: input.url,
          startsAt: input.startsAt,
          expiresAt: input.expiresAt,
          notes: input.notes,
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: updated.workspaceId,
          groupId: updated.groupId,
          resourceType: 'LINK',
          resourceId: updated.id,
          action: 'UPDATED',
          beforeData: {
            name: link.name,
            allowedDomainId: link.allowedDomainId,
            startsAt: link.startsAt,
            expiresAt: link.expiresAt,
          },
          afterData: {
            name: updated.name,
            allowedDomainId: updated.allowedDomainId,
            startsAt: updated.startsAt,
            expiresAt: updated.expiresAt,
          },
          performedByUserId: input.actorUserId,
        },
      });
      return updated;
    });
  }
}
