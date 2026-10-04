import { describe, expect, it, vi } from 'vitest';
import {
  GenerateDailyMissionBrief,
  prepareSocialDecisionPlannerInput,
  type SocialDecisionPlannerPreparation,
  type SocialDecisionObservation,
} from '../src';
import { decisionPlannerFixture } from './fixtures/social-decision-planner';

function input(): SocialDecisionPlannerPreparation {
  const plannerInput = decisionPlannerFixture();
  return {
    plannerInput,
    currentGoal: 'INQUIRY',
    scope: {
      workspaceId: plannerInput.workspaceId,
      bunshinId: plannerInput.bunshinId,
      groupId: 'group-private',
      ownerUserId: 'owner-private',
    },
    boundary: {
      authorization: 'PASSED',
      capability: 'PASSED',
      ownership: 'PASSED',
      safetyLegal: 'PASSED',
    },
  };
}
function observed(value: SocialDecisionPlannerPreparation, goal: 'INQUIRY' | 'RECRUIT' | null) {
  return {
    scope: value.scope,
    data: {
      id: 'private-observation-id',
      type: 'PERFORMANCE',
      goalAtObservation: goal,
      data: {
        topic: '相談前のFAQ',
        metrics: { engagementScore: 0, saves: 0, shares: null, comments: null, follows: null },
      },
    } as SocialDecisionObservation,
  };
}
function provider() {
  return {
    generate: vi.fn().mockResolvedValue({
      model: 'fake-model',
      promptVersion: 'fake-prompt',
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      output: {
        topic: '相談前によくある質問',
        angle: '初めての不安を減らす',
        reason: '問い合わせの目的と週間計画に沿う',
        estimatedMinutes: 5,
        usedTrendIdea: false,
        personalizationSourceTypes: ['ACCOUNT_STRATEGY'],
        personalizationReason: '承認済み目的に沿う',
      },
    }),
  };
}

describe('unconnected SOCIAL Decision Context to real Brief planner preparation', () => {
  it('passes prepared policy to the real use case with a fake provider only', async () => {
    const prepared = prepareSocialDecisionPlannerInput(input());
    const planner = provider();
    const result = await new GenerateDailyMissionBrief(planner).execute(prepared.plannerInput);
    expect(result.output.personalizationSourceTypes).toEqual(['ACCOUNT_STRATEGY']);
    expect(planner.generate.mock.calls[0]?.[0]).toMatchObject({
      approvedStrategy: { goal: 'INQUIRY' },
      personalization: {
        instruction: expect.stringContaining('高Engagementだけを採用理由にしない'),
      },
    });
  });

  it.each(['authorization', 'capability', 'ownership', 'safetyLegal'] as const)(
    'rejects unknown %s before invoking a provider',
    async (key) => {
      const value = input();
      value.boundary[key] = 'UNKNOWN';
      const planner = provider();
      await expect(
        Promise.resolve().then(() => prepareSocialDecisionPlannerInput(value)),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        cause: {
          category: 'DECISION_CONTEXT_REVIEW_REQUIRED',
          status: 'BLOCKED',
        },
      });
      expect(planner.generate).not.toHaveBeenCalled();
    },
  );

  it('classifies an explicitly blocked boundary separately and does not invoke a provider', async () => {
    const value = input();
    value.boundary.safetyLegal = 'BLOCKED';
    const planner = provider();

    await expect(
      Promise.resolve().then(() => prepareSocialDecisionPlannerInput(value)),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      cause: {
        category: 'DECISION_CONTEXT_BLOCKED',
        status: 'BLOCKED',
      },
    });
    expect(planner.generate).not.toHaveBeenCalled();
  });

  it('classifies a non-boundary review requirement without treating it as an explicit block', async () => {
    const value = input();
    value.plannerInput.businessProfile = null;

    await expect(
      Promise.resolve().then(() => prepareSocialDecisionPlannerInput(value)),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      cause: {
        category: 'DECISION_CONTEXT_REVIEW_REQUIRED',
        status: 'REVIEW_REQUIRED',
      },
    });
  });

  it('replaces unscoped legacy history instead of carrying other-Goal performance into the prompt', () => {
    const value = input();
    value.observations = [observed(value, 'RECRUIT')];
    value.plannerInput.personalization = {
      instruction: 'legacy-performance-private',
      signals: [
        { type: 'POST_PERFORMANCE', label: 'old', value: 'other-goal-private-success' },
        { type: 'FEEDBACK_HISTORY', label: 'old', value: 'old-private-summary' },
      ],
    };
    const prepared = prepareSocialDecisionPlannerInput(value);
    const prompt = JSON.stringify(prepared.plannerInput.personalization);
    expect(prompt).not.toContain('legacy-performance-private');
    expect(prompt).not.toContain('other-goal-private-success');
    expect(prompt).not.toContain('old-private-summary');
    expect(prepared.context.signals.find((s) => s.type === 'PERFORMANCE')?.ignoredReason).toBe(
      'OTHER_GOAL',
    );
  });

  it('projects measured zero and unknown without internal identifiers', () => {
    const value = input();
    value.observations = [observed(value, 'INQUIRY')];
    const prepared = prepareSocialDecisionPlannerInput(value);
    const signal = prepared.plannerInput.personalization!.signals.find(
      (s) => s.type === 'POST_PERFORMANCE',
    )!;
    expect(JSON.parse(signal.value)).toMatchObject({
      observations: [
        {
          metrics: {
            engagementScore: { status: 'MEASURED', value: 0 },
            shares: { status: 'UNKNOWN', value: null },
          },
        },
      ],
    });
    for (const privateId of [
      'private-observation-id',
      'group-private',
      'owner-private',
      value.scope.workspaceId,
    ])
      expect(signal.value).not.toContain(privateId);
  });

  it('accepts real-row projections without inventing createdAt, updatedAt, metadata or idempotency keys', () => {
    const value = input();
    value.observations = [
      {
        scope: value.scope,
        data: {
          id: 'copy',
          type: 'ACTIVITY',
          data: {
            id: 'private-row',
            workspaceId: value.scope.workspaceId,
            bunshinId: value.scope.bunshinId,
            actorUserId: value.scope.ownerUserId,
            dailyMissionId: 'private-mission',
            type: 'COPIED_TEXT',
            occurredAt: new Date('2026-08-20T00:00:00Z'),
          },
        },
      },
    ];
    const prepared = prepareSocialDecisionPlannerInput(value);
    const signal = prepared.plannerInput.personalization!.signals.find(
      (s) => s.type === 'RECENT_ACTIVITY',
    )!;
    expect(JSON.parse(signal.value)).toMatchObject({ observations: [{ activity: 'COPIED_TEXT' }] });
    expect(signal.value).not.toContain('POSTED');
    expect(signal.value).not.toContain('private-row');
    expect(signal.value).not.toContain('idempotencyKey');
  });

  it('rejects Customer B observations and a mismatching caller scope', () => {
    const value = input();
    const observation = observed(value, 'INQUIRY');
    observation.scope = { ...value.scope, ownerUserId: 'customer-b' };
    value.observations = [observation];
    expect(() => prepareSocialDecisionPlannerInput(value)).toThrow('scope mismatch');
    expect(() =>
      prepareSocialDecisionPlannerInput({
        ...input(),
        scope: { ...input().scope, workspaceId: 'other' },
      }),
    ).toThrow('scope mismatch');
  });

  it('does not mutate planner/history inputs and fails closed for missing business or changed Goal', () => {
    const value = input();
    const before = structuredClone(value);
    prepareSocialDecisionPlannerInput(value);
    expect(value).toEqual(before);
    expect(() => prepareSocialDecisionPlannerInput({ ...value, currentGoal: 'RECRUIT' })).toThrow(
      'not ready',
    );
    expect(() =>
      prepareSocialDecisionPlannerInput({
        ...value,
        plannerInput: { ...value.plannerInput, businessProfile: null },
      }),
    ).toThrow('not ready');
  });

  it('keeps a superseded strategy effective only for its matching confirmed weekly snapshot', () => {
    const value = input();
    value.plannerInput.approvedStrategy.status = 'SUPERSEDED';
    value.plannerInput.approvedStrategy.supersededAt = new Date('2026-08-20T00:00:00Z');
    expect(prepareSocialDecisionPlannerInput(value).context.status).toBe('READY');

    value.plannerInput.weeklyPlan.strategyId = 'another-strategy';
    expect(() => prepareSocialDecisionPlannerInput(value)).toThrow('not ready');
  });

  it('bounds complete JSON and reports omissions without slicing JSON or fabricating missing values', () => {
    const value = input();
    value.observations = Array.from({ length: 30 }, (_, i) => {
      const observation = observed(value, 'INQUIRY');
      observation.data.id = `observation-${i}`;
      return observation;
    });
    const signal = prepareSocialDecisionPlannerInput(
      value,
    ).plannerInput.personalization!.signals.find((s) => s.type === 'POST_PERFORMANCE')!;
    expect(signal.value.length).toBeLessThanOrEqual(3000);
    expect(JSON.parse(signal.value).omittedCount).toBeGreaterThan(0);
  });

  it('caps execution time to today without widening the approved budget or mutating strategy', async () => {
    const value = input();
    value.today = { scope: value.scope, data: { availableMinutes: 3, ownerNote: null } };
    const prepared = prepareSocialDecisionPlannerInput(value);
    expect(prepared.plannerInput.approvedStrategy.availableMinutes).toBe(3);
    expect(value.plannerInput.approvedStrategy.availableMinutes).toBe(5);
    await expect(
      new GenerateDailyMissionBrief(provider()).execute(prepared.plannerInput),
    ).rejects.toThrow('estimated minutes');
    value.today.data.availableMinutes = 20;
    expect(
      prepareSocialDecisionPlannerInput(value).plannerInput.approvedStrategy.availableMinutes,
    ).toBe(5);
  });

  it('does not send season reference identifiers in personalization', () => {
    const value = input();
    value.season = {
      scope: value.scope,
      data: { summary: '確認済みの季節メモ', sourceRef: 'private-season-reference' },
    };
    const prepared = prepareSocialDecisionPlannerInput(value);
    expect(prepared.plannerInput.personalization!.instruction).toContain('確認済みの季節メモ');
    expect(prepared.plannerInput.personalization!.instruction).not.toContain(
      'private-season-reference',
    );
  });
});
