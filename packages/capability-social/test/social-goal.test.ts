import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SOCIAL_GOALS,
  SERVICE_BUSINESS_PURPOSES,
  SOCIAL_ACCOUNT_STRATEGY_GOALS,
  canonicalGoalFromAccountStrategy,
  canonicalGoalFromBusinessPurpose,
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
      SALES: { status: 'RESOLVED', goal: 'SALES' },
      RECRUIT: { status: 'RESOLVED', goal: 'RECRUITMENT' },
      BRAND_AWARENESS: { status: 'RESOLVED', goal: 'AWARENESS' },
      BLOG_TRAFFIC: {
        status: 'REVIEW_REQUIRED',
        candidates: ['AWARENESS', 'TRUST_EXPERTISE', 'INQUIRY'],
        reason: 'DESTINATION_IS_NOT_BUSINESS_GOAL',
      },
      OTHER: { status: 'RESOLVED', goal: 'OTHER' },
    });
  });
});
