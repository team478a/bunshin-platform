import { ApplicationError } from '@bunshin/shared';
import {
  assertNotSelfServiceReferral,
  SERVICE_REFERRAL_STATUSES,
  type ServiceReferralStatus,
} from './service-referral-credit';

export interface ServiceReferralQualificationScope {
  workspaceId: string;
  serviceId: string;
}

export interface ServiceReferralQualificationPolicy {
  scope: ServiceReferralQualificationScope;
  ruleKey: string;
  version: number;
  status: 'ACTIVE' | 'SUSPENDED';
  timezone: string;
  requireNewRegistration: boolean;
}

interface Participant {
  groupMembershipId: string;
  userId: string;
}

/** Internal projection. Values must come from an authorized adapter, never client claims. */
export interface ServiceReferralQualificationMemberEvidence {
  scope: ServiceReferralQualificationScope;
  referralId: string;
  referrer: Participant;
  referred: Participant;
  status: ServiceReferralStatus;
  registeredAt: Date | null;
  /** Legacy registration status alone cannot establish new membership. */
  newRegistration: boolean | null;
  /** Verify the existing service/membership uniqueness boundary. */
  uniqueAttribution: boolean | null;
  review: 'CLEAR' | 'REQUIRED' | 'UNKNOWN';
  completeness: 'COMPLETE' | 'PARTIAL';
}

export type ServiceReferralQualificationGateReason =
  | 'RULE_SUSPENDED'
  | 'SELF_REFERRAL'
  | 'REFERRAL_REJECTED'
  | 'ATTRIBUTION_CONFLICT'
  | 'REVIEW_PENDING'
  | 'ATTRIBUTION_UNKNOWN'
  | 'REVIEW_UNKNOWN'
  | 'INCOMPLETE_SOURCE'
  | 'REGISTRATION_PENDING'
  | 'NEW_REGISTRATION_UNKNOWN'
  | 'EXISTING_MEMBER';

export type ServiceReferralQualificationGate =
  | { decision: 'CONTINUE'; reasons: [] }
  | {
      decision: 'PENDING' | 'UNKNOWN' | 'REVIEW_REQUIRED' | 'REJECTED' | 'SUSPENDED';
      reasons: ServiceReferralQualificationGateReason[];
    };

const invalid = () =>
  new ApplicationError('VALIDATION_ERROR', 'invalid referral qualification evidence');
const text = (value: string, max = 120) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  value === value.trim();
const flag = (value: boolean | null) => value === null || typeof value === 'boolean';

export function normalizeServiceReferralQualificationPolicy(
  input: ServiceReferralQualificationPolicy,
): ServiceReferralQualificationPolicy {
  if (
    !input ||
    !input.scope ||
    !text(input.scope.workspaceId) ||
    !text(input.scope.serviceId) ||
    !text(input.ruleKey, 100) ||
    !Number.isSafeInteger(input.version) ||
    input.version < 1 ||
    !['ACTIVE', 'SUSPENDED'].includes(input.status) ||
    !text(input.timezone, 64) ||
    typeof input.requireNewRegistration !== 'boolean'
  )
    throw invalid();
  try {
    new Intl.DateTimeFormat('sv-SE', { timeZone: input.timezone }).format(0);
  } catch {
    throw invalid();
  }
  return {
    scope: { workspaceId: input.scope.workspaceId, serviceId: input.scope.serviceId },
    ruleKey: input.ruleKey,
    version: input.version,
    status: input.status,
    timezone: input.timezone,
    requireNewRegistration: input.requireNewRegistration,
  };
}

/**
 * Common member gate only. CONTINUE is not qualification, authorization, a persisted
 * confirmation or an instruction to grant. The selected capability checks its conditions.
 */
export function evaluateServiceReferralQualificationGate(
  inputPolicy: ServiceReferralQualificationPolicy,
  evidence: ServiceReferralQualificationMemberEvidence,
  asOf: Date,
): ServiceReferralQualificationGate {
  const policy = normalizeServiceReferralQualificationPolicy(inputPolicy);
  if (
    !(asOf instanceof Date) ||
    !Number.isFinite(asOf.getTime()) ||
    !evidence ||
    !evidence.scope ||
    policy.scope.workspaceId !== evidence.scope.workspaceId ||
    policy.scope.serviceId !== evidence.scope.serviceId ||
    !text(evidence.referralId) ||
    !evidence.referrer ||
    !evidence.referred ||
    [evidence.referrer, evidence.referred].some(
      (p) => !text(p.groupMembershipId) || !text(p.userId),
    ) ||
    !SERVICE_REFERRAL_STATUSES.includes(evidence.status) ||
    (evidence.registeredAt !== null &&
      (!(evidence.registeredAt instanceof Date) ||
        !Number.isFinite(evidence.registeredAt.getTime()))) ||
    !flag(evidence.newRegistration) ||
    !flag(evidence.uniqueAttribution) ||
    !['CLEAR', 'REQUIRED', 'UNKNOWN'].includes(evidence.review) ||
    !['COMPLETE', 'PARTIAL'].includes(evidence.completeness)
  )
    throw invalid();
  try {
    assertNotSelfServiceReferral({
      referrerMembershipId: evidence.referrer.groupMembershipId,
      referrerUserId: evidence.referrer.userId,
      referredMembershipId: evidence.referred.groupMembershipId,
      referredUserId: evidence.referred.userId,
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'VALIDATION_ERROR')
      return { decision: 'REJECTED', reasons: ['SELF_REFERRAL'] };
    throw error;
  }
  if (evidence.status === 'REJECTED')
    return { decision: 'REJECTED', reasons: ['REFERRAL_REJECTED'] };
  if (policy.status === 'SUSPENDED') return { decision: 'SUSPENDED', reasons: ['RULE_SUSPENDED'] };
  if (policy.requireNewRegistration && evidence.newRegistration === false)
    return { decision: 'REJECTED', reasons: ['EXISTING_MEMBER'] };
  const review: ServiceReferralQualificationGateReason[] = [];
  if (evidence.uniqueAttribution === false) review.push('ATTRIBUTION_CONFLICT');
  if (evidence.review === 'REQUIRED') review.push('REVIEW_PENDING');
  if (review.length) return { decision: 'REVIEW_REQUIRED', reasons: review };
  const unknown: ServiceReferralQualificationGateReason[] = [];
  if (evidence.uniqueAttribution === null) unknown.push('ATTRIBUTION_UNKNOWN');
  if (evidence.review === 'UNKNOWN') unknown.push('REVIEW_UNKNOWN');
  if (evidence.completeness !== 'COMPLETE') unknown.push('INCOMPLETE_SOURCE');
  if (policy.requireNewRegistration && evidence.newRegistration === null)
    unknown.push('NEW_REGISTRATION_UNKNOWN');
  if (unknown.length) return { decision: 'UNKNOWN', reasons: unknown };
  if (evidence.status === 'CLICKED' || !evidence.registeredAt || evidence.registeredAt > asOf)
    return { decision: 'PENDING', reasons: ['REGISTRATION_PENDING'] };
  return { decision: 'CONTINUE', reasons: [] };
}
