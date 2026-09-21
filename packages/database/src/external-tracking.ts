import type {
  ExternalTrackingLinkRepository,
  ExternalTrackingMemberLinkRepository,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';

export class PrismaExternalTrackingLinkRepository
  implements ExternalTrackingLinkRepository, ExternalTrackingMemberLinkRepository
{
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly serviceId?: string,
  ) {}

  private async manage(workspaceId: string, actorUserId: string) {
    const workspaceManager = await this.client.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: actorUserId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
        workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (workspaceManager) return true;
    if (!this.serviceId) return false;
    return Boolean(
      await this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId: this.serviceId,
          userId: actorUserId,
          role: 'MANAGER',
          status: 'ACTIVE',
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      }),
    );
  }

  private serviceMatches(groupId: string) {
    return !this.serviceId || this.serviceId === groupId;
  }

  async listConfiguration(
    input: Parameters<ExternalTrackingLinkRepository['listConfiguration']>[0],
  ) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    if (!this.serviceMatches(input.groupId)) return null;
    const group = await this.client.group.findFirst({
      where: { id: input.groupId, workspaceId: input.workspaceId },
      select: { id: true, name: true, status: true },
    });
    if (!group) return null;
    const [
      systems,
      identities,
      links,
      audits,
      members,
      usages,
      products,
      campaigns,
      results,
      resultTotals,
    ] = await this.client.$transaction([
      this.client.externalTrackingSystem.findMany({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        select: {
          id: true,
          name: true,
          systemType: true,
          externalSystemId: true,
          status: true,
          resultIngestTokenPrefix: true,
          resultIngestTokenCreatedAt: true,
          lastResultReceivedAt: true,
          createdAt: true,
          updatedAt: true,
          allowedDomains: { orderBy: { hostname: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.client.externalTrackingMemberIdentity.findMany({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        include: {
          groupMembership: { select: { id: true, userId: true, role: true, status: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.client.externalTrackingLink.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { not: 'DELETED' },
        },
        include: {
          system: { select: { id: true, name: true, status: true } },
          allowedDomain: { select: { id: true, hostname: true, status: true } },
          memberIdentity: { select: { id: true, groupMembershipId: true } },
          productPack: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.client.externalTrackingAuditLog.findMany({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        orderBy: { performedAt: 'desc' },
        take: 100,
      }),
      this.client.groupMembership.findMany({
        where: { workspaceId: input.workspaceId, groupId: input.groupId, status: 'ACTIVE' },
        select: {
          id: true,
          role: true,
          consentedAt: true,
          user: { select: { id: true, displayName: true, email: true } },
        },
        orderBy: { user: { displayName: 'asc' } },
      }),
      this.client.contentLinkUsage.findMany({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        select: {
          id: true,
          createdAt: true,
          insertedUrlSnapshot: true,
          linkNameSnapshot: true,
          expiresAtSnapshot: true,
          advertisingClassification: true,
          groupMembership: {
            select: { id: true, user: { select: { displayName: true } } },
          },
          productPack: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true } },
          dailyMission: { select: { id: true, missionDate: true, format: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.client.productPack.findMany({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        select: { id: true, name: true, status: true },
        orderBy: { name: 'asc' },
      }),
      this.client.campaign.findMany({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        select: { id: true, name: true, status: true },
        orderBy: { name: 'asc' },
      }),
      this.client.externalTrackingResult.findMany({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        select: {
          id: true,
          externalEventId: true,
          metricType: true,
          count: true,
          amountMinor: true,
          currency: true,
          occurredAt: true,
          receivedAt: true,
          system: { select: { id: true, name: true } },
          externalTrackingLink: { select: { id: true, name: true } },
          memberIdentity: {
            select: {
              groupMembership: { select: { user: { select: { displayName: true } } } },
            },
          },
        },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
      this.client.externalTrackingResult.groupBy({
        by: ['metricType', 'currency'],
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        orderBy: [{ metricType: 'asc' }, { currency: 'asc' }],
        _sum: { count: true, amountMinor: true },
      }),
    ]);
    return {
      group,
      systems,
      identities,
      links: links.map((link) => ({
        ...link,
        effectiveStatus:
          link.status === 'ACTIVE' && link.expiresAt && link.expiresAt <= input.at
            ? 'EXPIRED'
            : link.status,
      })),
      audits,
      members: members.map((member) => ({
        ...member,
        identityConfigured: identities.some(
          (identity) => identity.groupMembershipId === member.id && identity.status === 'ACTIVE',
        ),
        activeLinkCount: links.filter(
          (link) =>
            link.memberIdentity?.groupMembershipId === member.id &&
            link.status === 'ACTIVE' &&
            (!link.expiresAt || link.expiresAt > input.at),
        ).length,
      })),
      usages,
      products,
      campaigns,
      results,
      resultTotals: resultTotals.map((item) => ({
        metricType: item.metricType,
        currency: item.currency,
        count: item._sum?.count ?? 0,
        amountMinor: item._sum?.amountMinor ?? 0,
      })),
    };
  }

  async getAllowedDomain(input: Parameters<ExternalTrackingLinkRepository['getAllowedDomain']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.externalTrackingAllowedDomain.findFirst({
      where: {
        id: input.allowedDomainId,
        workspaceId: input.workspaceId,
        status: 'ACTIVE',
        system: { status: 'ACTIVE', ...(this.serviceId ? { groupId: this.serviceId } : {}) },
      },
      select: {
        id: true,
        hostname: true,
        allowSubdomains: true,
        shortener: true,
        status: true,
      },
    });
  }

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

  async listMemberSettings(
    input: Parameters<ExternalTrackingMemberLinkRepository['listMemberSettings']>[0],
  ) {
    if (!this.serviceMatches(input.groupId)) return null;
    const membership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!membership) return null;
    const [systems, links] = await this.client.$transaction([
      this.client.externalTrackingSystem.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'ACTIVE',
          allowedDomains: { some: { status: 'ACTIVE' } },
        },
        select: {
          id: true,
          name: true,
          allowedDomains: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              hostname: true,
              allowSubdomains: true,
              shortener: true,
              status: true,
            },
            orderBy: { hostname: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.client.externalTrackingLink.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          scopeType: 'MEMBER',
          status: { not: 'DELETED' },
          memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
        },
        select: {
          id: true,
          systemId: true,
          allowedDomainId: true,
          url: true,
          status: true,
          updatedAt: true,
          system: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    return {
      systems: systems.map((system) => ({
        id: system.id,
        name: system.name,
        domains: system.allowedDomains,
      })),
      links: links.map((link) => ({
        id: link.id,
        systemId: link.systemId,
        systemName: link.system.name,
        allowedDomainId: link.allowedDomainId,
        url: link.url,
        status: link.status,
        updatedAt: link.updatedAt,
      })),
    };
  }

  async saveMemberDraft(
    input: Parameters<ExternalTrackingMemberLinkRepository['saveMemberDraft']>[0],
  ) {
    if (!this.serviceMatches(input.groupId)) return null;
    return this.client.$transaction(async (tx) => {
      const membership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
        },
        select: { id: true },
      });
      if (!membership) return null;
      const domain = await tx.externalTrackingAllowedDomain.findFirst({
        where: {
          id: input.allowedDomainId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          systemId: input.systemId,
          status: 'ACTIVE',
          system: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
      if (!domain) return null;
      const identity = await tx.externalTrackingMemberIdentity.upsert({
        where: {
          systemId_groupMembershipId: {
            systemId: input.systemId,
            groupMembershipId: membership.id,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          systemId: input.systemId,
          groupMembershipId: membership.id,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
        update: { status: 'ACTIVE', updatedByUserId: input.actorUserId },
      });
      const active = await tx.externalTrackingLink.findFirst({
        where: {
          systemId: input.systemId,
          memberIdentityId: identity.id,
          scopeType: 'MEMBER',
          status: 'ACTIVE',
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (active?.url === input.url) return active;
      const before = await tx.externalTrackingLink.findFirst({
        where: {
          systemId: input.systemId,
          memberIdentityId: identity.id,
          scopeType: 'MEMBER',
          status: 'DRAFT',
        },
        orderBy: { updatedAt: 'desc' },
      });
      const name = '本人登録の専用URL';
      const saved = before
        ? await tx.externalTrackingLink.update({
            where: { id: before.id },
            data: {
              allowedDomainId: domain.id,
              url: input.url,
              updatedByUserId: input.actorUserId,
            },
          })
        : await tx.externalTrackingLink.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              systemId: input.systemId,
              allowedDomainId: domain.id,
              memberIdentityId: identity.id,
              scopeType: 'MEMBER',
              scopeKey: `MEMBER:${identity.id}`,
              name,
              url: input.url,
              status: 'DRAFT',
              createdByUserId: input.actorUserId,
              updatedByUserId: input.actorUserId,
            },
          });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          resourceType: 'LINK',
          resourceId: saved.id,
          action: before ? 'UPDATED' : 'CREATED',
          beforeData: before
            ? { allowedDomainId: before.allowedDomainId, status: before.status }
            : Prisma.JsonNull,
          afterData: {
            allowedDomainId: saved.allowedDomainId,
            scopeType: saved.scopeType,
            status: saved.status,
            submittedByMember: true,
          },
          performedByUserId: input.actorUserId,
          performedAt: input.now,
        },
      });
      return saved;
    });
  }

  async listResolutionCandidates(
    input: Parameters<ExternalTrackingLinkRepository['listResolutionCandidates']>[0],
  ) {
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!bunshin) return null;
    const membership = await this.client.groupMembership.findFirst({
      where: {
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
      },
    });
    if (!membership) return null;
    const assignment = await this.client.productPackAssignment.findFirst({
      where: {
        bunshinId: input.bunshinId,
        productPackId: input.productPackId,
        status: 'ACTIVE',
        productPack: { groupId: input.groupId },
      },
      select: { id: true },
    });
    if (!assignment) return null;
    if (input.campaignId) {
      const participation = await this.client.campaignParticipation.findFirst({
        where: {
          campaignId: input.campaignId,
          participantWorkspaceId: input.workspaceId,
          userId: input.actorUserId,
          bunshinId: input.bunshinId,
          status: 'ACCEPTED',
          campaign: {
            groupId: input.groupId,
            status: 'OPEN',
            startsAt: { lte: input.at },
            endsAt: { gt: input.at },
            productPackVersion: { productPackId: input.productPackId },
          },
        },
        select: { id: true },
      });
      if (!participation) return null;
    }
    const links = await this.client.externalTrackingLink.findMany({
      where: {
        workspaceId: membership.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        deletedAt: null,
        system: { status: 'ACTIVE' },
        allowedDomain: { status: 'ACTIVE' },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: input.at } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: input.at } }] },
        ],
        OR: [
          { scopeType: 'GROUP' },
          {
            scopeType: 'MEMBER',
            memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
          },
          { scopeType: 'PRODUCT', productPackId: input.productPackId },
          {
            scopeType: 'PRODUCT_MEMBER',
            productPackId: input.productPackId,
            memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
          },
          ...(input.campaignId
            ? [
                { scopeType: 'CAMPAIGN' as const, campaignId: input.campaignId },
                {
                  scopeType: 'CAMPAIGN_MEMBER' as const,
                  campaignId: input.campaignId,
                  memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' as const },
                },
              ]
            : []),
        ],
      },
      include: { system: true, allowedDomain: true, memberIdentity: true },
    });
    return {
      groupMembershipId: membership.id,
      links: links.map((link) => ({
        id: link.id,
        name: link.name,
        groupId: link.groupId,
        scopeType: link.scopeType,
        groupMembershipId: link.memberIdentity?.groupMembershipId ?? null,
        productPackId: link.productPackId,
        campaignId: link.campaignId,
        url: link.url,
        status: link.status,
        startsAt: link.startsAt,
        expiresAt: link.expiresAt,
        systemStatus: link.system.status,
        domain: {
          id: link.allowedDomain.id,
          hostname: link.allowedDomain.hostname,
          allowSubdomains: link.allowedDomain.allowSubdomains,
          shortener: link.allowedDomain.shortener,
          status: link.allowedDomain.status,
        },
      })),
    };
  }
}
