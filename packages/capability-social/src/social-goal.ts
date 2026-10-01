import type { SocialAccountStrategyGoal } from './social-account-strategy';

/**
 * Business outcomes that SOCIAL planning may optimize for.
 *
 * These are intentionally separate from destinations and intermediate metrics
 * such as followers, LINE registrations, and blog traffic.
 */
export const CANONICAL_SOCIAL_GOALS = [
  'AWARENESS',
  'VISIT_RESERVATION',
  'INQUIRY',
  'REPEAT',
  'RECRUITMENT',
  'SALES',
  'TRUST_EXPERTISE',
  'OTHER',
] as const;

export type CanonicalSocialGoal = (typeof CANONICAL_SOCIAL_GOALS)[number];

/** Existing values accepted by service business-profile onboarding. */
export const SERVICE_BUSINESS_PURPOSES = [
  'ATTRACT',
  'RESERVATION',
  'SALES',
  'RECRUITING',
  'AWARENESS',
  'RETENTION',
] as const;

export type ServiceBusinessPurpose = (typeof SERVICE_BUSINESS_PURPOSES)[number];

export type SocialGoalMappingReviewReason =
  | 'BUSINESS_PURPOSE_TOO_BROAD'
  | 'INTERMEDIATE_METRIC_IS_NOT_BUSINESS_GOAL'
  | 'DESTINATION_IS_NOT_BUSINESS_GOAL';

export type CanonicalSocialGoalMapping =
  | {
      status: 'RESOLVED';
      goal: CanonicalSocialGoal;
    }
  | {
      status: 'REVIEW_REQUIRED';
      candidates: readonly CanonicalSocialGoal[];
      reason: SocialGoalMappingReviewReason;
    };

const businessPurposeMappings = {
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
} as const satisfies Record<ServiceBusinessPurpose, CanonicalSocialGoalMapping>;

const accountStrategyGoalMappings = {
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
} as const satisfies Record<SocialAccountStrategyGoal, CanonicalSocialGoalMapping>;

export function canonicalGoalFromBusinessPurpose(
  purpose: ServiceBusinessPurpose,
): CanonicalSocialGoalMapping {
  return businessPurposeMappings[purpose];
}

export function canonicalGoalFromAccountStrategy(
  goal: SocialAccountStrategyGoal,
): CanonicalSocialGoalMapping {
  return accountStrategyGoalMappings[goal];
}
