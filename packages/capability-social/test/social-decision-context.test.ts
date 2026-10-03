import { describe, expect, it } from 'vitest';
import {
  normalizeSocialDecisionContext,
  SOCIAL_DECISION_PRIORITY,
  type DailyMissionPlannerInput,
  type SocialAccountStrategyGoal,
  type SocialDecisionContextInput,
  type SocialDecisionObservation,
  type SocialDecisionScope,
  type SocialDecisionSource,
} from '../src';

const now = new Date('2026-10-04T00:00:00Z');
const scope: SocialDecisionScope = {
  workspaceId: 'workspace',
  groupId: 'group',
  ownerUserId: 'customer-a',
  bunshinId: 'bunshin-a',
};
function source<T>(data: T): SocialDecisionSource<T> {
  return { scope: { ...scope }, data };
}
function fixture(goal: SocialAccountStrategyGoal = 'INQUIRY'): SocialDecisionContextInput {
  const profile: DailyMissionPlannerInput['socialProfile'] = {
    id: 'profile',
    workspaceId: scope.workspaceId,
    bunshinId: scope.bunshinId,
    platform: 'INSTAGRAM',
    handle: null,
    profileUrl: null,
    purpose: 'SNS発信',
    postingFrequency: 'WEEKDAYS',
    preferredFormats: ['IMAGE'],
    defaultAssistanceLevel: 'READY_TO_USE',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };
  const strategy: DailyMissionPlannerInput['approvedStrategy'] = {
    id: 'strategy',
    workspaceId: scope.workspaceId,
    bunshinId: scope.bunshinId,
    socialProfileId: profile.id,
    platform: profile.platform,
    goal,
    availableMinutes: 5,
    destinationType: 'LINE',
    destinationDetail: null,
    concept: '専門性',
    positioning: '丁寧な相談',
    targetSummary: '地域のお客様',
    profileDraft: '合成美容室',
    ctaStrategy: '詳細を見る',
    postingPolicy: '週3回',
    version: 1,
    status: 'APPROVED',
    approvedAt: now,
    supersededAt: null,
    createdAt: now,
    updatedAt: now,
  };
  return {
    scope: { ...scope },
    boundary: {
      authorization: 'PASSED',
      capability: 'PASSED',
      ownership: 'PASSED',
      safetyLegal: 'PASSED',
    },
    missionDate: '2026-10-04',
    timezone: 'Asia/Tokyo',
    currentGoal: goal,
    socialProfile: source(profile),
    approvedStrategy: source(strategy),
    businessProfile: source({
      industry: '美容室',
      businessName: '合成美容室',
      region: '東京',
      productService: 'カット',
      primaryPurpose: '新規顧客',
      targetAudience: '地域のお客様',
    }),
    weeklyPlan: source({
      id: 'week',
      workspaceId: scope.workspaceId,
      bunshinId: scope.bunshinId,
      socialProfileId: profile.id,
      strategyId: strategy.id,
      strategyGoal: goal,
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
          id: 'item',
          workspaceId: scope.workspaceId,
          bunshinId: scope.bunshinId,
          weeklyPlanId: 'week',
          scheduledDate: '2026-10-04',
          contentPillarId: 'pillar',
          goal: '読者に役立つ',
          angle: 'よくある質問',
          recommendedFormat: 'IMAGE',
          notes: null,
          campaignId: null,
          classification: 'ORGANIC',
          createdAt: now,
          updatedAt: now,
        },
      ],
    }),
  };
}
function performance(goal: SocialAccountStrategyGoal | null, score: number | null = 100) {
  return source<SocialDecisionObservation>({
    id: 'performance',
    type: 'PERFORMANCE',
    goalAtObservation: goal,
    data: {
      topic: 'スタッフ紹介',
      metrics: {
        engagementScore: score,
        saves: 0,
        shares: null,
        comments: 0,
        follows: null,
      },
    },
  });
}
function events(): SocialDecisionSource<SocialDecisionObservation>[] {
  const base = {
    id: 'decision-row',
    workspaceId: scope.workspaceId,
    bunshinId: scope.bunshinId,
    dailyMissionId: 'mission',
    createdAt: now,
    updatedAt: now,
  };
  return [
    source({
      id: 'accepted',
      type: 'DECISION',
      data: {
        ...base,
        decision: 'ACCEPTED',
        rejectionReason: null,
        rejectionDetail: null,
        decidedAt: now,
      },
    }),
    source({
      id: 'copied',
      type: 'ACTIVITY',
      data: {
        ...base,
        actorUserId: scope.ownerUserId,
        type: 'COPIED_TEXT',
        occurredAt: now,
        idempotencyKey: 'copy',
        metadata: null,
      },
    }),
    source({
      id: 'posted',
      type: 'POST',
      data: {
        ...base,
        actorUserId: scope.ownerUserId,
        platform: 'INSTAGRAM',
        postedAt: now,
        postUrl: null,
        externalPostId: null,
        source: 'MANUAL',
        manualMetrics: null,
        idempotencyKey: 'post',
      },
    }),
    source({
      id: 'good',
      type: 'FEEDBACK',
      data: { ...base, actorUserId: scope.ownerUserId, rating: 'GOOD' },
    }),
  ];
}

describe('SOCIAL Decision Context pure contract and priority policy', () => {
  it('changes goal directions, not company facts, when only the approved Goal changes', () => {
    const awareness = normalizeSocialDecisionContext(fixture('BRAND_AWARENESS'));
    const recruit = normalizeSocialDecisionContext(fixture('RECRUIT'));
    expect(awareness.status).toBe('READY');
    expect(recruit.status).toBe('READY');
    expect(awareness.goalPlanning?.topicDirections).toContain('ブランドストーリー');
    expect(recruit.goalPlanning?.topicDirections).toContain('仕事内容');
    expect(recruit.goalPlanning?.ctaDirections).toContain('応募する');
    expect(awareness.signals.find((s) => s.type === 'BUSINESS_FACTS')).toEqual(
      recruit.signals.find((s) => s.type === 'BUSINESS_FACTS'),
    );
  });

  it('preserves the Goal and constraint order when only performance changes', () => {
    const low = normalizeSocialDecisionContext({
      ...fixture(),
      observations: [performance('INQUIRY', 0)],
    });
    const high = normalizeSocialDecisionContext({
      ...fixture(),
      observations: [performance('INQUIRY', 1000000)],
    });
    expect(high.goalPlanning).toEqual(low.goalPlanning);
    expect(high.orderedSignals.map((s) => [s.id, s.priority])).toEqual(
      low.orderedSignals.map((s) => [s.id, s.priority]),
    );
    expect(high.signals.find((s) => s.type === 'PERFORMANCE')?.interpretation).toBe(
      'OBSERVATION_NOT_CAUSATION',
    );
    expect(high).not.toHaveProperty('selectedTopic');
  });

  it('keeps goal, strategy, weekly facts and preference ahead of conflicting high engagement', () => {
    const context = normalizeSocialDecisionContext({
      ...fixture(),
      observations: [...events(), performance('INQUIRY', 1000000)],
    });
    const types = context.orderedSignals.map((s) => s.type);
    for (const type of [
      'BOUNDARY',
      'CURRENT_GOAL',
      'STRATEGY',
      'WEEKLY_PLAN',
      'BUSINESS_FACTS',
      'FEEDBACK',
    ] as const)
      expect(types.indexOf(type)).toBeLessThan(types.indexOf('PERFORMANCE'));
    expect(context.currentGoal).toBe('INQUIRY');
    expect(context.goalPlanning?.topicDirections).toContain('相談テーマ');
    expect(context.limitations).toContain('ENGAGEMENT_NOT_AUTOMATIC_SELECTION');
  });

  it('keeps the six priority tiers fixed without scoring or reversing them', () => {
    expect(Object.isFrozen(SOCIAL_DECISION_PRIORITY)).toBe(true);
    expect(SOCIAL_DECISION_PRIORITY).toMatchObject({
      BOUNDARY: 1,
      CURRENT_GOAL: 2,
      STRATEGY: 2,
      WEEKLY_PLAN: 3,
      BUSINESS_FACTS: 3,
      CAMPAIGN: 3,
      TODAY: 3,
      RECENT_POSTS: 4,
      DECISION: 4,
      FEEDBACK: 4,
      PERFORMANCE: 5,
      OUTCOME: 5,
      SEASON: 6,
      TREND: 6,
    });
    const context = normalizeSocialDecisionContext({
      ...fixture(),
      observations: events(),
      season: source({ summary: '利用者から提供された季節の案内', sourceRef: 'owner-note' }),
    });
    expect(context.orderedSignals.at(-1)?.type).toBe('SEASON');
  });

  it('supports a new user with no history, without inventing results or a recommendation', () => {
    const context = normalizeSocialDecisionContext(fixture());
    expect(context.status).toBe('READY');
    expect(context.evidenceCompleteness).toBe('MEDIUM');
    expect(context.signals.some((s) => ['PERFORMANCE', 'OUTCOME', 'POST'].includes(s.type))).toBe(
      false,
    );
    expect(context).not.toHaveProperty('successProbability');
    expect(context).not.toHaveProperty('postContent');
  });

  it('preserves ACCEPTED, COPIED, POSTED and GOOD as distinct signals', () => {
    const context = normalizeSocialDecisionContext({ ...fixture(), observations: events() });
    expect(context.signals.find((s) => s.id === 'observation:accepted')?.data).toMatchObject({
      observation: { decision: 'ACCEPTED' },
    });
    expect(context.signals.find((s) => s.id === 'observation:copied')?.data).toMatchObject({
      observation: { type: 'COPIED_TEXT' },
    });
    expect(context.signals.find((s) => s.id === 'observation:posted')?.type).toBe('POST');
    expect(context.signals.find((s) => s.id === 'observation:good')?.data).toMatchObject({
      observation: { rating: 'GOOD' },
    });
    expect(context.signals.filter((s) => s.type === 'OUTCOME')).toEqual([]);
    const preparedOnly = normalizeSocialDecisionContext({
      ...fixture(),
      observations: events().slice(0, 2),
    });
    expect(preparedOnly.signals.some((s) => s.type === 'POST')).toBe(false);
  });

  it('keeps measured zero distinct from unknown, including an all-zero record', () => {
    const context = normalizeSocialDecisionContext({
      ...fixture(),
      observations: [performance('INQUIRY', 0)],
    });
    expect(context.signals.find((s) => s.type === 'PERFORMANCE')?.data).toMatchObject({
      observation: {
        metrics: {
          engagementScore: { status: 'MEASURED', value: 0 },
          saves: { status: 'MEASURED', value: 0 },
          shares: { status: 'UNKNOWN', value: null },
        },
      },
    });
    expect(context.orderedSignals.some((s) => s.type === 'PERFORMANCE')).toBe(true);
  });

  it.each(['RECRUIT', null] as const)(
    'retains but excludes %s Goal performance from current Goal decision inputs',
    (goal) => {
      const context = normalizeSocialDecisionContext({
        ...fixture(),
        observations: [performance(goal, 1000000)],
      });
      expect(context.signals.find((s) => s.type === 'PERFORMANCE')?.ignoredReason).toBe(
        goal ? 'OTHER_GOAL' : 'UNKNOWN_GOAL',
      );
      expect(context.orderedSignals.some((s) => s.type === 'PERFORMANCE')).toBe(false);
      expect(context.goalPlanning).toEqual(normalizeSocialDecisionContext(fixture()).goalPlanning);
    },
  );

  it.each(['workspaceId', 'groupId', 'ownerUserId', 'bunshinId'] as const)(
    'rejects Customer B private source with different %s',
    (key) => {
      const foreign = performance('INQUIRY');
      foreign.scope[key] = 'customer-b-scope';
      expect(() =>
        normalizeSocialDecisionContext({ ...fixture(), observations: [foreign] }),
      ).toThrow('scope mismatch');
    },
  );

  it('rejects a foreign row even if its envelope claims Customer A', () => {
    const foreign = events()[1]!;
    if (foreign.data.type !== 'ACTIVITY') throw new Error('fixture mismatch');
    foreign.data.data.actorUserId = 'customer-b';
    expect(() => normalizeSocialDecisionContext({ ...fixture(), observations: [foreign] })).toThrow(
      'row scope mismatch',
    );
  });

  it('does not fabricate strategy, plan, business facts, season or trends when missing', () => {
    const context = normalizeSocialDecisionContext({
      ...fixture(),
      currentGoal: null,
      approvedStrategy: null,
      weeklyPlan: null,
      socialProfile: null,
      businessProfile: null,
    });
    expect(context.status).toBe('REVIEW_REQUIRED');
    expect(context.evidenceCompleteness).toBe('LOW');
    expect(context.goalPlanning).toBeNull();
    expect(context.signals.map((s) => s.type)).toEqual(['BOUNDARY']);
    expect(context.missingInputs).toEqual([
      'CURRENT_GOAL',
      'SOCIAL_PROFILE',
      'APPROVED_STRATEGY',
      'CONFIRMED_WEEKLY_PLAN',
      'BUSINESS_PROFILE',
    ]);
  });

  it.each(['authorization', 'capability', 'ownership', 'safetyLegal'] as const)(
    'does not approve missing %s evidence',
    (key) => {
      const input = fixture();
      input.boundary[key] = 'UNKNOWN';
      const context = normalizeSocialDecisionContext(input);
      expect(context.status).toBe('BLOCKED');
      expect(context.orderedSignals).toEqual([]);
    },
  );

  it('requires review rather than replacing the Goal from an old strategy/weekly plan', () => {
    const context = normalizeSocialDecisionContext({
      ...fixture('RECRUIT'),
      currentGoal: 'INQUIRY',
    });
    expect(context.status).toBe('REVIEW_REQUIRED');
    expect(context.reviewReasons).toEqual(
      expect.arrayContaining(['STRATEGY_GOAL_MISMATCH', 'WEEKLY_STRATEGY_MISMATCH']),
    );
    expect(context.currentGoal).toBe('INQUIRY');
    expect(context.orderedSignals).toEqual([]);
  });

  it.each(['MEASURED', 'SELF_REPORTED', 'NO_DATA', 'UNAVAILABLE'] as const)(
    'normalizes %s outcome without turning feedback or absent outcomes into measured success',
    (status) => {
      const context = normalizeSocialDecisionContext({
        ...fixture(),
        observations: [
          source({
            id: 'outcome',
            type: 'OUTCOME',
            data: {
              goal: 'INQUIRY',
              status,
              primaryOutcomeKeys: ['inquiries'],
              recordedPostCount: 1,
              primaryOutcomeTotal: 0,
              feedbackMeaning: 'CONTENT_PREFERENCE_NOT_GOAL_ACHIEVEMENT',
              limitations: [],
            },
          }),
        ],
      });
      expect(context.signals.find((s) => s.type === 'OUTCOME')?.data).toMatchObject({
        observation: {
          primaryOutcomeTotal:
            status === 'MEASURED'
              ? { status: 'MEASURED', value: 0 }
              : { status: 'UNKNOWN', value: null },
        },
      });
      if (status === 'NO_DATA' || status === 'UNAVAILABLE') {
        expect(context.signals.find((s) => s.type === 'OUTCOME')?.ignoredReason).toBe(
          'NO_OBSERVATION',
        );
        expect(context.evidenceCompleteness).toBe('MEDIUM');
      }
    },
  );

  it('does not mutate inputs or retain aliases and orders observation IDs deterministically', () => {
    const input = { ...fixture(), observations: events() };
    const before = structuredClone(input);
    const context = normalizeSocialDecisionContext(input);
    expect(input).toEqual(before);
    expect(context.orderedSignals).toEqual(
      normalizeSocialDecisionContext({ ...input, observations: [...input.observations].reverse() })
        .orderedSignals,
    );
    input.approvedStrategy!.data.concept = 'changed';
    expect(context.signals.find((s) => s.type === 'STRATEGY')?.data).toMatchObject({
      concept: '専門性',
    });
  });

  it.each([-1, Infinity, NaN])('rejects invalid measured value %s', (value) => {
    expect(() =>
      normalizeSocialDecisionContext({
        ...fixture(),
        observations: [performance('INQUIRY', value)],
      }),
    ).toThrow('invalid observed metric');
  });

  it('does not turn unknown-only performance into sufficient history', () => {
    const observed = performance('INQUIRY', null);
    if (observed.data.type !== 'PERFORMANCE') throw new Error('fixture mismatch');
    observed.data.data.metrics = {
      engagementScore: null,
      saves: null,
      shares: null,
      comments: null,
      follows: null,
    };
    const context = normalizeSocialDecisionContext({ ...fixture(), observations: [observed] });
    expect(context.evidenceCompleteness).toBe('MEDIUM');
    expect(context.signals.find((s) => s.type === 'PERFORMANCE')?.ignoredReason).toBe(
      'NO_OBSERVATION',
    );
    expect(context.orderedSignals.some((s) => s.type === 'PERFORMANCE')).toBe(false);
  });

  it('retains other-Goal outcomes without using them as current success', () => {
    const context = normalizeSocialDecisionContext({
      ...fixture(),
      observations: [
        source({
          id: 'other-outcome',
          type: 'OUTCOME',
          data: {
            goal: 'RECRUIT',
            status: 'MEASURED',
            primaryOutcomeKeys: ['other'],
            recordedPostCount: 1,
            primaryOutcomeTotal: 100,
            feedbackMeaning: 'CONTENT_PREFERENCE_NOT_GOAL_ACHIEVEMENT',
            limitations: ['self-entered'],
          },
        }),
      ],
    });
    expect(context.signals.find((s) => s.type === 'OUTCOME')?.ignoredReason).toBe('OTHER_GOAL');
    expect(context.orderedSignals.some((s) => s.type === 'OUTCOME')).toBe(false);
  });

  it('keeps a POSTED activity distinct from a PostRecord without synthesizing one', () => {
    const posted = events()[1]!;
    if (posted.data.type !== 'ACTIVITY') throw new Error('fixture mismatch');
    posted.data.data.type = 'POSTED';
    const context = normalizeSocialDecisionContext({ ...fixture(), observations: [posted] });
    expect(context.signals.find((s) => s.type === 'ACTIVITY')?.data).toMatchObject({
      observation: { type: 'POSTED' },
    });
    expect(context.signals.some((s) => s.type === 'POST')).toBe(false);
  });

  it.each(['unapproved', 'draft-week', 'wrong-day', 'wrong-profile'] as const)(
    'fails closed for %s planning evidence',
    (kind) => {
      const input = fixture();
      if (kind === 'unapproved') input.approvedStrategy!.data.status = 'DRAFT';
      if (kind === 'draft-week') input.weeklyPlan!.data.status = 'DRAFT';
      if (kind === 'wrong-day') input.missionDate = '2026-10-05';
      if (kind === 'wrong-profile') input.approvedStrategy!.data.socialProfileId = 'other-profile';
      const context = normalizeSocialDecisionContext(input);
      expect(context.status).toBe('REVIEW_REQUIRED');
      expect(context.orderedSignals).toEqual([]);
      expect(context.evidenceCompleteness).toBe('LOW');
    },
  );

  it('rejects duplicate observation identifiers rather than double-counting signals', () => {
    expect(() =>
      normalizeSocialDecisionContext({
        ...fixture(),
        observations: [performance('INQUIRY'), performance('INQUIRY')],
      }),
    ).toThrow('duplicate observation id');
  });

  it('rejects a foreign strategy row under a forged matching envelope', () => {
    const input = fixture();
    input.approvedStrategy!.data.bunshinId = 'customer-b-bunshin';
    expect(() => normalizeSocialDecisionContext(input)).toThrow('row scope mismatch');
  });

  it('does not let high other-Goal performance outrank measured-zero current-Goal performance', () => {
    const other = performance('RECRUIT', 1000000);
    other.data.id = 'old-goal-performance';
    const context = normalizeSocialDecisionContext({
      ...fixture(),
      observations: [other, performance('INQUIRY', 0)],
    });
    expect(context.orderedSignals.filter((s) => s.type === 'PERFORMANCE').map((s) => s.id)).toEqual(
      ['observation:performance'],
    );
    expect(
      context.signals.find((s) => s.id === 'observation:old-goal-performance')?.ignoredReason,
    ).toBe('OTHER_GOAL');
  });

  it('keeps incomplete company fields missing rather than filling in invented facts', () => {
    const input = fixture();
    input.businessProfile!.data.productService = '';
    const context = normalizeSocialDecisionContext(input);
    expect(context.status).toBe('REVIEW_REQUIRED');
    expect(context.missingInputs).toContain('BUSINESS_PROFILE_productService');
    expect(context.orderedSignals).toEqual([]);
    expect(context.signals.find((s) => s.type === 'BUSINESS_FACTS')?.data).toMatchObject({
      productService: '',
    });
  });
});
