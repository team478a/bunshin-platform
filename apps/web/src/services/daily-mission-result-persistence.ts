import 'server-only';
import type { BunshinCapabilityAssignmentRepository } from '@bunshin/application';
import type { DailyMissionRepository } from '@bunshin/capability-social';
import type { DailyMissionAiScope } from './daily-mission-ai-runtime';
import type { runDailyMissionBriefGeneration } from './daily-mission-brief-runtime';
import type { runDailyMissionContentGeneration } from './daily-mission-content-runtime';
import type { finalizeDailyMissionContent } from './daily-mission-content-finalization';
import {
  personalizationSourceTypes,
  type buildMissionPersonalizationContext,
  type selectDailyMissionMemories,
} from './daily-mission-personalization';
import { persistGeneratedDailyMission } from './daily-mission-persistence';
import type { loadDailyMissionPlanningContext } from './daily-mission-planning-context';

type PlanningContext = Awaited<ReturnType<typeof loadDailyMissionPlanningContext>>;
type BriefResult = Awaited<ReturnType<typeof runDailyMissionBriefGeneration>>;
type ContentResult = Awaited<ReturnType<typeof runDailyMissionContentGeneration>>;
type FinalizedContent = Awaited<ReturnType<typeof finalizeDailyMissionContent>>;
type SelectedMemories = Awaited<ReturnType<typeof selectDailyMissionMemories>>;
type Personalization = ReturnType<typeof buildMissionPersonalizationContext>;

export function persistDailyMissionGenerationResult(input: {
  missions: DailyMissionRepository;
  assignments: BunshinCapabilityAssignmentRepository;
  scope: DailyMissionAiScope;
  planning: PlanningContext;
  brief: BriefResult;
  pillar: PlanningContext['pillars'][number];
  selectedMemories: SelectedMemories;
  personalization: Personalization;
  recentMissionIds: string[];
  contentResult: ContentResult;
  finalizedContent: FinalizedContent & { groupKnowledgeIds: string[] };
}) {
  const {
    productPack,
    profile,
    strategy,
    weeklyPlan,
    weeklyItem,
    campaign,
    currentPersonality,
    serviceKnowledge,
    granted,
  } = input.planning;
  const { content, quality, repairCount, qualityIssueCodes } = input.contentResult;
  const {
    content: missionContent,
    externalLinkUsage,
    campaignSafetyReceipt,
  } = input.finalizedContent;

  return persistGeneratedDailyMission({
    missions: input.missions,
    assignments: input.assignments,
    mission: {
      ...input.scope,
      ...input.brief.output,
      assistanceLevel: serviceKnowledge?.contentAssistanceLevel ?? profile.defaultAssistanceLevel,
      content: missionContent,
      qualityScore: quality.output.score,
      campaignId: weeklyItem.campaignId,
      classification: weeklyItem.classification,
      ...(externalLinkUsage ? { externalLinkUsage } : {}),
    },
    evidence: {
      personality: currentPersonality
        ? { id: currentPersonality.id, version: currentPersonality.version }
        : null,
      selectedMemories: input.selectedMemories.map(({ id, summary, selectionReason }) => ({
        id,
        summary,
        selectionReason,
      })),
      knowledgeIds: granted.map(({ id }) => id),
      groupKnowledgeIds: input.finalizedContent.groupKnowledgeIds,
      socialProfileId: profile.id,
      strategy: { id: strategy.id, version: strategy.version },
      weeklyPlanId: weeklyPlan.id,
      contentPillarId: input.pillar.id,
      productPack: campaign
        ? { id: campaign.productPack.versionId, version: campaign.productPack.version }
        : productPack
          ? { id: productPack.versionId, version: productPack.version }
          : null,
      campaignId: campaign?.id ?? null,
      classification: weeklyItem.classification,
      ...(input.brief.output.trendCandidateId
        ? { trendCandidateId: input.brief.output.trendCandidateId }
        : {}),
      promptVersion: content.promptVersion,
      model: content.model,
      qualityIssueCodes,
      repairCount,
      personalization: {
        sourceTypes: input.brief.output.personalizationSourceTypes ?? [],
        availableSourceTypes: personalizationSourceTypes(input.personalization),
        onboardingResponseId:
          serviceKnowledge?.personalization.references.onboardingResponseId ?? null,
        businessProfileId: serviceKnowledge?.personalization.references.businessProfileId ?? null,
        weeklyPlanItemId: weeklyItem.id,
        recentMissionIds: input.recentMissionIds,
        recentActivityIds: serviceKnowledge?.personalization.references.recentActivityIds ?? [],
        recentVariantSelectionIds:
          serviceKnowledge?.personalization.references.recentVariantSelectionIds ?? [],
        recentFeedbackIds: serviceKnowledge?.personalization.references.recentFeedbackIds ?? [],
        recentDecisionIds: serviceKnowledge?.personalization.references.recentDecisionIds ?? [],
        recentPostRecordIds: serviceKnowledge?.personalization.references.recentPostRecordIds ?? [],
        recentSocialInsightIds:
          serviceKnowledge?.personalization.references.recentSocialInsightIds ?? [],
      },
    },
    campaignSafetyReceipt,
  });
}
