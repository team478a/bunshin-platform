import {
  CampaignService,
  GetBunshin,
  GroupFeatureEntitlementService,
  ListGrantedKnowledgeForBunshin,
  ListPersonalityVersions,
  ProductPackService,
} from '@bunshin/application';
import {
  ListActiveTrendIdeas,
  ListContentPillars,
  ListSocialAccountStrategies,
  ListSocialProfiles,
  ListWeeklyPlans,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

import { loadServiceGenerationKnowledge } from './service-generation-knowledge';

interface GenerationScope {
  workspaceId: string;
  groupId?: string | null;
  bunshinId: string;
  actorUserId: string;
}

export async function loadDailyMissionPlanningContext(input: {
  scope: GenerationScope;
  missionDate: string;
  socialProfileId?: string;
  serviceSafeMode: boolean;
  allowServiceOwnerMemories: boolean;
  generationIdempotencyKey: string;
}) {
  const db = await import('@bunshin/database');
  const productPack = input.serviceSafeMode
    ? null
    : await new ProductPackService(new db.PrismaProductPackRepository()).resolveForGeneration(
        input.scope,
      );
  const profiles = await new ListSocialProfiles(new db.PrismaSocialProfileRepository()).execute(
    input.scope,
  );
  const profile = input.socialProfileId
    ? profiles.find(({ id, status }) => id === input.socialProfileId && status === 'ACTIVE')
    : profiles.find(({ status }) => status === 'ACTIVE');
  if (!profile) throw new ApplicationError('NOT_FOUND', 'active social profile not found');

  const strategies = await new ListSocialAccountStrategies(
    new db.PrismaSocialAccountStrategyRepository(),
  ).execute({ ...input.scope, socialProfileId: profile.id });
  const strategy = strategies.find(({ status }) => status === 'APPROVED');
  if (!strategy) throw new ApplicationError('CONFLICT', 'approved strategy is required');

  // Trend candidates remain scoped to the workspace, Bunshin and selected social profile.
  const trendIdeas = await new ListActiveTrendIdeas(new db.PrismaTrendResearchRepository()).execute(
    {
      ...input.scope,
      socialProfileId: profile.id,
      at: new Date(),
    },
  );
  const weeklyPlans = await new ListWeeklyPlans(new db.PrismaWeeklyPlanRepository()).execute(
    input.scope,
  );
  const weeklyPlan = weeklyPlans.find(
    ({ status, items }) =>
      status === 'CONFIRMED' &&
      items.some(({ scheduledDate }) => scheduledDate === input.missionDate),
  );
  if (!weeklyPlan)
    throw new ApplicationError('NOT_FOUND', 'confirmed weekly plan item not found for date');
  const weeklyItem = weeklyPlan.items.find(
    ({ scheduledDate }) => scheduledDate === input.missionDate,
  );
  if (!weeklyItem)
    throw new ApplicationError('NOT_FOUND', 'confirmed weekly plan item not found for date');

  const campaign = weeklyItem.campaignId
    ? await new CampaignService(new db.PrismaCampaignRepository()).resolvePlanningContext({
        ...input.scope,
        campaignId: weeklyItem.campaignId,
        at: new Date(`${input.missionDate}T12:00:00.000Z`),
      })
    : null;
  if (campaign && input.serviceSafeMode && campaign.productPack.groupId !== input.scope.groupId)
    throw new ApplicationError('NOT_FOUND', 'service campaign unavailable');
  if (campaign) {
    const entitlements = new GroupFeatureEntitlementService(
      new db.PrismaGroupFeatureEntitlementRepository(),
    );
    for (const requiredFeature of ['SOCIAL', 'GROUP.CAMPAIGN', 'GROUP.PRODUCT_PACK']) {
      const access = await entitlements.consumeAccess({
        workspaceId: input.scope.workspaceId,
        groupId: campaign.productPack.groupId,
        actorUserId: input.scope.actorUserId,
        featureKey: requiredFeature,
        operationKey: `${input.generationIdempotencyKey}:${requiredFeature}`,
        localDate: input.missionDate,
      });
      if (!access.allowed)
        throw new ApplicationError('FORBIDDEN', 'group feature is not available', {
          featureKey: requiredFeature,
          reason: access.reason,
        });
    }
  }

  const pillars = await new ListContentPillars(new db.PrismaContentPillarRepository()).execute(
    input.scope,
  );
  const bunshin = await new GetBunshin(new db.PrismaBunshinRepository()).execute(input.scope);
  const personalityVersions = input.serviceSafeMode
    ? []
    : await new ListPersonalityVersions(new db.PrismaPersonalityVersionRepository()).execute(
        input.scope,
      );
  const currentPersonality = personalityVersions[0] ?? null;
  const serviceKnowledge =
    input.serviceSafeMode && input.scope.groupId
      ? await loadServiceGenerationKnowledge({
          workspaceId: input.scope.workspaceId,
          groupId: input.scope.groupId,
          actorUserId: input.scope.actorUserId,
          bunshinId: input.scope.bunshinId,
        })
      : null;
  const granted = input.serviceSafeMode
    ? []
    : await new ListGrantedKnowledgeForBunshin(new db.PrismaKnowledgeGrantRepository()).execute(
        input.scope,
      );
  const memoryRepository =
    input.serviceSafeMode && input.allowServiceOwnerMemories
      ? new db.PrismaOwnerBunshinMemoryRepository()
      : new db.PrismaBunshinMemoryRepository();
  const ownerMemories =
    input.serviceSafeMode && !input.allowServiceOwnerMemories
      ? []
      : await memoryRepository.list(input.scope);
  const personalMaterials = ownerMemories
    .filter(
      (memory) =>
        memory.active &&
        memory.deletedAt === null &&
        memory.sourceType === 'USER_INPUT' &&
        memory.sourceId?.startsWith('daily-action:'),
    )
    .slice(0, 3)
    .map((memory) => ({
      type: 'PERSONAL_MATERIAL',
      title: memory.summary?.trim() || '本人が残した素材',
      content: memory.content,
    }));

  return {
    productPack,
    profile,
    strategy,
    trendIdeas,
    weeklyPlan,
    weeklyItem,
    campaign,
    pillars,
    bunshin,
    currentPersonality,
    serviceKnowledge,
    granted,
    memoryRepository,
    ownerMemories,
    personalMaterials,
  };
}
