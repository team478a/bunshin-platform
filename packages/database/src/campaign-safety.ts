import type { CampaignSafetyRepository } from '@bunshin/application';
import { type Prisma, type PrismaClient, prisma } from './client';

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
