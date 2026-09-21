import { createHash } from 'node:crypto';
import type {
  AdvertisingSafetyRepository,
  CampaignPlanningContext,
  CampaignRepository,
  CampaignSafetyRepository,
} from '@bunshin/application';
import { type Prisma, type PrismaClient, prisma } from './client';

export class PrismaAdvertisingSafetyRepository implements AdvertisingSafetyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  hashContent(content: string) {
    return createHash('sha256').update(content).digest('hex');
  }

  private bunshin(input: { workspaceId: string; bunshinId: string; actorUserId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
        workspace: { type: 'PERSONAL', status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  async listEvidence(input: Parameters<AdvertisingSafetyRepository['listEvidence']>[0]) {
    if (!(await this.bunshin(input))) return null;
    return this.client.userEvidence.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createEvidence(input: Parameters<AdvertisingSafetyRepository['createEvidence']>[0]) {
    if (!(await this.bunshin(input))) return null;
    return this.client.userEvidence.create({
      data: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        type: input.type,
        title: input.title,
        claim: input.claim,
        sourceUrl: input.sourceUrl,
        occurredAt: input.occurredAt,
        createdByUserId: input.actorUserId,
      },
    });
  }

  async revokeEvidence(input: Parameters<AdvertisingSafetyRepository['revokeEvidence']>[0]) {
    if (!(await this.bunshin(input))) return null;
    const evidence = await this.client.userEvidence.findFirst({
      where: {
        id: input.evidenceId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
      },
    });
    if (!evidence) return null;
    return this.client.userEvidence.update({
      where: { id: evidence.id },
      data: { status: 'REVOKED', revokedAt: input.revokedAt },
    });
  }

  async prepareReview(input: Parameters<AdvertisingSafetyRepository['prepareReview']>[0]) {
    if (!(await this.bunshin(input))) return null;
    if (input.dailyMissionId) {
      const mission = await this.client.dailyMission.findFirst({
        where: {
          id: input.dailyMissionId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
        },
        select: { id: true },
      });
      if (!mission) return null;
    }
    const evidence = await this.client.userEvidence.findMany({
      where: {
        id: { in: input.evidenceIds },
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (evidence.length !== input.evidenceIds.length) return null;
    if (!input.productPackVersionId)
      return {
        productPackVersionId: null,
        facts: {},
        rules: [],
        evidenceIds: evidence.map((item) => item.id),
      };
    const assignment = await this.client.productPackAssignment.findFirst({
      where: {
        bunshinId: input.bunshinId,
        productPackVersionId: input.productPackVersionId,
        status: 'ACTIVE',
        bunshin: { workspaceId: input.workspaceId, ownerUserId: input.actorUserId },
        productPack: {
          status: 'ACTIVE',
          group: {
            memberships: {
              some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
            },
          },
        },
        productPackVersion: { status: 'PUBLISHED' },
      },
      include: { productPackVersion: { include: { rules: { orderBy: { sortOrder: 'asc' } } } } },
    });
    if (!assignment) return null;
    const facts = assignment.productPackVersion.facts;
    if (!facts || Array.isArray(facts) || typeof facts !== 'object') return null;
    return {
      productPackVersionId: assignment.productPackVersionId,
      facts: facts as Record<string, string>,
      rules: assignment.productPackVersion.rules.map((rule) => ({
        type: rule.type,
        value: rule.value,
        condition: rule.condition,
      })),
      evidenceIds: evidence.map((item) => item.id),
    };
  }

  async saveReview(input: Parameters<AdvertisingSafetyRepository['saveReview']>[0]) {
    if (!(await this.bunshin(input))) return null;
    return this.client.advertisingSafetyReview.create({
      data: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
        productPackVersionId: input.productPackVersionId,
        classification: input.classification,
        evidenceRequirement: input.evidenceRequirement,
        evidenceIds: input.evidenceIds,
        officialClaims: input.officialClaims,
        requiredDisclosures: input.requiredDisclosures,
        issueCodes: input.issueCodes,
        verdict: input.verdict,
        contentHash: input.contentHash,
        reviewedByUserId: input.actorUserId,
      },
    });
  }

  async listReviews(input: Parameters<AdvertisingSafetyRepository['listReviews']>[0]) {
    if (!(await this.bunshin(input))) return null;
    return this.client.advertisingSafetyReview.findMany({
      where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
      orderBy: { reviewedAt: 'desc' },
      take: 100,
    });
  }
}

type CampaignPlanningRow = Prisma.CampaignGetPayload<{
  include: {
    productPackVersion: { include: { rules: true } };
    assets: { include: { productPackAsset: true } };
  };
}>;

export class PrismaCampaignRepository implements CampaignRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async manage(workspaceId: string, actorUserId: string, groupId?: string) {
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
    if (!groupId) return false;
    return Boolean(
      await this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          status: 'ACTIVE',
          OR: [
            { role: 'MANAGER' },
            {
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR'] },
              group: { serviceConfiguration: { isNot: null } },
            },
          ],
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      }),
    );
  }

  async listManaged(input: Parameters<CampaignRepository['listManaged']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    const campaigns = await this.client.campaign.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.groupId ? { groupId: input.groupId } : {}),
      },
      include: {
        group: { select: { name: true } },
        productPackVersion: {
          select: { version: true, productPack: { select: { name: true } } },
        },
        assets: { include: { productPackAsset: true }, orderBy: { sortOrder: 'asc' } },
        participations: { select: { status: true } },
        dailyMissions: {
          select: {
            decision: { select: { decision: true } },
            activities: {
              where: {
                type: {
                  in: ['COPIED_TEXT', 'COPIED_SLIDE', 'COPIED_VIDEO_PROMPT', 'COPIED_SCRIPT'],
                },
              },
              select: { id: true },
            },
            postRecord: { select: { id: true } },
            feedback: { select: { rating: true } },
          },
        },
        _count: {
          select: {
            similarityReviews: { where: { verdict: 'POSSIBLE_DUPLICATE' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return campaigns.map(({ dailyMissions, ...campaign }) => ({
      ...campaign,
      metrics: {
        generated: dailyMissions.length,
        accepted: dailyMissions.filter(({ decision }) => decision?.decision === 'ACCEPTED').length,
        copied: dailyMissions.filter(({ activities }) => activities.length > 0).length,
        posted: dailyMissions.filter(({ postRecord }) => postRecord !== null).length,
        feedbackGood: dailyMissions.filter(({ feedback }) => feedback?.rating === 'GOOD').length,
        duplicateRejected: campaign._count.similarityReviews,
      },
    }));
  }

  async createDraft(input: Parameters<CampaignRepository['createDraft']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.$transaction(async (tx) => {
      const version = await tx.productPackVersion.findFirst({
        where: {
          id: input.productPackVersionId,
          status: 'PUBLISHED',
          productPack: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            status: 'ACTIVE',
            group: { status: 'ACTIVE' },
          },
        },
        select: { id: true },
      });
      if (!version) return null;
      const assets = await tx.productPackAsset.findMany({
        where: { id: { in: input.assetIds }, productPackVersionId: version.id },
        select: { id: true },
      });
      if (assets.length !== input.assetIds.length) return null;
      const campaign = await tx.campaign.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          productPackVersionId: version.id,
          name: input.name,
          theme: input.theme,
          targetSummary: input.targetSummary,
          participationLimit: input.participationLimit,
          maxRelatedPerWeek: input.maxRelatedPerWeek,
          maxAdsPerWeek: input.maxAdsPerWeek,
          cooldownDays: input.cooldownDays,
          generationLimitPerParticipant: input.generationLimitPerParticipant,
          similarityThresholdBasisPoints: input.similarityThresholdBasisPoints,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          createdByUserId: input.actorUserId,
          assets: {
            create: input.assetIds.map((productPackAssetId, sortOrder) => ({
              productPackAssetId,
              sortOrder,
            })),
          },
        },
      });
      await tx.campaignActivity.create({
        data: {
          campaignId: campaign.id,
          actorUserId: input.actorUserId,
          action: 'CREATED',
          toStatus: 'DRAFT',
        },
      });
      return campaign;
    });
  }

  async transition(input: Parameters<CampaignRepository['transition']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.$transaction(async (tx) => {
      const changed = await tx.campaign.updateMany({
        where: {
          id: input.campaignId,
          workspaceId: input.workspaceId,
          ...(input.groupId ? { groupId: input.groupId } : {}),
          status: input.from,
          ...(input.to === 'OPEN' ? { endsAt: { gt: input.now } } : {}),
        },
        data: {
          status: input.to,
          ...(input.to === 'OPEN' ? { openedAt: input.now } : {}),
          ...(input.to === 'CLOSED' ? { closedAt: input.now } : {}),
          ...(input.to === 'CANCELLED' ? { cancelledAt: input.now } : {}),
        },
      });
      if (changed.count !== 1) return null;
      await tx.campaignActivity.create({
        data: {
          campaignId: input.campaignId,
          actorUserId: input.actorUserId,
          action: input.to === 'OPEN' ? 'OPENED' : input.to === 'CLOSED' ? 'CLOSED' : 'CANCELLED',
          fromStatus: input.from,
          toStatus: input.to,
          reason: input.reason,
        },
      });
      return tx.campaign.findUnique({ where: { id: input.campaignId } });
    });
  }

  private participant(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
        workspace: { type: 'PERSONAL', status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  async listAvailable(input: Parameters<CampaignRepository['listAvailable']>[0]) {
    if (!(await this.participant(input))) return null;
    return this.client.campaign.findMany({
      where: {
        status: 'OPEN',
        startsAt: { lte: input.now },
        endsAt: { gt: input.now },
        group: {
          status: 'ACTIVE',
          memberships: {
            some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
          },
        },
        productPackVersion: {
          assignments: {
            some: { bunshinId: input.bunshinId, status: 'ACTIVE' },
          },
        },
      },
      include: {
        group: { select: { name: true } },
        productPackVersion: {
          select: { version: true, productPack: { select: { name: true } } },
        },
        assets: { include: { productPackAsset: true }, orderBy: { sortOrder: 'asc' } },
        participations: { where: { userId: input.actorUserId } },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async decide(input: Parameters<CampaignRepository['decide']>[0]) {
    if (!(await this.participant(input))) return null;
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.campaignId}::text, 0))`;
      const campaign = await tx.campaign.findFirst({
        where: {
          id: input.campaignId,
          status: 'OPEN',
          startsAt: { lte: input.now },
          endsAt: { gt: input.now },
          group: {
            status: 'ACTIVE',
            memberships: {
              some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
            },
          },
          productPackVersion: {
            assignments: { some: { bunshinId: input.bunshinId, status: 'ACTIVE' } },
          },
        },
      });
      if (!campaign) return null;
      const previous = await tx.campaignParticipation.findUnique({
        where: { campaignId_userId: { campaignId: campaign.id, userId: input.actorUserId } },
      });
      if (input.decision === 'WITHDRAWN' && previous?.status !== 'ACCEPTED') return null;
      if (input.decision === 'ACCEPTED' && previous?.status !== 'ACCEPTED') {
        const accepted = await tx.campaignParticipation.count({
          where: { campaignId: campaign.id, status: 'ACCEPTED' },
        });
        if (accepted >= campaign.participationLimit) return null;
      }
      const timestamps = {
        consentedAt: input.decision === 'ACCEPTED' ? input.now : null,
        declinedAt: input.decision === 'DECLINED' ? input.now : null,
        heldAt: input.decision === 'ON_HOLD' ? input.now : null,
        withdrawnAt: input.decision === 'WITHDRAWN' ? input.now : null,
      };
      const participation = await tx.campaignParticipation.upsert({
        where: { campaignId_userId: { campaignId: campaign.id, userId: input.actorUserId } },
        create: {
          campaignId: campaign.id,
          participantWorkspaceId: input.workspaceId,
          userId: input.actorUserId,
          bunshinId: input.bunshinId,
          status: input.decision,
          ...timestamps,
        },
        update: { status: input.decision, bunshinId: input.bunshinId, ...timestamps },
      });
      const action = {
        ACCEPTED: 'ACCEPTED',
        DECLINED: 'DECLINED',
        ON_HOLD: 'HELD',
        WITHDRAWN: 'WITHDRAWN',
      } as const;
      await tx.campaignActivity.create({
        data: {
          campaignId: campaign.id,
          actorUserId: input.actorUserId,
          action: action[input.decision],
          fromStatus: previous?.status ?? null,
          toStatus: input.decision,
          reason: input.reason,
        },
      });
      return participation;
    });
  }

  private planningWhere(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    campaignId?: string;
    from: Date;
    to: Date;
  }): Prisma.CampaignWhereInput {
    return {
      ...(input.campaignId ? { id: input.campaignId } : {}),
      ...(input.groupId ? { groupId: input.groupId } : {}),
      status: 'OPEN',
      startsAt: { lte: input.to },
      endsAt: { gt: input.from },
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
    };
  }

  private planningContext(row: CampaignPlanningRow): CampaignPlanningContext {
    return {
      id: row.id,
      name: row.name,
      theme: row.theme,
      targetSummary: row.targetSummary,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      maxRelatedPerWeek: row.maxRelatedPerWeek,
      maxAdsPerWeek: row.maxAdsPerWeek,
      cooldownDays: row.cooldownDays,
      productPack: {
        productPackId: row.productPackVersion.productPackId,
        groupId: row.groupId,
        versionId: row.productPackVersion.id,
        version: row.productPackVersion.version,
        allowLinklessPosts: row.productPackVersion.allowLinklessPosts,
        summary: row.productPackVersion.summary,
        providerName: row.productPackVersion.providerName,
        targetCustomer: row.productPackVersion.targetCustomer,
        facts: row.productPackVersion.facts as Record<string, string>,
        rules: row.productPackVersion.rules,
        assets: row.assets.map(({ productPackAsset }) => productPackAsset),
      },
    };
  }

  private planningRows(where: Prisma.CampaignWhereInput) {
    return this.client.campaign.findMany({
      where,
      include: {
        productPackVersion: { include: { rules: { orderBy: { sortOrder: 'asc' } } } },
        assets: { include: { productPackAsset: true }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
  }

  async listPlanningContexts(input: Parameters<CampaignRepository['listPlanningContexts']>[0]) {
    if (!(await this.planningParticipant(input))) return null;
    const rows = await this.planningRows(this.planningWhere(input));
    return rows.map((row) => this.planningContext(row));
  }

  async resolvePlanningContext(input: Parameters<CampaignRepository['resolvePlanningContext']>[0]) {
    if (!(await this.planningParticipant(input))) return null;
    const rows = await this.planningRows(
      this.planningWhere({ ...input, from: input.at, to: input.at }),
    );
    return rows[0] ? this.planningContext(rows[0]) : null;
  }

  private async planningParticipant(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }) {
    const personal = await this.participant(input);
    if (personal || !input.groupId) return personal;
    return this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
        group: {
          status: 'ACTIVE',
          memberships: {
            some: { userId: input.actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
          },
        },
      },
      select: { id: true },
    });
  }
}

export class PrismaCampaignSafetyRepository implements CampaignSafetyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private eligible(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    campaignId: string;
    at: Date;
  }): Prisma.CampaignWhereInput {
    return {
      id: input.campaignId,
      status: 'OPEN',
      startsAt: { lte: input.at },
      endsAt: { gt: input.at },
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
    };
  }

  async inspect(input: Parameters<CampaignSafetyRepository['inspect']>[0]) {
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
        workspace: { type: 'PERSONAL', status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!bunshin) return null;
    const campaign = await this.client.campaign.findFirst({
      where: this.eligible(input),
      select: {
        generationLimitPerParticipant: true,
        similarityThresholdBasisPoints: true,
        similarityReviews: {
          where: { verdict: 'UNIQUE' },
          select: { simhash: true },
          orderBy: { createdAt: 'desc' },
          take: 500,
        },
        _count: { select: { dailyMissions: { where: { bunshinId: input.bunshinId } } } },
      },
    });
    if (!campaign) return null;
    return {
      generationLimit: campaign.generationLimitPerParticipant,
      generatedCount: campaign._count.dailyMissions,
      similarityThresholdBasisPoints: campaign.similarityThresholdBasisPoints,
      candidates: campaign.similarityReviews,
    };
  }

  async record(input: Parameters<CampaignSafetyRepository['record']>[0]) {
    if (input.dailyMissionId) {
      const mission = await this.client.dailyMission.findFirst({
        where: {
          id: input.dailyMissionId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          campaignId: input.campaignId,
          bunshin: { ownerUserId: input.actorUserId },
        },
        select: { id: true },
      });
      if (!mission) return null;
    } else {
      const eligible = await this.inspect(input);
      if (!eligible) return null;
    }
    return this.client.campaignSimilarityReview.create({
      data: {
        campaignId: input.campaignId,
        dailyMissionId: input.dailyMissionId,
        participantWorkspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        contentFingerprint: input.contentFingerprint,
        simhash: input.simhash,
        maxSimilarityBasisPoints: input.maxSimilarityBasisPoints,
        verdict: input.verdict,
      },
    });
  }
}
