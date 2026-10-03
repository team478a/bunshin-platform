import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyMissionPlannerInput } from '@bunshin/capability-social';

vi.mock('server-only', () => ({}));
vi.mock('../src/services/weekly-plan-generation', () => ({
  buildGoalOutcomePlanningContext: (goal: string) => ({
    goalEvaluation: {
      goal,
      status: 'NO_DATA',
      primaryOutcomeKeys: [],
      recordedPostCount: 0,
      primaryOutcomeTotal: 0,
      reportedProgress: { achieved: 0, someProgress: 0, noChange: 0, unknown: 0 },
      reportedPositiveTopics: [],
      feedbackMeaning: 'CONTENT_PREFERENCE_NOT_GOAL_ACHIEVEMENT',
      limitations: [],
    },
  }),
}));

import { prepareDailyMissionDecisionPlannerInput } from '../src/services/daily-mission-decision-context';

const now = new Date('2026-10-04T00:00:00.000Z');

function planner(): DailyMissionPlannerInput {
  return {
    workspaceId: 'workspace-1',
    bunshinId: 'bunshin-1',
    missionDate: '2026-10-04',
    timezone: 'Asia/Tokyo',
    socialProfile: {
      id: 'profile-1',
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      platform: 'X',
      handle: null,
      profileUrl: null,
      purpose: '事業の発信',
      postingFrequency: 'DAILY',
      preferredFormats: ['TEXT'],
      defaultAssistanceLevel: 'READY_TO_USE',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    facePolicy: 'FULL_ANONYMOUS',
    bunshin: {
      name: '投稿パートナー',
      objectiveSummary: '問い合わせを増やす',
      audienceSummary: '地域のお客様',
      personalitySummary: '丁寧',
      personality: null,
    },
    approvedStrategy: {
      id: 'strategy-1',
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      socialProfileId: 'profile-1',
      platform: 'X',
      goal: 'INQUIRY',
      availableMinutes: 5,
      destinationType: 'PROFILE',
      destinationDetail: null,
      concept: '専門家型',
      positioning: '地域の相談先',
      targetSummary: '地域のお客様',
      profileDraft: 'プロフィール',
      ctaStrategy: '問い合わせ',
      postingPolicy: '毎日',
      version: 1,
      status: 'APPROVED',
      approvedAt: now,
      supersededAt: null,
      createdAt: now,
      updatedAt: now,
    },
    weeklyPlan: {
      id: 'plan-1',
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      socialProfileId: null,
      strategyId: null,
      strategyGoal: null,
      weekStartDate: '2026-09-28',
      timezone: 'Asia/Tokyo',
      strategySummary: '相談前の不安を減らす',
      status: 'CONFIRMED',
      confirmedAt: now,
      expiredAt: null,
      createdAt: now,
      updatedAt: now,
      items: [
        {
          id: 'item-1',
          workspaceId: 'workspace-1',
          bunshinId: 'bunshin-1',
          weeklyPlanId: 'plan-1',
          scheduledDate: '2026-10-04',
          contentPillarId: 'pillar-1',
          goal: '問い合わせ前の疑問に答える',
          angle: '初めての方向け',
          recommendedFormat: 'TEXT',
          notes: null,
          campaignId: null,
          classification: 'ORGANIC',
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
    contentPillars: [],
    grantedKnowledge: [],
    businessProfile: {
      industry: '美容室',
      businessName: '合成美容室',
      region: '東京都',
      productService: 'カット',
      primaryPurpose: '問い合わせ',
      targetAudience: '地域のお客様',
    },
  };
}

const scope = {
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  bunshinId: 'bunshin-1',
  actorUserId: 'owner-1',
};

describe('daily mission decision context connection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('leaves non-target services on the existing planner path', () => {
    const input = planner();
    expect(
      prepareDailyMissionDecisionPlannerInput({ scope, plannerInput: input, source: null }),
    ).toEqual({ context: null, plannerInput: input });
  });

  it('fails before Brief preparation when the current legal consent precheck is unknown', () => {
    expect(() =>
      prepareDailyMissionDecisionPlannerInput({
        scope,
        plannerInput: planner(),
        source: { enabled: true, safetyLegal: 'UNKNOWN', observations: [], outcomeRecords: [] },
      }),
    ).toThrow('not ready');
  });

  it('uses the approved strategy only for a legacy weekly plan without a saved snapshot', () => {
    const input = planner();
    const prepared = prepareDailyMissionDecisionPlannerInput({
      scope,
      plannerInput: input,
      source: { enabled: true, safetyLegal: 'PASSED', observations: [], outcomeRecords: [] },
    });
    expect(prepared.context?.status).toBe('READY');
    expect(prepared.plannerInput.weeklyPlan).toMatchObject({
      socialProfileId: 'profile-1',
      strategyId: 'strategy-1',
      strategyGoal: 'INQUIRY',
    });
    expect(input.weeklyPlan).toMatchObject({
      socialProfileId: null,
      strategyId: null,
      strategyGoal: null,
    });
  });

  it('keeps performance with unknown Goal out of planner personalization', () => {
    const input = planner();
    input.weeklyPlan = {
      ...input.weeklyPlan,
      socialProfileId: 'profile-1',
      strategyId: 'strategy-1',
      strategyGoal: 'INQUIRY',
    };
    const prepared = prepareDailyMissionDecisionPlannerInput({
      scope,
      plannerInput: input,
      source: {
        enabled: true,
        safetyLegal: 'PASSED',
        observations: [
          {
            id: 'performance:post-1',
            type: 'PERFORMANCE',
            goalAtObservation: null,
            data: {
              topic: '反応のあった投稿',
              metrics: {
                engagementScore: null,
                saves: 3,
                shares: null,
                comments: null,
                follows: null,
              },
            },
          },
        ],
        outcomeRecords: [],
      },
    });
    expect(
      prepared.context?.signals.find(({ type }) => type === 'PERFORMANCE')?.ignoredReason,
    ).toBe('UNKNOWN_GOAL');
    expect(
      prepared.plannerInput.personalization?.signals.some(
        ({ type }) => type === 'POST_PERFORMANCE',
      ),
    ).toBe(false);
  });
});
