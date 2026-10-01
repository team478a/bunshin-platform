import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SOCIAL_GOALS,
  SERVICE_BUSINESS_PURPOSES,
  SOCIAL_ACCOUNT_STRATEGY_GOALS,
  canonicalGoalFromAccountStrategy,
  canonicalGoalFromBusinessPurpose,
  initialSocialAccountStrategyGoal,
  isServiceBusinessPurpose,
  weeklySocialGoalPlanningProfile,
} from '../src';

describe('canonical SOCIAL goals', () => {
  it('defines the V1 business outcomes without mixing in destinations or intermediate metrics', () => {
    expect(CANONICAL_SOCIAL_GOALS).toEqual([
      'AWARENESS',
      'VISIT_RESERVATION',
      'INQUIRY',
      'REPEAT',
      'RECRUITMENT',
      'SALES',
      'TRUST_EXPERTISE',
      'OTHER',
    ]);
    expect(CANONICAL_SOCIAL_GOALS).not.toContain('FOLLOWERS');
    expect(CANONICAL_SOCIAL_GOALS).not.toContain('LINE_REGISTRATION');
    expect(CANONICAL_SOCIAL_GOALS).not.toContain('BLOG_TRAFFIC');
  });

  it('maps every existing service business purpose or requires an explicit review', () => {
    const mappings = Object.fromEntries(
      SERVICE_BUSINESS_PURPOSES.map((purpose) => [
        purpose,
        canonicalGoalFromBusinessPurpose(purpose),
      ]),
    );

    expect(mappings).toEqual({
      ATTRACT: {
        status: 'REVIEW_REQUIRED',
        candidates: ['VISIT_RESERVATION', 'INQUIRY', 'SALES'],
        reason: 'BUSINESS_PURPOSE_TOO_BROAD',
      },
      RESERVATION: { status: 'RESOLVED', goal: 'VISIT_RESERVATION' },
      SALES: { status: 'RESOLVED', goal: 'SALES' },
      RECRUITING: { status: 'RESOLVED', goal: 'RECRUITMENT' },
      AWARENESS: { status: 'RESOLVED', goal: 'AWARENESS' },
      RETENTION: { status: 'RESOLVED', goal: 'REPEAT' },
    });
  });

  it('does not silently treat account destinations and intermediate metrics as business goals', () => {
    const mappings = Object.fromEntries(
      SOCIAL_ACCOUNT_STRATEGY_GOALS.map((goal) => [goal, canonicalGoalFromAccountStrategy(goal)]),
    );

    expect(mappings).toEqual({
      FOLLOWERS: {
        status: 'REVIEW_REQUIRED',
        candidates: ['AWARENESS', 'TRUST_EXPERTISE'],
        reason: 'INTERMEDIATE_METRIC_IS_NOT_BUSINESS_GOAL',
      },
      LINE_REGISTRATION: {
        status: 'REVIEW_REQUIRED',
        candidates: ['INQUIRY', 'VISIT_RESERVATION', 'SALES'],
        reason: 'DESTINATION_IS_NOT_BUSINESS_GOAL',
      },
      INQUIRY: { status: 'RESOLVED', goal: 'INQUIRY' },
      VISIT_RESERVATION: { status: 'RESOLVED', goal: 'VISIT_RESERVATION' },
      SALES: { status: 'RESOLVED', goal: 'SALES' },
      RECRUIT: { status: 'RESOLVED', goal: 'RECRUITMENT' },
      REPEAT: { status: 'RESOLVED', goal: 'REPEAT' },
      BRAND_AWARENESS: { status: 'RESOLVED', goal: 'AWARENESS' },
      TRUST_EXPERTISE: { status: 'RESOLVED', goal: 'TRUST_EXPERTISE' },
      BLOG_TRAFFIC: {
        status: 'REVIEW_REQUIRED',
        candidates: ['AWARENESS', 'TRUST_EXPERTISE', 'INQUIRY'],
        reason: 'DESTINATION_IS_NOT_BUSINESS_GOAL',
      },
      OTHER: { status: 'RESOLVED', goal: 'OTHER' },
    });
  });

  it('derives the initial account strategy from each precise onboarding purpose', () => {
    expect(initialSocialAccountStrategyGoal('AWARENESS')).toEqual({
      status: 'RESOLVED',
      goal: 'BRAND_AWARENESS',
      destinationType: 'PROFILE',
    });
    expect(initialSocialAccountStrategyGoal('RESERVATION')).toEqual({
      status: 'RESOLVED',
      goal: 'VISIT_RESERVATION',
      destinationType: 'NONE',
    });
    expect(initialSocialAccountStrategyGoal('SALES')).toEqual({
      status: 'RESOLVED',
      goal: 'SALES',
      destinationType: 'NONE',
    });
    expect(initialSocialAccountStrategyGoal('RECRUITING')).toEqual({
      status: 'RESOLVED',
      goal: 'RECRUIT',
      destinationType: 'NONE',
    });
    expect(initialSocialAccountStrategyGoal('RETENTION')).toEqual({
      status: 'RESOLVED',
      goal: 'REPEAT',
      destinationType: 'NONE',
    });
  });

  it('requires a conversion choice for the broad ATTRACT purpose', () => {
    expect(initialSocialAccountStrategyGoal('ATTRACT')).toEqual({
      status: 'REVIEW_REQUIRED',
      candidates: ['VISIT_RESERVATION', 'INQUIRY', 'SALES'],
      reason: 'BUSINESS_PURPOSE_TOO_BROAD',
    });
  });

  it('validates persisted service purpose strings at the boundary', () => {
    expect(isServiceBusinessPurpose('RETENTION')).toBe(true);
    expect(isServiceBusinessPurpose('UNKNOWN')).toBe(false);
  });

  it('defines materially different weekly planning directions for the seven V1 outcomes', () => {
    const goals = [
      'BRAND_AWARENESS',
      'VISIT_RESERVATION',
      'INQUIRY',
      'REPEAT',
      'RECRUIT',
      'SALES',
      'TRUST_EXPERTISE',
    ] as const;
    const profiles = goals.map(weeklySocialGoalPlanningProfile);

    expect(new Set(profiles.map(({ strategyFocus }) => strategyFocus)).size).toBe(goals.length);
    expect(new Set(profiles.map(({ topicDirections }) => topicDirections.join('|'))).size).toBe(
      goals.length,
    );
    expect(weeklySocialGoalPlanningProfile('BRAND_AWARENESS').topicDirections).toContain(
      'ブランドストーリー',
    );
    expect(weeklySocialGoalPlanningProfile('VISIT_RESERVATION').topicDirections).toContain(
      '初回来店の流れ',
    );
    expect(weeklySocialGoalPlanningProfile('REPEAT').topicDirections).toContain('アフターケア');
    expect(weeklySocialGoalPlanningProfile('RECRUIT').topicDirections).toContain('職場環境');
    expect(weeklySocialGoalPlanningProfile('SALES').topicDirections).toContain('購入理由');
  });

  it('keeps intermediate metrics and destinations distinct from business outcomes', () => {
    expect(weeklySocialGoalPlanningProfile('FOLLOWERS')).toMatchObject({
      goalKind: 'INTERMEDIATE_METRIC',
      canonicalGoal: null,
    });
    expect(weeklySocialGoalPlanningProfile('LINE_REGISTRATION')).toMatchObject({
      goalKind: 'DESTINATION',
      canonicalGoal: null,
    });
    expect(weeklySocialGoalPlanningProfile('BLOG_TRAFFIC')).toMatchObject({
      goalKind: 'DESTINATION',
      canonicalGoal: null,
    });
  });
});
