import type { ExternalTrackingMemberLinkRepository } from '@bunshin/application';
import { Prisma, type PrismaClient } from './client';

type ExternalTrackingMemberContext = {
  client: PrismaClient;
  serviceMatches: (groupId: string) => boolean;
};

export async function listExternalTrackingMemberSettings(
  context: ExternalTrackingMemberContext,
  input: Parameters<ExternalTrackingMemberLinkRepository['listMemberSettings']>[0],
) {
  if (!context.serviceMatches(input.groupId)) return null;
  const membership = await context.client.groupMembership.findFirst({
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
  const [systems, links] = await context.client.$transaction([
    context.client.externalTrackingSystem.findMany({
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
    context.client.externalTrackingLink.findMany({
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

export async function saveExternalTrackingMemberDraft(
  context: ExternalTrackingMemberContext,
  input: Parameters<ExternalTrackingMemberLinkRepository['saveMemberDraft']>[0],
) {
  if (!context.serviceMatches(input.groupId)) return null;
  return context.client.$transaction(async (tx) => {
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
