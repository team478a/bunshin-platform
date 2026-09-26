import { businessGrowthActionForMission } from '@bunshin/application';
import type { LineMissionNotificationSummaryRepository } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';

export class PrismaLineMissionNotificationSummaryRepository implements LineMissionNotificationSummaryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async resolve(input: Parameters<LineMissionNotificationSummaryRepository['resolve']>[0]) {
    const mission = await this.client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        bunshin: {
          status: { not: 'ARCHIVED' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
          OR: [
            { ownerUserId: input.actorUserId },
            {
              workspace: {
                memberships: {
                  some: {
                    userId: input.actorUserId,
                    status: 'ACTIVE',
                    role: { in: ['OWNER', 'ADMIN'] },
                  },
                },
              },
            },
          ],
        },
        socialProfile: { is: { status: 'ACTIVE' } },
        OR: [
          { campaignId: null },
          {
            campaign: {
              is: {
                status: 'OPEN',
                startsAt: { lte: new Date() },
                endsAt: { gt: new Date() },
                group: {
                  status: 'ACTIVE',
                  memberships: {
                    some: {
                      userId: input.actorUserId,
                      status: 'ACTIVE',
                      consentedAt: { not: null },
                    },
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
                  assignments: {
                    some: { bunshinId: input.bunshinId, status: 'ACTIVE' },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        missionDate: true,
        format: true,
        estimatedMinutes: true,
        topic: true,
        trendContext: { select: { id: true } },
        socialProfile: { select: { platform: true } },
        classification: true,
        campaign: { select: { name: true } },
        contentLinkUsage: { select: { id: true } },
        bunshin: { select: { groupId: true } },
      },
    });
    if (!mission?.socialProfile) return null;
    const businessProfile = mission.bunshin.groupId
      ? await this.client.serviceMemberBusinessProfile.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: mission.bunshin.groupId,
            userId: input.actorUserId,
            groupMembership: { status: 'ACTIVE' },
          },
          select: { id: true, createdAt: true },
        })
      : null;
    return {
      platform: mission.socialProfile.platform,
      format: mission.format,
      estimatedMinutes: mission.estimatedMinutes,
      topic: mission.topic,
      researched: mission.trendContext !== null,
      ...(businessProfile
        ? {
            businessAction: businessGrowthActionForMission({
              missionDate: mission.missionDate.toISOString().slice(0, 10),
              topic: mission.topic,
              programStartedAt: businessProfile.createdAt,
            }),
          }
        : {}),
      ...(mission.contentLinkUsage ? { externalLinkIncluded: true } : {}),
      ...(mission.campaign && mission.classification !== 'ORGANIC'
        ? { campaign: { name: mission.campaign.name, classification: mission.classification } }
        : {}),
    };
  }
}
