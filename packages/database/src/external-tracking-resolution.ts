import type { ExternalTrackingLinkRepository } from '@bunshin/application';
import type { PrismaClient } from './client';

type ExternalTrackingResolutionContext = {
  client: PrismaClient;
};

export async function listExternalTrackingResolutionCandidates(
  context: ExternalTrackingResolutionContext,
  input: Parameters<ExternalTrackingLinkRepository['listResolutionCandidates']>[0],
) {
  const bunshin = await context.client.bunshin.findFirst({
    where: {
      id: input.bunshinId,
      workspaceId: input.workspaceId,
      ownerUserId: input.actorUserId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (!bunshin) return null;
  const membership = await context.client.groupMembership.findFirst({
    where: {
      groupId: input.groupId,
      userId: input.actorUserId,
      status: 'ACTIVE',
      consentedAt: { not: null },
    },
  });
  if (!membership) return null;
  const assignment = await context.client.productPackAssignment.findFirst({
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
    const participation = await context.client.campaignParticipation.findFirst({
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
  const links = await context.client.externalTrackingLink.findMany({
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
