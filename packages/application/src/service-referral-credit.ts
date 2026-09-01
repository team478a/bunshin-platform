import { ApplicationError } from '@bunshin/shared';

export const SERVICE_REFERRAL_STATUSES = [
  'CLICKED',
  'REGISTERED',
  'ONBOARDING_COMPLETED',
  'FIRST_CONTENT_VIEWED',
  'FIRST_POST_REPORTED',
  'REJECTED',
] as const;
export type ServiceReferralStatus = (typeof SERVICE_REFERRAL_STATUSES)[number];

export const SERVICE_REFERRAL_MILESTONES = ['ONBOARDING_COMPLETED', 'FIRST_POST_REPORTED'] as const;
export type ServiceReferralMilestone = (typeof SERVICE_REFERRAL_MILESTONES)[number];

export const SERVICE_REFERRAL_REWARD_RECIPIENTS = ['REFERRER', 'REFERRED'] as const;
export type ServiceReferralRewardRecipient = (typeof SERVICE_REFERRAL_REWARD_RECIPIENTS)[number];

export const SERVICE_CREDIT_TRANSACTION_TYPES = [
  'GRANT',
  'CONSUME',
  'REFUND',
  'EXPIRE',
  'ADJUST',
] as const;
export type ServiceCreditTransactionType = (typeof SERVICE_CREDIT_TRANSACTION_TYPES)[number];

export const SERVICE_CREDIT_SOURCE_TYPES = [
  'REFERRAL',
  'CAMPAIGN',
  'PURCHASE',
  'ADMIN',
  'SYSTEM',
] as const;
export type ServiceCreditSourceType = (typeof SERVICE_CREDIT_SOURCE_TYPES)[number];

export interface ServiceReferralAttributionInput {
  source?: string | null;
  campaignKey?: string | null;
  contentKey?: string | null;
  landingVariant?: string | null;
}

export interface ServiceReferralRewardRuleInput {
  ruleKey: string;
  milestone: ServiceReferralMilestone;
  recipient: ServiceReferralRewardRecipient;
  creditAmount: number;
  expiresAfterDays?: number | null;
  monthlyGrantLimit?: number | null;
}

const optional = (value: string | null | undefined, field: string, maximum: number) => {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

const required = (value: string, field: string, maximum: number) => {
  const normalized = optional(value, field, maximum);
  if (!normalized) throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

const positiveInteger = (value: number, field: string, maximum: number) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
};

export function normalizeServiceReferralCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,80}$/.test(code))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid service referral code');
  return code;
}

/**
 * Keeps public referral parameters bounded and free of a URL or personal data.
 * The route chooses the service and code server-side; clients only supply labels.
 */
export function normalizeServiceReferralAttribution(input: ServiceReferralAttributionInput) {
  return {
    source: optional(input.source, 'source', 80),
    campaignKey: optional(input.campaignKey, 'campaign key', 120),
    contentKey: optional(input.contentKey, 'content key', 120),
    landingVariant: optional(input.landingVariant, 'landing variant', 120),
  };
}

/** Rules are versioned by the repository; this validates an individual version. */
export function normalizeServiceReferralRewardRule(input: ServiceReferralRewardRuleInput) {
  if (!SERVICE_REFERRAL_MILESTONES.includes(input.milestone))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid referral milestone');
  if (!SERVICE_REFERRAL_REWARD_RECIPIENTS.includes(input.recipient))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid referral reward recipient');
  return {
    ruleKey: required(input.ruleKey, 'rule key', 100),
    milestone: input.milestone,
    recipient: input.recipient,
    creditAmount: positiveInteger(input.creditAmount, 'credit amount', 100_000),
    expiresAfterDays:
      input.expiresAfterDays === undefined || input.expiresAfterDays === null
        ? null
        : positiveInteger(input.expiresAfterDays, 'credit expiry days', 3_650),
    monthlyGrantLimit:
      input.monthlyGrantLimit === undefined || input.monthlyGrantLimit === null
        ? null
        : positiveInteger(input.monthlyGrantLimit, 'monthly grant limit', 100_000),
  };
}

/** Prevents a user from being credited for introducing their own service membership. */
export function assertNotSelfServiceReferral(input: {
  referrerMembershipId: string;
  referredMembershipId: string;
  referrerUserId: string;
  referredUserId: string;
}) {
  if (
    input.referrerMembershipId === input.referredMembershipId ||
    input.referrerUserId === input.referredUserId
  )
    throw new ApplicationError('VALIDATION_ERROR', 'self referral is not allowed');
}
