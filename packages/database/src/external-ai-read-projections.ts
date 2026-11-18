import type {
  ExternalAiReadProjectionPort,
  ExternalReadContext,
  ExternalDailyPostIdea,
} from '@bunshin/application';
import { PrismaCampaignRepository } from './campaign';
import { PrismaDailyMissionAccessRepository } from './daily-mission-access-repository';
import type { PrismaClient } from './client';

const tokyoDate = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export class PrismaExternalAiReadProjection implements ExternalAiReadProjectionPort {
  constructor(private readonly client: PrismaClient) {}

  async listDailyPostIdeas(context: ExternalReadContext) {
    const repository = new PrismaDailyMissionAccessRepository(this.client);
    const from = tokyoDate(new Date(context.asOf.getTime() - 6 * 86_400_000));
    const to = tokyoDate(context.asOf);
    const missions = await repository.list({
      workspaceId: context.scope.workspaceId,
      groupId: context.scope.serviceId,
      actorUserId: context.scope.userId,
      bunshinId: context.scope.bunshinId,
      from,
      to,
    });
    if (!missions) return { items: [] };
    const selected = missions.slice(0, 10);
    const [profiles, decisions] = await Promise.all([
      this.client.socialProfile.findMany({
        where: {
          workspaceId: context.scope.workspaceId,
          bunshinId: context.scope.bunshinId,
          id: {
            in: selected.flatMap((mission) =>
              mission.socialProfileId ? [mission.socialProfileId] : [],
            ),
          },
          status: 'ACTIVE',
        },
        select: { id: true, platform: true, purpose: true },
      }),
      this.client.missionDecision.findMany({
        where: {
          workspaceId: context.scope.workspaceId,
          bunshinId: context.scope.bunshinId,
          dailyMissionId: { in: selected.map((mission) => mission.id) },
        },
        select: { dailyMissionId: true, decision: true },
      }),
    ]);
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const decisionByMission = new Map(
      decisions.map((decision) => [decision.dailyMissionId, decision.decision]),
    );
    const items: ExternalDailyPostIdea[] = [];
    for (const mission of selected) {
      const profile = mission.socialProfileId
        ? profileById.get(mission.socialProfileId)
        : undefined;
      if (!profile) continue;
      items.push({
        postingDate: mission.missionDate,
        socialNetwork: profile.platform,
        postingPurpose: profile.purpose,
        adoptionStatus: decisionByMission.get(mission.id) ?? 'PENDING',
        format: mission.format,
        content: structuredClone(mission.content),
      });
    }
    return { items };
  }

  async listCampaignBriefs(context: ExternalReadContext) {
    const repository = new PrismaCampaignRepository(this.client);
    const campaigns = await repository.listPlanningContexts({
      workspaceId: context.scope.workspaceId,
      groupId: context.scope.serviceId,
      actorUserId: context.scope.userId,
      bunshinId: context.scope.bunshinId,
      from: context.asOf,
      to: context.asOf,
    });
    return {
      items: (campaigns ?? []).slice(0, 10).map((campaign) => ({
        campaignName: campaign.name,
        postingPurpose: `${campaign.theme}\n対象: ${campaign.targetSummary}`,
        officialAssets: campaign.productPack.assets.map((asset) => ({
          type: asset.type,
          url: asset.url,
          label: asset.label,
          usageTerms: asset.usageTerms,
        })),
        requiredDisclosures: campaign.productPack.rules
          .filter((rule) => rule.type === 'REQUIRED_DISCLOSURE')
          .map((rule) => rule.value),
        forbiddenExpressions: campaign.productPack.rules
          .filter((rule) => rule.type === 'FORBIDDEN_EXPRESSION')
          .map((rule) => rule.value),
        startsAt: campaign.startsAt.toISOString(),
        endsAt: campaign.endsAt.toISOString(),
      })),
    };
  }
}
