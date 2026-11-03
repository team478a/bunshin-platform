import { describe, expect, it } from 'vitest';
import {
  evaluateServiceReferralQualificationGate,
  normalizeServiceReferralQualificationPolicy,
  type ServiceReferralQualificationMemberEvidence,
  type ServiceReferralQualificationPolicy,
} from '../src/index';

function setup() {
  const policy: ServiceReferralQualificationPolicy = {
    scope: { workspaceId: 'workspace', serviceId: 'service' },
    ruleKey: 'member-policy',
    version: 1,
    status: 'ACTIVE',
    timezone: 'Asia/Tokyo',
    requireNewRegistration: true,
  };
  const evidence: ServiceReferralQualificationMemberEvidence = {
    scope: { ...policy.scope },
    referralId: 'referral',
    referrer: { groupMembershipId: 'introducer-member', userId: 'introducer' },
    referred: { groupMembershipId: 'member', userId: 'owner' },
    status: 'REGISTERED',
    registeredAt: new Date('2026-11-01T00:00:00Z'),
    newRegistration: true,
    uniqueAttribution: true,
    review: 'CLEAR',
    completeness: 'COMPLETE',
  };
  const asOf = new Date('2026-11-02T00:00:00Z');
  return {
    policy,
    evidence,
    asOf,
    evaluate: () => evaluateServiceReferralQualificationGate(policy, evidence, asOf),
  };
}

describe('common service referral member gate', () => {
  it('accepts a service member without any Bunshin or SNS facts, but never qualifies them', () => {
    const s = setup();
    const before = structuredClone({ policy: s.policy, evidence: s.evidence });
    expect(s.evaluate()).toEqual({ decision: 'CONTINUE', reasons: [] });
    expect(s.evaluate()).toEqual(s.evaluate());
    expect(s.policy).toEqual(before.policy);
    expect(s.evidence).toEqual(before.evidence);
    expect(JSON.stringify(s.evaluate())).not.toMatch(/workspace|referral|member|owner|introducer/);
  });

  it.each([
    'REGISTERED',
    'ONBOARDING_COMPLETED',
    'FIRST_CONTENT_VIEWED',
    'FIRST_POST_REPORTED',
  ] as const)('does not infer capability achievement or new registration from %s', (status) => {
    const s = setup();
    s.evidence.status = status;
    expect(s.evaluate().decision).toBe('CONTINUE');
    s.evidence.newRegistration = null;
    expect(s.evaluate()).toEqual({ decision: 'UNKNOWN', reasons: ['NEW_REGISTRATION_UNKNOWN'] });
  });

  it.each(['userId', 'groupMembershipId'] as const)('rejects self referral by %s', (key) => {
    const s = setup();
    s.evidence.referred[key] = s.evidence.referrer[key];
    s.policy.status = 'SUSPENDED';
    s.evidence.review = 'REQUIRED';
    expect(s.evaluate()).toEqual({ decision: 'REJECTED', reasons: ['SELF_REFERRAL'] });
  });

  it('preserves existing rejection before considering a stopped rule', () => {
    const s = setup();
    s.evidence.status = 'REJECTED';
    s.policy.status = 'SUSPENDED';
    expect(s.evaluate()).toEqual({ decision: 'REJECTED', reasons: ['REFERRAL_REJECTED'] });
  });

  it('stops new evaluation without redefining the stored referral status', () => {
    const s = setup();
    s.policy.status = 'SUSPENDED';
    expect(s.evaluate()).toEqual({ decision: 'SUSPENDED', reasons: ['RULE_SUSPENDED'] });
    expect(s.evidence.status).toBe('REGISTERED');
  });

  it('requires new membership only when explicitly selected by the service policy', () => {
    const s = setup();
    s.evidence.newRegistration = false;
    expect(s.evaluate()).toEqual({ decision: 'REJECTED', reasons: ['EXISTING_MEMBER'] });
    s.policy.requireNewRegistration = false;
    expect(s.evaluate().decision).toBe('CONTINUE');
    s.evidence.newRegistration = null;
    expect(s.evaluate().decision).toBe('CONTINUE');
  });

  it('keeps investigation separate from fraud rejection and unknown evidence', () => {
    const s = setup();
    s.evidence.uniqueAttribution = false;
    s.evidence.review = 'REQUIRED';
    s.evidence.completeness = 'PARTIAL';
    expect(s.evaluate()).toEqual({
      decision: 'REVIEW_REQUIRED',
      reasons: ['ATTRIBUTION_CONFLICT', 'REVIEW_PENDING'],
    });
  });

  it('retains all unknown reasons in stable order', () => {
    const s = setup();
    s.evidence.uniqueAttribution = null;
    s.evidence.review = 'UNKNOWN';
    s.evidence.completeness = 'PARTIAL';
    s.evidence.newRegistration = null;
    expect(s.evaluate()).toEqual({
      decision: 'UNKNOWN',
      reasons: [
        'ATTRIBUTION_UNKNOWN',
        'REVIEW_UNKNOWN',
        'INCOMPLETE_SOURCE',
        'NEW_REGISTRATION_UNKNOWN',
      ],
    });
  });

  it.each(['clicked', 'missing', 'future'] as const)('waits for registration: %s', (kind) => {
    const s = setup();
    if (kind === 'clicked') s.evidence.status = 'CLICKED';
    if (kind === 'missing') s.evidence.registeredAt = null;
    if (kind === 'future') s.evidence.registeredAt = new Date(s.asOf.getTime() + 1);
    expect(s.evaluate()).toEqual({ decision: 'PENDING', reasons: ['REGISTRATION_PENDING'] });
  });

  it('uses an inclusive asOf boundary without consuming wall clock time', () => {
    const s = setup();
    s.evidence.registeredAt = new Date(s.asOf);
    expect(s.evaluate().decision).toBe('CONTINUE');
    expect(
      evaluateServiceReferralQualificationGate(s.policy, s.evidence, new Date(s.asOf.getTime() - 1))
        .decision,
    ).toBe('PENDING');
  });

  it.each(['workspaceId', 'serviceId'] as const)('rejects evidence from another %s', (key) => {
    const s = setup();
    s.evidence.scope[key] = 'foreign';
    expect(s.evaluate).toThrow('invalid referral qualification evidence');
  });

  it.each([
    ['review', 'INVALID'],
    ['completeness', 'INVALID'],
    ['status', 'INVALID'],
    ['uniqueAttribution', undefined],
    ['newRegistration', 'true'],
    ['registeredAt', undefined],
    ['registeredAt', new Date('invalid')],
    ['referralId', ''],
    ['referred', null],
    ['referrer', null],
    ['scope', null],
  ])('rejects malformed member evidence %s', (key, value) => {
    const s = setup();
    Reflect.set(s.evidence, key, value);
    expect(s.evaluate).toThrow('invalid referral qualification evidence');
  });

  it.each([
    ['version', 0],
    ['version', 1.5],
    ['status', 'DRAFT'],
    ['ruleKey', ' '],
    ['timezone', 'invalid/timezone'],
    ['requireNewRegistration', null],
    ['scope', null],
  ])('rejects malformed common policy %s', (key, value) => {
    const s = setup();
    Reflect.set(s.policy, key, value);
    expect(s.evaluate).toThrow('invalid referral qualification evidence');
  });

  it('rejects missing evidence and invalid asOf with a controlled validation error', () => {
    const s = setup();
    expect(() =>
      evaluateServiceReferralQualificationGate(
        s.policy,
        null as unknown as ServiceReferralQualificationMemberEvidence,
        s.asOf,
      ),
    ).toThrow('invalid referral qualification evidence');
    expect(() =>
      evaluateServiceReferralQualificationGate(s.policy, s.evidence, new Date('invalid')),
    ).toThrow('invalid referral qualification evidence');
  });

  it('copies policy scope and never retains extra capability or reward fields', () => {
    const s = setup();
    const input = {
      ...s.policy,
      minimumActiveDays: 3,
      requireFirstUserGeneration: true,
      creditAmount: 999,
    };
    const normalized = normalizeServiceReferralQualificationPolicy(input);
    expect(normalized).toEqual(s.policy);
    s.policy.scope.serviceId = 'changed';
    expect(normalized.scope.serviceId).toBe('service');
    expect(normalized).not.toHaveProperty('minimumActiveDays');
    expect(normalized).not.toHaveProperty('creditAmount');
  });
});
