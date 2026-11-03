import { describe, expect, it } from 'vitest';
import {
  evaluateSocialServiceReferralQualification as evaluateServiceReferralQualification,
  normalizeSocialServiceReferralQualificationRule as normalizeServiceReferralQualificationRule,
  type SocialServiceReferralQualificationRule as ServiceReferralQualificationRule,
  type SocialServiceReferralQualificationEvidence as ServiceReferralQualificationEvidence,
} from '../src/index';

function setup() {
  const scope = { workspaceId: 'workspace-a', serviceId: 'service-a' };
  const rule: ServiceReferralQualificationRule = {
    scope: { ...scope },
    ruleKey: 'hassy-valid-referral',
    version: 1,
    status: 'ACTIVE',
    timezone: 'Asia/Tokyo',
    requireNewRegistration: true,
    requireOnboarding: true,
    requireFirstUserGeneration: true,
    minimumActiveDays: 3,
  };
  const event = (
    id: string,
    kind: ServiceReferralQualificationEvidence['activities'][number]['kind'],
    at: string,
  ) => ({
    id,
    kind,
    occurredAt: new Date(at),
    scope: {
      ...scope,
      groupMembershipId: 'referred-member',
      userId: 'referred-user',
      bunshinId: 'referred-bunshin',
    },
  });
  const evidence: ServiceReferralQualificationEvidence = {
    scope: { ...scope },
    referralId: 'referral-a',
    referrer: { groupMembershipId: 'referrer-member', userId: 'referrer-user' },
    referred: { groupMembershipId: 'referred-member', userId: 'referred-user' },
    status: 'REGISTERED',
    registeredAt: new Date('2026-10-30T00:00:00Z'),
    onboardingCompletedAt: new Date('2026-10-30T01:00:00Z'),
    newRegistration: true,
    uniqueAttribution: true,
    review: 'CLEAR',
    completeness: 'COMPLETE',
    hasUnknownGenerationTrigger: false,
    activities: [
      event('copy-a', 'COPY', '2026-10-31T14:59:59Z'),
      event('generation-a', 'USER_GENERATION', '2026-10-31T15:00:00Z'),
      event('decision-a', 'DECISION', '2026-11-01T15:00:00Z'),
    ],
  };
  const asOf = new Date('2026-11-01T15:00:00Z');
  return {
    rule,
    evidence,
    asOf,
    event,
    evaluate: () => evaluateServiceReferralQualification(rule, evidence, asOf),
  };
}

describe('SOCIAL service referral qualification binding', () => {
  it('qualifies a fully verified referral and outputs no participant details', () => {
    const s = setup();
    const value = s.evaluate();
    expect(value).toEqual({
      version: 'service-referral-qualification-v1',
      ruleKey: s.rule.ruleKey,
      ruleVersion: 1,
      asOf: s.asOf.toISOString(),
      timezone: 'Asia/Tokyo',
      decision: 'QUALIFIED',
      reasons: ['CONDITIONS_MET'],
    });
    const json = JSON.stringify(value);
    for (const secret of [
      'referrer-user',
      'referred-user',
      'referral-a',
      'workspace-a',
      'referred-bunshin',
      'activities',
    ])
      expect(json).not.toContain(secret);
  });

  it.each(['userId', 'groupMembershipId'] as const)(
    'reuses self-referral rejection by %s',
    (key) => {
      const s = setup();
      s.evidence.referred[key] = s.evidence.referrer[key];
      s.evidence.activities = [];
      expect(s.evaluate()).toMatchObject({ decision: 'REJECTED', reasons: ['SELF_REFERRAL'] });
    },
  );

  it('does not reverse an existing rejected referral during reevaluation', () => {
    const s = setup();
    s.evidence.status = 'REJECTED';
    expect(s.evaluate()).toMatchObject({ decision: 'REJECTED', reasons: ['REFERRAL_REJECTED'] });
  });

  it('stops new qualification when the rule is suspended', () => {
    const s = setup();
    s.rule.status = 'SUSPENDED';
    expect(s.evaluate()).toMatchObject({ decision: 'SUSPENDED', reasons: ['RULE_SUSPENDED'] });
  });

  it('rejects an existing member only when new registration is required', () => {
    const s = setup();
    s.evidence.newRegistration = false;
    expect(s.evaluate()).toMatchObject({ decision: 'REJECTED', reasons: ['EXISTING_MEMBER'] });
    s.rule.requireNewRegistration = false;
    expect(s.evaluate().decision).toBe('QUALIFIED');
  });

  it.each([
    'REGISTERED',
    'ONBOARDING_COMPLETED',
    'FIRST_CONTENT_VIEWED',
    'FIRST_POST_REPORTED',
  ] as const)('never infers new membership from the legacy %s status', (status) => {
    const s = setup();
    s.evidence.status = status;
    s.evidence.newRegistration = null;
    expect(s.evaluate()).toMatchObject({
      decision: 'UNKNOWN',
      reasons: ['NEW_REGISTRATION_UNKNOWN'],
    });
  });

  it('does not treat reported SNS publication as generated-content or setup proof', () => {
    const s = setup();
    s.evidence.status = 'FIRST_POST_REPORTED';
    s.evidence.onboardingCompletedAt = null;
    s.evidence.activities = [s.event('post', 'POST_REPORT', '2026-11-01T15:00:00Z')];
    expect(s.evaluate()).toMatchObject({
      decision: 'PENDING',
      reasons: ['ONBOARDING_PENDING', 'FIRST_USER_GENERATION_PENDING', 'ACTIVE_DAYS_PENDING'],
    });
  });

  it.each(['review', 'uniqueness'] as const)(
    'holds suspicious %s for review without labelling it fraud',
    (kind) => {
      const s = setup();
      if (kind === 'review') s.evidence.review = 'REQUIRED';
      else s.evidence.uniqueAttribution = false;
      expect(s.evaluate().decision).toBe('REVIEW_REQUIRED');
    },
  );

  it('retains both review reasons in deterministic order', () => {
    const s = setup();
    s.evidence.review = 'REQUIRED';
    s.evidence.uniqueAttribution = false;
    expect(s.evaluate().reasons).toEqual(['ATTRIBUTION_CONFLICT', 'REVIEW_PENDING']);
  });

  it.each(['review', 'uniqueness', 'partial'] as const)(
    'fails closed for unknown %s evidence',
    (kind) => {
      const s = setup();
      if (kind === 'review') s.evidence.review = 'UNKNOWN';
      else if (kind === 'uniqueness') s.evidence.uniqueAttribution = null;
      else s.evidence.completeness = 'PARTIAL';
      expect(s.evaluate().decision).toBe('UNKNOWN');
    },
  );

  it('requires complete evidence even when a partial page already meets the threshold', () => {
    const s = setup();
    s.evidence.completeness = 'PARTIAL';
    expect(s.evaluate().reasons).toEqual(['INCOMPLETE_SOURCE']);
  });

  it.each(['missing', 'future', 'clicked'] as const)(
    'waits for %s registration rather than using later progress',
    (kind) => {
      const s = setup();
      if (kind === 'missing') s.evidence.registeredAt = null;
      if (kind === 'future') s.evidence.registeredAt = new Date(s.asOf.getTime() + 1);
      if (kind === 'clicked') s.evidence.status = 'CLICKED';
      expect(s.evaluate()).toMatchObject({
        decision: 'PENDING',
        reasons: ['REGISTRATION_PENDING'],
      });
    },
  );

  it.each(['before-registration', 'after-asOf'] as const)('excludes setup %s', (kind) => {
    const s = setup();
    s.evidence.onboardingCompletedAt =
      kind === 'before-registration'
        ? new Date(s.evidence.registeredAt!.getTime() - 1)
        : new Date(s.asOf.getTime() + 1);
    expect(s.evaluate().reasons).toEqual(['ONBOARDING_PENDING']);
  });

  it('honors independent optional conditions without silently enabling a default rule', () => {
    const s = setup();
    s.rule.requireOnboarding = false;
    s.rule.requireFirstUserGeneration = false;
    s.rule.requireNewRegistration = false;
    s.rule.minimumActiveDays = 0;
    s.evidence.onboardingCompletedAt = null;
    s.evidence.newRegistration = null;
    s.evidence.activities = [];
    expect(s.evaluate().decision).toBe('QUALIFIED');
  });

  it('does not sum duplicate events or multiple Bunshin activity counts on the same day', () => {
    const s = setup();
    s.rule.minimumActiveDays = 2;
    s.rule.requireFirstUserGeneration = false;
    const a = s.event('copy-1', 'COPY', '2026-11-01T01:00:00Z');
    const b = s.event('copy-2', 'COPY', '2026-11-01T02:00:00Z');
    b.scope.bunshinId = 'second-owned-bunshin';
    s.evidence.activities = [a, a, b, b];
    expect(s.evaluate().reasons).toEqual(['ACTIVE_DAYS_PENDING']);
    s.evidence.activities = [
      ...s.evidence.activities,
      s.event('copy-3', 'COPY', s.asOf.toISOString()),
    ];
    expect(s.evaluate().decision).toBe('QUALIFIED');
  });

  it('uses the versioned timezone at the exact local midnight boundary', () => {
    const s = setup();
    expect(s.evaluate().decision).toBe('QUALIFIED');
    expect(
      evaluateServiceReferralQualification(s.rule, s.evidence, new Date(s.asOf.getTime() - 1))
        .decision,
    ).toBe('PENDING');
    s.rule.timezone = 'UTC';
    expect(s.evaluate().decision).toBe('PENDING');
  });

  it('counts the repeated DST hour as one local day', () => {
    const s = setup();
    s.rule.timezone = 'America/New_York';
    s.rule.requireFirstUserGeneration = false;
    s.rule.minimumActiveDays = 2;
    s.evidence.activities = [
      s.event('dst-a', 'COPY', '2026-11-01T05:30:00Z'),
      s.event('dst-b', 'COPY', '2026-11-01T06:30:00Z'),
      s.event('dst-c', 'COPY', '2026-11-02T05:00:00Z'),
    ];
    expect(
      evaluateServiceReferralQualification(s.rule, s.evidence, new Date('2026-11-02T04:59:59Z'))
        .decision,
    ).toBe('PENDING');
    expect(
      evaluateServiceReferralQualification(s.rule, s.evidence, new Date('2026-11-02T05:00:00Z'))
        .decision,
    ).toBe('QUALIFIED');
  });

  it('handles leap day boundaries without parsing user-supplied local-date strings', () => {
    const s = setup();
    s.rule.requireFirstUserGeneration = false;
    s.rule.minimumActiveDays = 2;
    s.evidence.activities = [
      s.event('leap-a', 'COPY', '2028-02-28T15:00:00Z'),
      s.event('leap-b', 'COPY', '2028-02-29T15:00:00Z'),
    ];
    expect(
      evaluateServiceReferralQualification(s.rule, s.evidence, new Date('2028-02-29T15:00:00Z'))
        .decision,
    ).toBe('QUALIFIED');
  });

  it('excludes activity before registration or after asOf including first generation', () => {
    const s = setup();
    s.evidence.activities = [
      s.event('old', 'USER_GENERATION', '2026-10-29T23:59:59Z'),
      s.event('future', 'USER_GENERATION', '2026-11-01T15:00:00.001Z'),
    ];
    expect(s.evaluate().reasons).toEqual(['FIRST_USER_GENERATION_PENDING', 'ACTIVE_DAYS_PENDING']);
  });

  it('keeps unknown legacy generation origin separate from proven absence', () => {
    const s = setup();
    s.evidence.hasUnknownGenerationTrigger = true;
    s.evidence.activities = [];
    expect(s.evaluate()).toMatchObject({
      decision: 'UNKNOWN',
      reasons: ['GENERATION_ORIGIN_UNKNOWN', 'ACTIVITY_ORIGIN_UNKNOWN'],
    });
    s.evidence.activities = setup().evidence.activities;
    expect(s.evaluate().decision).toBe('QUALIFIED');
  });

  it.each(['LOGIN', 'SCHEDULER', 'SYSTEM', 'UNKNOWN', 'FAILED'])(
    'rejects unverified activity kind %s',
    (kind) => {
      const s = setup();
      s.evidence.activities = [
        {
          ...s.evidence.activities[0]!,
          kind,
        } as unknown as ServiceReferralQualificationEvidence['activities'][number],
      ];
      expect(s.evaluate).toThrow('invalid referral qualification evidence');
    },
  );

  it.each(['workspaceId', 'serviceId', 'userId', 'groupMembershipId'] as const)(
    'rejects foreign activity %s before classification',
    (key) => {
      const s = setup();
      s.evidence.activities = [
        {
          ...s.evidence.activities[0]!,
          scope: { ...s.evidence.activities[0]!.scope, [key]: 'foreign' },
        },
      ];
      expect(s.evaluate).toThrow('invalid referral qualification evidence');
    },
  );

  it.each(['workspaceId', 'serviceId'] as const)('rejects cross-OEM policy/evidence %s', (key) => {
    const s = setup();
    s.evidence.scope[key] = 'another-scope';
    expect(s.evaluate).toThrow('invalid referral qualification evidence');
  });

  it('rejects conflicting copies of one canonical event instead of double-counting days', () => {
    const s = setup();
    const original = s.evidence.activities[0]!;
    s.evidence.activities = [original, { ...original, occurredAt: s.asOf }];
    expect(s.evaluate).toThrow('invalid referral qualification evidence');
  });

  it.each(['registeredAt', 'onboardingCompletedAt'] as const)('rejects corrupt date %s', (key) => {
    const s = setup();
    s.evidence[key] = new Date('invalid');
    expect(s.evaluate).toThrow('invalid referral qualification evidence');
  });

  it('rejects non-finite evaluation and activity dates', () => {
    const s = setup();
    expect(() =>
      evaluateServiceReferralQualification(s.rule, s.evidence, new Date('invalid')),
    ).toThrow();
    s.evidence.activities = [{ ...s.evidence.activities[0]!, occurredAt: new Date('invalid') }];
    expect(s.evaluate).toThrow();
  });

  it('rejects over-limit evidence rather than qualifying a truncated set', () => {
    const s = setup();
    s.evidence.activities = Array.from({ length: 10001 }, () => s.evidence.activities[0]!);
    expect(s.evaluate).toThrow();
  });

  it('rejects sparse activity lists with a controlled validation error', () => {
    const s = setup();
    s.evidence.activities = new Array<ServiceReferralQualificationEvidence['activities'][number]>(
      1,
    );
    expect(s.evaluate).toThrow('invalid referral qualification evidence');
  });

  it.each([
    { version: 0 },
    { version: 1.2 },
    { version: Infinity },
    { ruleKey: ' ' },
    { minimumActiveDays: -1 },
    { minimumActiveDays: 1.1 },
    { minimumActiveDays: 3661 },
    { timezone: 'invalid/zone' },
    { timezone: '' },
    { status: 'ENABLED' },
    { requireOnboarding: undefined },
    { requireNewRegistration: null },
  ])('rejects malformed policy %j', (change) => {
    const s = setup();
    expect(() =>
      normalizeServiceReferralQualificationRule({
        ...s.rule,
        ...change,
      } as unknown as ServiceReferralQualificationRule),
    ).toThrow();
  });

  it.each([
    'newRegistration',
    'uniqueAttribution',
    'review',
    'completeness',
    'hasUnknownGenerationTrigger',
  ] as const)('rejects missing or malformed evidence %s', (key) => {
    const s = setup();
    const broken = {
      ...s.evidence,
      [key]: undefined,
    };
    expect(() => evaluateServiceReferralQualification(s.rule, broken, s.asOf)).toThrow();
  });

  it('does not mutate previous decisions or the input when a later rule version changes', () => {
    const s = setup();
    const before = JSON.stringify({ rule: s.rule, evidence: s.evidence });
    const old = s.evaluate();
    const saved = JSON.stringify(old);
    const next = evaluateServiceReferralQualification(
      { ...s.rule, version: 2, minimumActiveDays: 4 },
      s.evidence,
      s.asOf,
    );
    expect(old.decision).toBe('QUALIFIED');
    expect(next.decision).toBe('PENDING');
    expect(next.ruleVersion).toBe(2);
    expect(JSON.stringify(old)).toBe(saved);
    expect(JSON.stringify({ rule: s.rule, evidence: s.evidence })).toBe(before);
    expect(s.evaluate()).toEqual(old);
  });

  it('normalizes an isolated policy copy without copying unrelated metadata', () => {
    const s = setup();
    const rule = normalizeServiceReferralQualificationRule({
      ...s.rule,
      privateMemo: 'secret',
    } as ServiceReferralQualificationRule);
    rule.scope.workspaceId = 'other';
    expect(s.rule.scope.workspaceId).toBe('workspace-a');
    expect(JSON.stringify(rule)).not.toContain('secret');
  });
});
