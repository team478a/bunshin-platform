import {
  CampaignService,
  GetBunshin,
  GroupKnowledgeService,
  ListBunshinMemories,
  ListGrantedKnowledgeForBunshin,
  ListPersonalityVersions,
  selectGroupKnowledgeChunksForPrompt,
  type GenerationContextSnapshot,
  type SelectedBunshinMemory,
} from '@bunshin/application';
import {
  ListContentPillars,
  ListSocialAccountStrategies,
  ListSocialProfiles,
  ListWeeklyPlans,
  type DailyMission,
  type DailyMissionScope,
  type MissionContentGeneratorInput,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { loadServiceGenerationKnowledge } from './service-generation-knowledge';

const requireSnapshotValue = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new ApplicationError('CONFLICT', message);
  return value;
};

export async function loadMissionContentVariantContext(input: {
  scope: DailyMissionScope;
  mission: DailyMission;
  snapshot: GenerationContextSnapshot;
  serviceSafeMode?: boolean;
  allowServiceOwnerMemories?: boolean;
}) {
  const db = await import('@bunshin/database');
  const [bunshin, profiles, pillars, weeklyPlans, personalityVersions, granted, memories] =
    await Promise.all([
      new GetBunshin(new db.PrismaBunshinRepository()).execute(input.scope),
      new ListSocialProfiles(new db.PrismaSocialProfileRepository()).execute(input.scope),
      new ListContentPillars(new db.PrismaContentPillarRepository()).execute(input.scope),
      new ListWeeklyPlans(new db.PrismaWeeklyPlanRepository()).execute(input.scope),
      input.serviceSafeMode
        ? Promise.resolve([])
        : new ListPersonalityVersions(new db.PrismaPersonalityVersionRepository()).execute(
            input.scope,
          ),
      input.serviceSafeMode
        ? Promise.resolve([])
        : new ListGrantedKnowledgeForBunshin(new db.PrismaKnowledgeGrantRepository()).execute(
            input.scope,
          ),
      input.serviceSafeMode && !input.allowServiceOwnerMemories
        ? Promise.resolve([])
        : new ListBunshinMemories(
            input.serviceSafeMode
              ? new db.PrismaOwnerBunshinMemoryRepository()
              : new db.PrismaBunshinMemoryRepository(),
          ).execute(input.scope),
    ]);
  const profile = requireSnapshotValue(
    profiles.find(
      ({ id, status }) => id === input.snapshot.payload.socialProfile.id && status === 'ACTIVE',
    ),
    'original social profile is unavailable',
  );
  const strategies = await new ListSocialAccountStrategies(
    new db.PrismaSocialAccountStrategyRepository(),
  ).execute({ ...input.scope, socialProfileId: profile.id });
  const strategy = requireSnapshotValue(
    strategies.find(
      ({ id, version, status }) =>
        id === input.snapshot.payload.strategy.id &&
        version === input.snapshot.payload.strategy.version &&
        status === 'APPROVED',
    ),
    'original approved strategy is unavailable',
  );
  requireSnapshotValue(
    weeklyPlans.find(
      ({ id, status }) => id === input.snapshot.payload.weeklyPlan.id && status === 'CONFIRMED',
    ),
    'original weekly plan is unavailable',
  );
  const pillar = requireSnapshotValue(
    pillars.find(
      ({ id, active, deletedAt }) =>
        id === input.snapshot.payload.contentPillar.id && active && deletedAt === null,
    ),
    'original content pillar is unavailable',
  );
  const personality = input.snapshot.payload.personality
    ? requireSnapshotValue(
        personalityVersions.find(
          ({ id, version }) =>
            id === input.snapshot.payload.personality?.id &&
            version === input.snapshot.payload.personality.version,
        ),
        'original personality version is unavailable',
      )
    : null;
  const snapshotKnowledgeIds = new Set(input.snapshot.payload.knowledge.map(({ id }) => id));
  const exactKnowledge = granted.filter(({ id }) => snapshotKnowledgeIds.has(id));
  if (exactKnowledge.length !== snapshotKnowledgeIds.size)
    throw new ApplicationError('CONFLICT', 'original granted knowledge is unavailable');
  const snapshotMemoryById = new Map(
    input.snapshot.payload.selectedMemories.map((item) => [item.id, item]),
  );
  const selectedMemories: SelectedBunshinMemory[] = memories
    .filter(
      ({ id, active, deletedAt }) => snapshotMemoryById.has(id) && active && deletedAt === null,
    )
    .map((memory) => {
      const reference = snapshotMemoryById.get(memory.id)!;
      return {
        id: memory.id,
        type: memory.type,
        summary: reference.summary,
        content: memory.content,
        selectionReason: reference.selectionReason,
      };
    });
  if (selectedMemories.length !== snapshotMemoryById.size)
    throw new ApplicationError('CONFLICT', 'original selected memory is unavailable');

  const campaign = input.mission.campaignId
    ? await new CampaignService(new db.PrismaCampaignRepository()).resolvePlanningContext({
        ...input.scope,
        campaignId: input.mission.campaignId,
      })
    : null;
  if (
    campaign &&
    (input.snapshot.payload.productPack?.id !== campaign.productPack.versionId ||
      input.snapshot.payload.productPack.version !== campaign.productPack.version)
  )
    throw new ApplicationError('CONFLICT', 'original product pack version is unavailable');
  const snapshotGroupKnowledgeIds = new Set(
    (input.snapshot.payload.groupKnowledge ?? []).map(({ id }) => id),
  );
  let groupKnowledge: NonNullable<MissionContentGeneratorInput['groupKnowledge']> = [];
  let knowledge: MissionContentGeneratorInput['grantedKnowledge'] = exactKnowledge.map(
    ({ type, title, content }) => ({ type, title, content }),
  );
  let businessProfile: MissionContentGeneratorInput['businessProfile'] = null;
  const currentServiceKnowledge =
    input.serviceSafeMode && input.scope.groupId
      ? await loadServiceGenerationKnowledge({
          workspaceId: input.scope.workspaceId,
          groupId: input.scope.groupId,
          actorUserId: input.scope.actorUserId,
        })
      : null;
  const contentTerminologyPolicy = currentServiceKnowledge?.contentTerminologyPolicy ?? null;
  if (campaign) {
    const chunks = await new GroupKnowledgeService(
      new db.PrismaGroupKnowledgeRepository(),
    ).listApprovedChunksForGeneration({
      ...input.scope,
      groupId: campaign.productPack.groupId,
      productPackVersionId: campaign.productPack.versionId,
    });
    groupKnowledge = selectGroupKnowledgeChunksForPrompt(chunks)
      .filter(({ id }) => snapshotGroupKnowledgeIds.has(id))
      .map((chunk) => ({
        chunkId: chunk.id,
        sourceId: chunk.sourceId,
        type: chunk.type,
        sourceLabel: chunk.sourceLabel,
        content: chunk.content.trim(),
      }));
  } else if (input.serviceSafeMode && input.scope.groupId) {
    const serviceKnowledge = currentServiceKnowledge!;
    businessProfile = serviceKnowledge.businessProfile;
    groupKnowledge = serviceKnowledge.groupKnowledge.filter(({ chunkId }) =>
      snapshotGroupKnowledgeIds.has(chunkId),
    );
    const allowedLabels = new Set(groupKnowledge.map(({ sourceLabel }) => sourceLabel));
    knowledge = serviceKnowledge.officialKnowledge.filter(
      ({ type, title }) =>
        type === 'SERVICE_BUSINESS_PROFILE' ||
        type === 'SERVICE_INDUSTRY_SAFETY' ||
        type === 'SERVICE_CONTENT_TERMINOLOGY' ||
        allowedLabels.has(title),
    );
  }
  if (groupKnowledge.length !== snapshotGroupKnowledgeIds.size)
    throw new ApplicationError('CONFLICT', 'original group knowledge is unavailable');

  return {
    profile,
    campaign,
    selectedMemories,
    groupKnowledge,
    knowledge,
    businessProfile,
    contentTerminologyPolicy,
    bunshinContext: {
      name: bunshin.name,
      objectiveSummary: bunshin.objectiveSummary,
      audienceSummary: bunshin.audienceSummary,
      personalitySummary: bunshin.personalitySummary,
      personality: personality
        ? {
            versionId: personality.id,
            version: personality.version,
            tone: personality.tone,
            formality: personality.formality,
            energyLevel: personality.energyLevel,
            expertiseLevel: personality.expertiseLevel,
            sentenceStyle: personality.sentenceStyle,
            firstPerson: personality.firstPerson,
            forbiddenExpressions: personality.forbiddenExpressions,
            preferredExpressions: personality.preferredExpressions,
            visualDirection: personality.visualDirection,
            facePolicy: personality.facePolicy,
          }
        : null,
    },
    strategyContext: {
      concept: strategy.concept,
      positioning: strategy.positioning,
      targetSummary: strategy.targetSummary,
      ctaStrategy: strategy.ctaStrategy,
      postingPolicy: strategy.postingPolicy,
    },
    contentPillar: { title: pillar.title, description: pillar.description },
  };
}
