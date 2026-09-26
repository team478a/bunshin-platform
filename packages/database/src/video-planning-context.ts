import type { VideoPlanningContextRepository } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';

export class PrismaVideoPlanningContextRepository implements VideoPlanningContextRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findAuthorized(input: Parameters<VideoPlanningContextRepository['findAuthorized']>[0]) {
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { not: 'ARCHIVED' },
        videoProjects: {
          some: {
            id: input.videoProjectId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            ownerUserId: input.actorUserId,
          },
        },
      },
      include: { personality: true },
    });
    if (!bunshin) return null;
    const project = await this.client.videoProject.findFirst({
      where: {
        id: input.videoProjectId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        bunshinId: input.bunshinId,
        campaignId: input.campaignId,
      },
      select: { characterProfileSnapshot: true, characterReferenceSnapshot: true },
    });
    if (!project) return null;
    const characterSnapshot =
      project.characterProfileSnapshot !== null &&
      typeof project.characterProfileSnapshot === 'object' &&
      !Array.isArray(project.characterProfileSnapshot)
        ? (project.characterProfileSnapshot as Record<string, unknown>)
        : {};
    const referenceSnapshot = Array.isArray(project.characterReferenceSnapshot)
      ? project.characterReferenceSnapshot
      : [];
    const safetyRules = Array.isArray(characterSnapshot.safetyRules)
      ? characterSnapshot.safetyRules.filter((item): item is string => typeof item === 'string')
      : [];
    const character =
      typeof characterSnapshot.name === 'string' &&
      typeof characterSnapshot.appearance === 'string' &&
      typeof characterSnapshot.worldSetting === 'string'
        ? {
            name: characterSnapshot.name,
            appearance: characterSnapshot.appearance,
            worldSetting: characterSnapshot.worldSetting,
            safetyRules,
            referenceImageCount: referenceSnapshot.length,
          }
        : null;

    const now = new Date();
    const userAssets = await this.client.videoAsset.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        status: 'READY',
        kind: { in: ['IMAGE', 'VIDEO', 'LOGO'] },
        AND: [
          { OR: [{ videoProjectId: null }, { videoProjectId: input.videoProjectId }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    let product = null;
    let approvedAssets: Array<{ assetId: string; description: string }> = [];
    if (input.campaignId) {
      const campaign = await this.client.campaign.findFirst({
        where: {
          id: input.campaignId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'OPEN',
          startsAt: { lte: now },
          endsAt: { gt: now },
          group: {
            status: 'ACTIVE',
            memberships: {
              some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
            },
          },
          participations: {
            some: {
              participantWorkspaceId: input.workspaceId,
              userId: input.actorUserId,
              bunshinId: input.bunshinId,
              status: 'ACCEPTED',
            },
          },
          productPackVersion: {
            status: 'PUBLISHED',
            assignments: { some: { bunshinId: input.bunshinId, status: 'ACTIVE' } },
          },
        },
        include: {
          productPackVersion: {
            include: {
              productPack: true,
              rules: { orderBy: { sortOrder: 'asc' } },
            },
          },
          assets: { include: { productPackAsset: true }, orderBy: { sortOrder: 'asc' } },
        },
      });
      if (!campaign) return null;
      const facts = campaign.productPackVersion.facts as Record<string, unknown>;
      product = {
        name: campaign.productPackVersion.productPack.name,
        facts: [
          campaign.productPackVersion.summary,
          ...Object.entries(facts).map(([key, value]) => `${key}: ${String(value)}`),
        ],
        requiredDisclosures: campaign.productPackVersion.rules
          .filter((rule) => rule.type === 'REQUIRED_DISCLOSURE')
          .map((rule) => rule.value),
        prohibitedExpressions: campaign.productPackVersion.rules
          .filter((rule) => rule.type === 'FORBIDDEN_EXPRESSION')
          .map((rule) => rule.value),
      };
      approvedAssets = campaign.assets
        .filter(({ productPackAsset }) =>
          productPackAsset.validUntil ? productPackAsset.validUntil > now : true,
        )
        .map(({ productPackAsset }) => ({
          assetId: productPackAsset.id,
          description: `${productPackAsset.label}（${productPackAsset.usageTerms}）`,
        }));
    }

    return {
      objective: bunshin.objectiveSummary,
      audience: bunshin.audienceSummary,
      personality: {
        tone: bunshin.personality?.tone ?? bunshin.personalitySummary,
        preferredExpressions:
          (bunshin.personality?.preferredExpressions as string[] | undefined) ?? [],
        prohibitedExpressions:
          (bunshin.personality?.forbiddenExpressions as string[] | undefined) ?? [],
      },
      character,
      product,
      approvedAssets,
      userAssets: userAssets.map((asset) => ({
        assetId: asset.id,
        kind: asset.kind as 'IMAGE' | 'VIDEO' | 'LOGO',
        description: `${asset.originalFilename}${asset.usageTerms ? `（${asset.usageTerms}）` : ''}`,
      })),
    };
  }
}
