import { ApplicationError } from '@bunshin/shared';
import type { MemberUsageScope } from './member-usage';
import {
  assertNotSelfServiceReferral,
  SERVICE_REFERRAL_STATUSES,
  type ServiceReferralStatus,
} from './service-referral-credit';

export const SERVICE_REFERRAL_QUALIFICATION_VERSION = 'service-referral-qualification-v1';
interface ServiceScope {
  workspaceId: string;
  serviceId: string;
}
interface Participant {
  groupMembershipId: string;
  userId: string;
}

export interface ServiceReferralQualificationRule {
  scope: ServiceScope;
  ruleKey: string;
  version: number;
  status: 'ACTIVE' | 'SUSPENDED';
  timezone: string;
  requireNewRegistration: boolean;
  requireOnboarding: boolean;
  requireFirstUserGeneration: boolean;
  minimumActiveDays: number;
}

export interface ServiceReferralQualificationEvidence {
  scope: ServiceScope;
  referralId: string;
  referrer: Participant;
  referred: Participant;
  status: ServiceReferralStatus;
  registeredAt: Date | null;
  onboardingCompletedAt: Date | null;
  /** null means legacy provenance cannot establish whether this was a new service member. */
  newRegistration: boolean | null;
  /** An internal adapter must verify the existing service/membership uniqueness boundary. */
  uniqueAttribution: boolean | null;
  review: 'CLEAR' | 'REQUIRED' | 'UNKNOWN';
  completeness: 'COMPLETE' | 'PARTIAL';
  hasUnknownGenerationTrigger: boolean;
  /**
   * Verified actual usage only, through the owner/service boundary. These are projections,
   * not new stored events. USER_GENERATION means successful, explicit USER-origin generation.
   * No login, scheduled/unknown-origin or failed generation may be projected as actual usage.
   */
  activities: readonly {
    id: string;
    scope: MemberUsageScope;
    kind: 'USER_GENERATION' | 'DECISION' | 'COPY' | 'POST_REPORT';
    occurredAt: Date;
  }[];
}

type Decision = 'QUALIFIED' | 'PENDING' | 'UNKNOWN' | 'REVIEW_REQUIRED' | 'REJECTED' | 'SUSPENDED';
type Reason =
  | 'CONDITIONS_MET'
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
  | 'EXISTING_MEMBER'
  | 'ONBOARDING_PENDING'
  | 'FIRST_USER_GENERATION_PENDING'
  | 'GENERATION_ORIGIN_UNKNOWN'
  | 'ACTIVE_DAYS_PENDING'
  | 'ACTIVITY_ORIGIN_UNKNOWN';

export interface ServiceReferralQualification {
  version: typeof SERVICE_REFERRAL_QUALIFICATION_VERSION;
  ruleKey: string;
  ruleVersion: number;
  asOf: string;
  timezone: string;
  decision: Decision;
  reasons: Reason[];
}

const invalid = () =>
  new ApplicationError('VALIDATION_ERROR', 'invalid referral qualification evidence');
const text = (value: string, max = 120) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  value === value.trim();
const flag = (value: boolean | null) => value === null || typeof value === 'boolean';
const date = (value: Date | null) =>
  value === null || (value instanceof Date && Number.isFinite(value.getTime()));
// Keep the declared readonly element type while checking malformed runtime inputs.
const arrayValue = (value: unknown): boolean => Array.isArray(value);
const sameScope = (a: ServiceScope, b: ServiceScope) =>
  a.workspaceId === b.workspaceId && a.serviceId === b.serviceId;

export function normalizeServiceReferralQualificationRule(
  input: ServiceReferralQualificationRule,
): ServiceReferralQualificationRule {
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
    typeof input.requireNewRegistration !== 'boolean' ||
    typeof input.requireOnboarding !== 'boolean' ||
    typeof input.requireFirstUserGeneration !== 'boolean' ||
    !Number.isSafeInteger(input.minimumActiveDays) ||
    input.minimumActiveDays < 0 ||
    input.minimumActiveDays > 3660
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
    requireOnboarding: input.requireOnboarding,
    requireFirstUserGeneration: input.requireFirstUserGeneration,
    minimumActiveDays: input.minimumActiveDays,
  };
}

/** Internal pure policy evaluation. Does not authorize, persist qualification, count or grant rewards. */
export function evaluateServiceReferralQualification(
  inputRule: ServiceReferralQualificationRule,
  evidence: ServiceReferralQualificationEvidence,
  asOf: Date,
): ServiceReferralQualification {
  const rule = normalizeServiceReferralQualificationRule(inputRule);
  if (
    !(asOf instanceof Date) ||
    !Number.isFinite(asOf.getTime()) ||
    !evidence ||
    !evidence.scope ||
    !sameScope(rule.scope, evidence.scope) ||
    !text(evidence.referralId) ||
    !evidence.referrer ||
    !evidence.referred ||
    [evidence.referrer, evidence.referred].some(
      (p) => !text(p.groupMembershipId) || !text(p.userId),
    ) ||
    !SERVICE_REFERRAL_STATUSES.includes(evidence.status) ||
    !date(evidence.registeredAt) ||
    !date(evidence.onboardingCompletedAt) ||
    !flag(evidence.newRegistration) ||
    !flag(evidence.uniqueAttribution) ||
    !['CLEAR', 'REQUIRED', 'UNKNOWN'].includes(evidence.review) ||
    !['COMPLETE', 'PARTIAL'].includes(evidence.completeness) ||
    typeof evidence.hasUnknownGenerationTrigger !== 'boolean' ||
    !arrayValue(evidence.activities) ||
    evidence.activities.length > 10000 ||
    Array.from(evidence.activities).some(
      (event) =>
        !event ||
        !text(event.id) ||
        !event.scope ||
        !sameScope(rule.scope, event.scope) ||
        event.scope.userId !== evidence.referred.userId ||
        event.scope.groupMembershipId !== evidence.referred.groupMembershipId ||
        !text(event.scope.bunshinId) ||
        !['USER_GENERATION', 'DECISION', 'COPY', 'POST_REPORT'].includes(event.kind) ||
        !(event.occurredAt instanceof Date) ||
        !Number.isFinite(event.occurredAt.getTime()),
    )
  )
    throw invalid();
  const identities = new Map<string, string>();
  for (const event of evidence.activities) {
    const key = `${event.kind}:${event.id}`;
    const fingerprint = `${event.scope.bunshinId}:${event.occurredAt.getTime()}`;
    if (identities.has(key) && identities.get(key) !== fingerprint) throw invalid();
    identities.set(key, fingerprint);
  }
  const result = (decision: Decision, reasons: Reason[]): ServiceReferralQualification => ({
    version: SERVICE_REFERRAL_QUALIFICATION_VERSION,
    ruleKey: rule.ruleKey,
    ruleVersion: rule.version,
    asOf: asOf.toISOString(),
    timezone: rule.timezone,
    decision,
    reasons,
  });
  try {
    assertNotSelfServiceReferral({
      referrerMembershipId: evidence.referrer.groupMembershipId,
      referrerUserId: evidence.referrer.userId,
      referredMembershipId: evidence.referred.groupMembershipId,
      referredUserId: evidence.referred.userId,
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'VALIDATION_ERROR')
      return result('REJECTED', ['SELF_REFERRAL']);
    throw error;
  }
  if (evidence.status === 'REJECTED') return result('REJECTED', ['REFERRAL_REJECTED']);
  if (rule.status === 'SUSPENDED') return result('SUSPENDED', ['RULE_SUSPENDED']);
  if (rule.requireNewRegistration && evidence.newRegistration === false)
    return result('REJECTED', ['EXISTING_MEMBER']);
  const review: Reason[] = [];
  if (evidence.uniqueAttribution === false) review.push('ATTRIBUTION_CONFLICT');
  if (evidence.review === 'REQUIRED') review.push('REVIEW_PENDING');
  if (review.length) return result('REVIEW_REQUIRED', review);
  const unknown: Reason[] = [];
  if (evidence.uniqueAttribution === null) unknown.push('ATTRIBUTION_UNKNOWN');
  if (evidence.review === 'UNKNOWN') unknown.push('REVIEW_UNKNOWN');
  if (evidence.completeness !== 'COMPLETE') unknown.push('INCOMPLETE_SOURCE');
  if (rule.requireNewRegistration && evidence.newRegistration === null)
    unknown.push('NEW_REGISTRATION_UNKNOWN');
  if (unknown.length) return result('UNKNOWN', unknown);
  const registration = evidence.registeredAt;
  if (evidence.status === 'CLICKED' || !registration || registration > asOf)
    return result('PENDING', ['REGISTRATION_PENDING']);
  const activities = evidence.activities.filter(
    (event) => event.occurredAt >= registration && event.occurredAt <= asOf,
  );
  const pending: Reason[] = [];
  if (
    rule.requireOnboarding &&
    (!evidence.onboardingCompletedAt ||
      evidence.onboardingCompletedAt < registration ||
      evidence.onboardingCompletedAt > asOf)
  )
    pending.push('ONBOARDING_PENDING');
  if (
    rule.requireFirstUserGeneration &&
    !activities.some((event) => event.kind === 'USER_GENERATION')
  ) {
    if (evidence.hasUnknownGenerationTrigger) unknown.push('GENERATION_ORIGIN_UNKNOWN');
    else pending.push('FIRST_USER_GENERATION_PENDING');
  }
  const localDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: rule.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const activeDays = new Set(activities.map((event) => localDate.format(event.occurredAt))).size;
  if (activeDays < rule.minimumActiveDays) {
    if (evidence.hasUnknownGenerationTrigger) unknown.push('ACTIVITY_ORIGIN_UNKNOWN');
    else pending.push('ACTIVE_DAYS_PENDING');
  }
  if (unknown.length) return result('UNKNOWN', [...unknown, ...pending]);
  if (pending.length) return result('PENDING', pending);
  return result('QUALIFIED', ['CONDITIONS_MET']);
}
