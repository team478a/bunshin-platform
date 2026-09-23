import type {
  ExternalTrackingLinkRepository,
  ExternalTrackingMemberLinkRepository,
} from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
import { PrismaExternalTrackingAdminCommands } from './external-tracking-admin';
import {
  listExternalTrackingMemberSettings,
  saveExternalTrackingMemberDraft,
} from './external-tracking-member';
import { listExternalTrackingResolutionCandidates } from './external-tracking-resolution';

export class PrismaExternalTrackingLinkRepository
  implements ExternalTrackingLinkRepository, ExternalTrackingMemberLinkRepository
{
  private readonly adminCommands: PrismaExternalTrackingAdminCommands;

  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly serviceId?: string,
  ) {
    this.adminCommands = new PrismaExternalTrackingAdminCommands(
      this.client,
      this.serviceId,
      (workspaceId, actorUserId) => this.manage(workspaceId, actorUserId),
      (groupId) => this.serviceMatches(groupId),
    );
  }

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
    return this.adminCommands.createSystem(input);
  }

  async addAllowedDomain(input: Parameters<ExternalTrackingLinkRepository['addAllowedDomain']>[0]) {
    return this.adminCommands.addAllowedDomain(input);
  }

  async upsertMemberIdentity(
    input: Parameters<ExternalTrackingLinkRepository['upsertMemberIdentity']>[0],
  ) {
    return this.adminCommands.upsertMemberIdentity(input);
  }

  async createLink(input: Parameters<ExternalTrackingLinkRepository['createLink']>[0]) {
    return this.adminCommands.createLink(input);
  }

  async activateLink(input: Parameters<ExternalTrackingLinkRepository['activateLink']>[0]) {
    return this.adminCommands.activateLink(input);
  }

  async suspendLink(input: Parameters<ExternalTrackingLinkRepository['suspendLink']>[0]) {
    return this.adminCommands.suspendLink(input);
  }

  async updateLink(input: Parameters<ExternalTrackingLinkRepository['updateLink']>[0]) {
    return this.adminCommands.updateLink(input);
  }

  async listMemberSettings(
    input: Parameters<ExternalTrackingMemberLinkRepository['listMemberSettings']>[0],
  ) {
    return listExternalTrackingMemberSettings(
      {
        client: this.client,
        serviceMatches: (groupId) => this.serviceMatches(groupId),
      },
      input,
    );
  }

  async saveMemberDraft(
    input: Parameters<ExternalTrackingMemberLinkRepository['saveMemberDraft']>[0],
  ) {
    return saveExternalTrackingMemberDraft(
      {
        client: this.client,
        serviceMatches: (groupId) => this.serviceMatches(groupId),
      },
      input,
    );
  }

  async listResolutionCandidates(
    input: Parameters<ExternalTrackingLinkRepository['listResolutionCandidates']>[0],
  ) {
    return listExternalTrackingResolutionCandidates({ client: this.client }, input);
  }
}
