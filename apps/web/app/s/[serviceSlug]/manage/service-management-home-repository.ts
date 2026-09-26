import { currentAiProviderEnvironment } from '../../../../src/ai/secure-provider-configuration';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';

export async function readServiceManagementHomeRecords({
  workspaceId,
  serviceId,
}: {
  workspaceId: string;
  serviceId: string;
}) {
  const db = await import('@bunshin/database');
  const group = await db.prisma.group.findFirst({
    where: {
      workspaceId: workspaceId,
      id: serviceId,
      status: 'ACTIVE',
    },
    select: {
      memberships: {
        where: { status: 'ACTIVE', serviceRole: 'PARTICIPANT' },
        select: { id: true, userId: true, createdAt: true },
      },
      serviceLegalDocuments: {
        where: { status: 'PUBLISHED' },
        select: { type: true },
      },
      featurePolicies: {
        where: { status: 'ENABLED', feature: { status: 'ACTIVE' } },
        select: { id: true },
      },
      knowledgeSources: {
        where: { status: 'ACTIVE', productPackVersionId: null },
        select: { id: true },
      },
      lineChannelConfigurations: {
        where: { environment: currentLineEnvironment(), status: 'ACTIVE' },
        select: { id: true, lastVerifiedAt: true, lastErrorCategory: true, globallyPaused: true },
        take: 1,
      },
      lineRoutingPolicies: {
        where: { environment: currentLineEnvironment() },
        select: { mode: true, pilotEnabled: true },
        take: 1,
      },
      fortuneServiceSetting: { select: { id: true } },
    },
  });
  if (!group) return null;
  const line = group.lineChannelConfigurations[0];
  const linePolicy = group.lineRoutingPolicies[0];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twentyEightDaysAgo = new Date(now.getTime() - 28 * 86_400_000);
  const missionScope = {
    workspaceId: workspaceId,
    bunshin: { is: { groupId: serviceId } },
  };
  const [
    activeProductPackCount,
    activeCampaignCount,
    activeTrackingLinkCount,
    trendProviderReadyCount,
    productMissions,
    linkedProductMissions,
    copiedProductMissions,
    postedProductMissions,
    recentPostedForFeedback,
    recentFeedback,
    pendingPostApprovalCount,
    missionsCreated,
    acceptedMissions,
    rejectedMissions,
    copiedMissions,
    postedMissions,
    trendMissions,
    successfulAiCalls,
    failedAiCalls,
    knowledgeReviewCount,
    knowledgeFailedCount,
    failedVideoRenders,
    sentLineDeliveries,
    failedLineDeliveries,
    overdueLineDeliveries,
    generationProviderReadyCount,
    sharedLineReadyCount,
    dedicatedRichMenuPublishCount,
  ] = await Promise.all([
    db.prisma.productPack.count({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        status: 'ACTIVE',
        versions: {
          some: {
            status: 'PUBLISHED',
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
              { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
            ],
          },
        },
      },
    }),
    db.prisma.campaign.count({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        status: 'OPEN',
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
    }),
    db.prisma.externalTrackingLink.count({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        status: 'ACTIVE',
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
    }),
    db.prisma.aiProviderConfiguration.count({
      where: {
        environment: currentAiProviderEnvironment(),
        provider: { in: ['GROK', 'EXA', 'FIRECRAWL'] },
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    }),
    db.prisma.dailyMission.count({
      where: {
        ...missionScope,
        campaignId: { not: null },
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    db.prisma.contentLinkUsage.count({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    db.prisma.missionActivity.count({
      where: {
        ...missionScope,
        occurredAt: { gte: sevenDaysAgo },
        type: {
          in: [
            'COPIED_TEXT',
            'COPIED_SLIDE',
            'COPIED_IMAGE_INSTRUCTION',
            'COPIED_VIDEO_PROMPT',
            'COPIED_SCRIPT',
          ],
        },
        dailyMission: { is: { contentLinkUsage: { isNot: null } } },
      },
    }),
    db.prisma.postRecord.count({
      where: {
        ...missionScope,
        postedAt: { gte: sevenDaysAgo },
        dailyMission: { is: { contentLinkUsage: { isNot: null } } },
      },
    }),
    db.prisma.postRecord.count({
      where: { ...missionScope, postedAt: { gte: twentyEightDaysAgo } },
    }),
    db.prisma.missionFeedback.findMany({
      where: {
        ...missionScope,
        dailyMission: {
          is: { postRecord: { is: { postedAt: { gte: twentyEightDaysAgo } } } },
        },
      },
      select: { rating: true },
    }),
    db.prisma.campaignPostingApprovalRequest.count({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        status: 'PENDING',
      },
    }),
    db.prisma.dailyMission.count({
      where: { ...missionScope, createdAt: { gte: sevenDaysAgo } },
    }),
    db.prisma.missionDecision.count({
      where: {
        ...missionScope,
        decision: 'ACCEPTED',
        decidedAt: { gte: sevenDaysAgo },
      },
    }),
    db.prisma.missionDecision.count({
      where: {
        ...missionScope,
        decision: 'REJECTED',
        decidedAt: { gte: sevenDaysAgo },
      },
    }),
    db.prisma.missionActivity.count({
      where: {
        ...missionScope,
        occurredAt: { gte: sevenDaysAgo },
        type: {
          in: [
            'COPIED_TEXT',
            'COPIED_SLIDE',
            'COPIED_IMAGE_INSTRUCTION',
            'COPIED_VIDEO_PROMPT',
            'COPIED_SCRIPT',
          ],
        },
      },
    }),
    db.prisma.postRecord.count({
      where: { ...missionScope, postedAt: { gte: sevenDaysAgo } },
    }),
    db.prisma.missionTrendContext.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
        dailyMission: { is: missionScope },
      },
    }),
    db.prisma.aiUsageEvent.count({
      where: {
        workspaceId: workspaceId,
        occurredAt: { gte: sevenDaysAgo },
        status: 'SUCCESS',
        bunshin: { is: { groupId: serviceId } },
      },
    }),
    db.prisma.aiUsageEvent.count({
      where: {
        workspaceId: workspaceId,
        occurredAt: { gte: sevenDaysAgo },
        status: 'FAILED',
        bunshin: { is: { groupId: serviceId } },
      },
    }),
    db.prisma.groupKnowledgeSource.count({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        status: 'REVIEW_REQUIRED',
      },
    }),
    db.prisma.groupKnowledgeSource.count({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        status: 'FAILED',
      },
    }),
    db.prisma.videoRender.count({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        status: 'FAILED',
      },
    }),
    db.prisma.lineMessageDelivery.count({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        environment: currentLineEnvironment(),
        status: 'SENT',
        sentAt: { gte: sevenDaysAgo },
      },
    }),
    db.prisma.lineMessageDelivery.count({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        environment: currentLineEnvironment(),
        status: 'FAILED',
        updatedAt: { gte: sevenDaysAgo },
      },
    }),
    db.prisma.lineMessageDelivery.count({
      where: {
        workspaceId: workspaceId,
        groupId: serviceId,
        environment: currentLineEnvironment(),
        status: 'PENDING',
        scheduledAt: { lt: now },
      },
    }),
    db.prisma.aiProviderConfiguration.count({
      where: {
        environment: currentAiProviderEnvironment(),
        provider: 'OPENAI',
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    }),
    db.prisma.lineChannelConfiguration.count({
      where: {
        environment: currentLineEnvironment(),
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    }),
    line
      ? db.prisma.groupLineConfigurationAudit.count({
          where: {
            workspaceId: workspaceId,
            groupId: serviceId,
            configurationId: line.id,
            environment: currentLineEnvironment(),
            action: 'RICH_MENU_PUBLISH',
          },
        })
      : Promise.resolve(0),
  ]);
  return {
    group,
    line,
    linePolicy,
    now,
    sevenDaysAgo,
    activeProductPackCount,
    activeCampaignCount,
    activeTrackingLinkCount,
    trendProviderReadyCount,
    productMissions,
    linkedProductMissions,
    copiedProductMissions,
    postedProductMissions,
    recentPostedForFeedback,
    recentFeedback,
    pendingPostApprovalCount,
    missionsCreated,
    acceptedMissions,
    rejectedMissions,
    copiedMissions,
    postedMissions,
    trendMissions,
    successfulAiCalls,
    failedAiCalls,
    knowledgeReviewCount,
    knowledgeFailedCount,
    failedVideoRenders,
    sentLineDeliveries,
    failedLineDeliveries,
    overdueLineDeliveries,
    generationProviderReadyCount,
    sharedLineReadyCount,
    dedicatedRichMenuPublishCount,
  };
}

export async function readServiceBusinessActivity({
  workspaceId,
  serviceId,
  participantIds,
  enabled,
  now,
}: {
  workspaceId: string;
  serviceId: string;
  participantIds: string[];
  enabled: boolean;
  now: Date;
}) {
  if (!enabled || participantIds.length === 0) {
    return { businessActivityRows: [], businessLineOpenRows: [], businessOutcomePosts: [] };
  }
  const db = await import('@bunshin/database');
  const missionScope = {
    workspaceId,
    bunshin: { is: { groupId: serviceId } },
  };
  const [businessActivityRows, businessLineOpenRows, businessOutcomePosts] = await Promise.all([
    db.prisma.missionActivity.findMany({
      where: { ...missionScope, actorUserId: { in: participantIds } },
      select: { actorUserId: true, dailyMissionId: true, occurredAt: true, type: true },
    }),
    db.prisma.missionDeepLinkState.findMany({
      where: {
        workspaceId,
        userId: { in: participantIds },
        consumedAt: { not: null },
        dailyMission: { is: { bunshin: { is: { groupId: serviceId } } } },
      },
      select: { userId: true, dailyMissionId: true, consumedAt: true },
    }),
    db.prisma.postRecord.findMany({
      where: {
        ...missionScope,
        postedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
      },
      select: { manualMetrics: true },
    }),
  ]);
  return { businessActivityRows, businessLineOpenRows, businessOutcomePosts };
}
