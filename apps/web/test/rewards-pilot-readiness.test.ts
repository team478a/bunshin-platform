import { describe, expect, it } from 'vitest';

import { buildRewardsPilotReadiness } from '../src/rewards/rewards-pilot-readiness';

const now = new Date('2026-09-12T00:00:00.000Z');

describe('buildRewardsPilotReadiness', () => {
  it('is ready when the service, 4-week period, participants, issuance, and rules are ready', () => {
    const result = buildRewardsPilotReadiness({
      policyStatus: 'ENABLED',
      startsAt: new Date('2026-09-10T00:00:00.000Z'),
      endsAt: new Date('2026-10-08T00:00:00.000Z'),
      now,
      activeParticipantCount: 12,
      pointIssuanceStopped: false,
      activeRuleCount: 3,
    });

    expect(result.status).toBe('READY');
    expect(result.missingCount).toBe(0);
    expect(result.items.every((item) => item.ready)).toBe(true);
  });

  it('lists every setting that still needs attention', () => {
    const result = buildRewardsPilotReadiness({
      policyStatus: 'DISABLED',
      startsAt: null,
      endsAt: null,
      now,
      activeParticipantCount: 0,
      pointIssuanceStopped: true,
      activeRuleCount: 0,
    });

    expect(result.status).toBe('ACTION_REQUIRED');
    expect(result.missingCount).toBe(5);
    expect(result.items.filter((item) => !item.ready).map((item) => item.key)).toEqual([
      'POLICY',
      'PERIOD',
      'PARTICIPANTS',
      'ISSUANCE',
      'RULES',
    ]);
  });

  it('does not accept a period shorter than 4 weeks', () => {
    const result = buildRewardsPilotReadiness({
      policyStatus: 'ENABLED',
      startsAt: new Date('2026-09-10T00:00:00.000Z'),
      endsAt: new Date('2026-10-07T23:59:59.999Z'),
      now,
      activeParticipantCount: 1,
      pointIssuanceStopped: false,
      activeRuleCount: 1,
    });

    expect(result.status).toBe('ACTION_REQUIRED');
    expect(result.items.find((item) => item.key === 'PERIOD')?.ready).toBe(false);
  });

  it('marks a configured trial as completed after its end date', () => {
    const result = buildRewardsPilotReadiness({
      policyStatus: 'ENABLED',
      startsAt: new Date('2026-08-01T00:00:00.000Z'),
      endsAt: new Date('2026-08-29T00:00:00.000Z'),
      now,
      activeParticipantCount: 0,
      pointIssuanceStopped: false,
      activeRuleCount: 3,
    });

    expect(result.status).toBe('COMPLETED');
  });
});
