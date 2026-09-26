import type {
  BunshinCapabilityAssignmentRepository,
  GenerationContextSnapshotPayload,
} from '@bunshin/application';
import {
  CreateDailyMission,
  type CreateDailyMissionInput,
  type DailyMissionRepository,
} from '@bunshin/capability-social';

import {
  recordDailyMissionCampaignSafety,
  type CampaignSafetyReceipt,
} from './daily-mission-content-finalization';

interface Reference {
  id: string;
}

interface VersionedReference extends Reference {
  version: number;
}

interface SelectedMemoryReference extends Reference {
  summary: string;
  selectionReason: string;
}

interface PersonalizationReferences {
  sourceTypes: string[];
  availableSourceTypes: string[];
  onboardingResponseId: string | null;
  businessProfileId: string | null;
  weeklyPlanItemId: string;
  recentMissionIds: string[];
  recentActivityIds: string[];
  recentVariantSelectionIds: string[];
  recentFeedbackIds: string[];
  recentDecisionIds: string[];
  recentPostRecordIds: string[];
  recentSocialInsightIds: string[];
}

interface GenerationEvidence {
  personality: VersionedReference | null;
  selectedMemories: SelectedMemoryReference[];
  knowledgeIds: string[];
  groupKnowledgeIds: string[];
  socialProfileId: string;
  strategy: VersionedReference;
  weeklyPlanId: string;
  contentPillarId: string;
  productPack: VersionedReference | null;
  campaignId: string | null;
  classification: NonNullable<GenerationContextSnapshotPayload['classification']>;
  trendCandidateId?: string;
  promptVersion: string;
  model: string;
  qualityIssueCodes: string[];
  repairCount: number;
  personalization: PersonalizationReferences;
}

function references(ids: string[]): Reference[] {
  return ids.map((id) => ({ id }));
}

export function buildDailyMissionGenerationContext(
  evidence: GenerationEvidence,
): GenerationContextSnapshotPayload {
  return {
    personality: evidence.personality,
    selectedMemories: evidence.selectedMemories,
    knowledge: references(evidence.knowledgeIds),
    groupKnowledge: references(evidence.groupKnowledgeIds),
    socialProfile: { id: evidence.socialProfileId },
    strategy: evidence.strategy,
    weeklyPlan: { id: evidence.weeklyPlanId },
    contentPillar: { id: evidence.contentPillarId },
    productPack: evidence.productPack,
    campaign: evidence.campaignId ? { id: evidence.campaignId } : null,
    classification: evidence.classification,
    trendCandidates: evidence.trendCandidateId ? [{ id: evidence.trendCandidateId }] : [],
    promptVersion: evidence.promptVersion,
    provider: 'openai',
    model: evidence.model,
    quality: {
      verdict: 'PASS',
      issueCodes: evidence.qualityIssueCodes,
      repairCount: evidence.repairCount,
    },
    personalization: {
      mode: 'AI',
      sourceTypes: evidence.personalization.sourceTypes,
      availableSourceTypes: evidence.personalization.availableSourceTypes,
      onboardingResponse: evidence.personalization.onboardingResponseId
        ? { id: evidence.personalization.onboardingResponseId }
        : null,
      businessProfile: evidence.personalization.businessProfileId
        ? { id: evidence.personalization.businessProfileId }
        : null,
      weeklyPlanItem: { id: evidence.personalization.weeklyPlanItemId },
      recentMissions: references(evidence.personalization.recentMissionIds),
      recentActivities: references(evidence.personalization.recentActivityIds),
      recentVariants: references(evidence.personalization.recentVariantSelectionIds),
      recentFeedback: references(evidence.personalization.recentFeedbackIds),
      recentDecisions: references(evidence.personalization.recentDecisionIds),
      postRecords: references(evidence.personalization.recentPostRecordIds),
      socialInsights: references(evidence.personalization.recentSocialInsightIds),
    },
  };
}

export async function persistGeneratedDailyMission(input: {
  missions: DailyMissionRepository;
  assignments: BunshinCapabilityAssignmentRepository;
  mission: Omit<CreateDailyMissionInput, 'generationContext'>;
  evidence: GenerationEvidence;
  campaignSafetyReceipt: CampaignSafetyReceipt | null;
}) {
  const created = await new CreateDailyMission(input.missions, input.assignments).execute({
    ...input.mission,
    generationContext: {
      generatedAt: new Date(),
      payload: buildDailyMissionGenerationContext(input.evidence),
    },
  });
  await recordDailyMissionCampaignSafety({
    scope: input.mission,
    dailyMissionId: created.id,
    receipt: input.campaignSafetyReceipt,
  });
  return created;
}
