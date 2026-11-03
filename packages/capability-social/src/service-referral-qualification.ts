import { ApplicationError } from '@bunshin/shared';
import {
  evaluateServiceReferralQualificationGate,
  normalizeServiceReferralQualificationPolicy,
  type MemberUsageScope,
  type ServiceReferralQualificationPolicy,
  type ServiceReferralQualificationMemberEvidence,
  type ServiceReferralQualificationGateReason,
  type ServiceReferralQualificationScope as ServiceScope,
} from '@bunshin/application';

export const SOCIAL_SERVICE_REFERRAL_QUALIFICATION_VERSION = 'service-referral-qualification-v1';
export interface SocialServiceReferralQualificationRule extends ServiceReferralQualificationPolicy {
  requireOnboarding: boolean;
  requireFirstUserGeneration: boolean;
  minimumActiveDays: number;
}

export interface SocialServiceReferralQualificationEvidence extends ServiceReferralQualificationMemberEvidence {
  onboardingCompletedAt: Date | null;
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
  | ServiceReferralQualificationGateReason
  | 'ONBOARDING_PENDING'
  | 'FIRST_USER_GENERATION_PENDING'
  | 'GENERATION_ORIGIN_UNKNOWN'
  | 'ACTIVE_DAYS_PENDING'
  | 'ACTIVITY_ORIGIN_UNKNOWN'
  | 'CONDITIONS_MET';

export interface SocialServiceReferralQualification {
  version: typeof SOCIAL_SERVICE_REFERRAL_QUALIFICATION_VERSION;
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
const date = (value: Date | null) =>
  value === null || (value instanceof Date && Number.isFinite(value.getTime()));
// Keep the declared readonly element type while checking malformed runtime inputs.
const arrayValue = (value: unknown): boolean => Array.isArray(value);
const sameScope = (a: ServiceScope, b: ServiceScope) =>
  a.workspaceId === b.workspaceId && a.serviceId === b.serviceId;

export function normalizeSocialServiceReferralQualificationRule(
  input: SocialServiceReferralQualificationRule,
): SocialServiceReferralQualificationRule {
  const policy = normalizeServiceReferralQualificationPolicy(input);
  if (
    typeof input.requireOnboarding !== 'boolean' ||
    typeof input.requireFirstUserGeneration !== 'boolean' ||
    !Number.isSafeInteger(input.minimumActiveDays) ||
    input.minimumActiveDays < 0 ||
    input.minimumActiveDays > 3660
  )
    throw invalid();
  return {
    ...policy,
    requireOnboarding: input.requireOnboarding,
    requireFirstUserGeneration: input.requireFirstUserGeneration,
    minimumActiveDays: input.minimumActiveDays,
  };
}

/** Internal pure policy evaluation. Does not authorize, persist qualification, count or grant rewards. */
export function evaluateSocialServiceReferralQualification(
  inputRule: SocialServiceReferralQualificationRule,
  evidence: SocialServiceReferralQualificationEvidence,
  asOf: Date,
): SocialServiceReferralQualification {
  const rule = normalizeSocialServiceReferralQualificationRule(inputRule);
  const gate = evaluateServiceReferralQualificationGate(rule, evidence, asOf);
  if (
    !date(evidence.onboardingCompletedAt) ||
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
  const result = (decision: Decision, reasons: Reason[]): SocialServiceReferralQualification => ({
    version: SOCIAL_SERVICE_REFERRAL_QUALIFICATION_VERSION,
    ruleKey: rule.ruleKey,
    ruleVersion: rule.version,
    asOf: asOf.toISOString(),
    timezone: rule.timezone,
    decision,
    reasons,
  });
  if (gate.decision !== 'CONTINUE') return result(gate.decision, gate.reasons);
  const registration = evidence.registeredAt;
  if (!registration) throw invalid();
  const activities = evidence.activities.filter(
    (event) => event.occurredAt >= registration && event.occurredAt <= asOf,
  );
  const unknown: Reason[] = [];
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
