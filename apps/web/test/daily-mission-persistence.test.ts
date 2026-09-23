import { describe, expect, it } from 'vitest';

import { buildDailyMissionGenerationContext } from '../src/services/daily-mission-persistence';

describe('daily mission persistence', () => {
  it('keeps personalization and novelty evidence in the generation snapshot', () => {
    const context = buildDailyMissionGenerationContext({
      personality: { id: 'personality-1', version: 2 },
      selectedMemories: [
        {
          id: 'memory-1',
          summary: '歴史が好き',
          selectionReason: '当日の企画に関連するため',
        },
      ],
      knowledgeIds: ['knowledge-1'],
      groupKnowledgeIds: ['group-knowledge-1'],
      socialProfileId: 'profile-1',
      strategy: { id: 'strategy-1', version: 3 },
      weeklyPlanId: 'weekly-plan-1',
      contentPillarId: 'pillar-1',
      productPack: { id: 'product-pack-version-1', version: 4 },
      campaignId: 'campaign-1',
      classification: 'ADVERTISEMENT',
      trendCandidateId: 'trend-1',
      promptVersion: 'daily-v1',
      model: 'model-1',
      qualityIssueCodes: [],
      repairCount: 1,
      personalization: {
        sourceTypes: ['MEMORY', 'RECENT_FEEDBACK'],
        availableSourceTypes: ['MEMORY', 'RECENT_FEEDBACK', 'SOCIAL_INSIGHT'],
        onboardingResponseId: 'onboarding-1',
        businessProfileId: 'business-1',
        weeklyPlanItemId: 'weekly-item-1',
        recentMissionIds: ['mission-1'],
        recentActivityIds: ['activity-1'],
        recentVariantSelectionIds: ['variant-1'],
        recentFeedbackIds: ['feedback-1'],
        recentDecisionIds: ['decision-1'],
        recentPostRecordIds: ['post-1'],
        recentSocialInsightIds: ['insight-1'],
      },
    });

    expect(context.selectedMemories).toEqual([
      {
        id: 'memory-1',
        summary: '歴史が好き',
        selectionReason: '当日の企画に関連するため',
      },
    ]);
    expect(context.groupKnowledge).toEqual([{ id: 'group-knowledge-1' }]);
    expect(context.personalization).toMatchObject({
      sourceTypes: ['MEMORY', 'RECENT_FEEDBACK'],
      availableSourceTypes: ['MEMORY', 'RECENT_FEEDBACK', 'SOCIAL_INSIGHT'],
      recentMissions: [{ id: 'mission-1' }],
      recentFeedback: [{ id: 'feedback-1' }],
      postRecords: [{ id: 'post-1' }],
      socialInsights: [{ id: 'insight-1' }],
    });
  });
});
