import { describe, expect, it } from 'vitest';
import {
  aggregateMemberUsage,
  evaluateMemberRoadmap,
  type MemberUsageRequest,
  type MemberRoadmapContext,
} from '@bunshin/application';
import {
  HASSY_MEMBER_ROADMAP_POLICY,
  createHassyMemberRoadmapDefinition,
} from '../src/services/hassy-growth-policy';
import {
  defaultHassyRoadmapSettings,
  normalizeHassyRoadmapSettings,
  readHassyRoadmapPolicy,
  effectiveHassyRoadmapSettings,
  assertServiceHassyRoadmapSettings,
  createConfiguredHassyRoadmapDefinition,
  type HassyRoadmapPolicy,
} from '../src/services/hassy-roadmap-settings';
const settings = () => defaultHassyRoadmapSettings();
const policy = (): HassyRoadmapPolicy => ({
  version: 'hassy-roadmap-policy-v1',
  revision: 1,
  headquarters: { generated: 4, decisions: 2, activeDays: 5, validReferrals: 3 },
  service: null,
});
const request: MemberUsageRequest = {
  actorUserId: 'owner',
  scope: {
    workspaceId: 'w',
    serviceId: 's',
    userId: 'owner',
    groupMembershipId: 'm',
    bunshinId: 'b',
  },
  asOf: new Date('2026-11-02T01:00:00Z'),
  timezone: 'Asia/Tokyo',
};
describe('Hassy roadmap editable product conditions', () => {
  it('preserves legacy definitions for unconfigured services', () => {
    const old = createHassyMemberRoadmapDefinition();
    old.scope = { workspaceId: 'w', serviceId: 's' };
    expect(
      createConfiguredHassyRoadmapDefinition(readHassyRoadmapPolicy(undefined), request.scope),
    ).toEqual(old);
  });
  it.each([
    { generated: 0 },
    { generated: 1001 },
    { decisions: 1.5 },
    { activeDays: 366 },
    { validReferrals: -1 },
    { validReferrals: 1001 },
    { extra: true },
    { activeDays: '3' },
  ])('rejects invalid conditions %j', (patch) => {
    expect(() => normalizeHassyRoadmapSettings({ ...settings(), ...patch })).toThrow();
  });
  it.each([
    null,
    {},
    { ...policy(), revision: 0 },
    { ...policy(), version: 'foreign' },
    { ...policy(), lastRequest: { commandId: 'invalid', fingerprint: 'invalid' } },
  ])('rejects corrupt persisted policy %j', (value) => {
    expect(() => readHassyRoadmapPolicy(value)).toThrow('invalid Hassy roadmap policy');
  });
  it('enforces HQ boundaries including optional referral permission', () => {
    const hq = policy().headquarters!;
    expect(() => assertServiceHassyRoadmapSettings(hq, null)).toThrow();
    for (const patch of [
      { generated: 3 },
      { decisions: 1 },
      { activeDays: 4 },
      { validReferrals: 2 },
    ])
      expect(() => assertServiceHassyRoadmapSettings({ ...hq, ...patch }, hq)).toThrow();
    expect(() => assertServiceHassyRoadmapSettings({ ...hq, validReferrals: 0 }, hq)).not.toThrow();
    expect(() => assertServiceHassyRoadmapSettings(hq, { ...hq, validReferrals: 0 })).toThrow();
  });
  it('applies later HQ changes without changing the saved service override', () => {
    const value = policy();
    value.service = { generated: 6, decisions: 3, activeDays: 8, validReferrals: 5 };
    value.headquarters = { generated: 9, decisions: 4, activeDays: 10, validReferrals: 0 };
    expect(effectiveHassyRoadmapSettings(value)).toEqual(value.headquarters);
    expect(value.service.validReferrals).toBe(5);
  });
  it('changes only usage targets and adds referral progress only to STEP 5', () => {
    const definition = createConfiguredHassyRoadmapDefinition(policy(), request.scope);
    expect(definition.version).toBe('hassy-roadmap-managed-v1-r1');
    expect(
      definition.stages
        .slice(0, 4)
        .flatMap((s) => s.milestones)
        .some((m) => m.criterion.kind === 'VALID_REFERRALS'),
    ).toBe(false);
    const context: MemberRoadmapContext = {
      scope: request.scope,
      definition,
      asOf: request.asOf.toISOString(),
      timezone: request.timezone,
      facts: { INITIAL_SETUP: true },
      features: {},
      validReferrals: 3,
    };
    const usage = aggregateMemberUsage(request, {
      scope: request.scope,
      completeness: 'COMPLETE',
      generations: [],
      activities: [],
      decisions: [],
      postRecords: [],
      aiUsage: [],
    });
    const roadmap = evaluateMemberRoadmap(request, usage, context, HASSY_MEMBER_ROADMAP_POLICY);
    expect(
      roadmap.stages[0]!.milestones.find((m) => m.id === 'FIRST_GENERATION')!.progress,
    ).toEqual({ current: 0, target: 4 });
    expect(roadmap.stages[0]!.milestones.find((m) => m.id === 'INITIAL_SETUP')!.achievement).toBe(
      'COMPLETED',
    );
    expect(
      roadmap.stages[4]!.milestones.find((m) => m.id === 'REFERRAL_MILESTONE')!.achievement,
    ).toBe('COMPLETED');
    context.validReferrals = 0;
    expect(
      evaluateMemberRoadmap(request, usage, context, HASSY_MEMBER_ROADMAP_POLICY).stages[0],
    ).toEqual(roadmap.stages[0]);
    expect(definition.stages[0]!.milestones[1]!.criterion).toEqual({
      kind: 'USAGE',
      metric: 'generated',
      target: 4,
    });
  });
  it('permits disabling optional referral progress', () => {
    const value = policy();
    value.headquarters!.validReferrals = 0;
    expect(
      createConfiguredHassyRoadmapDefinition(value, request.scope).stages[4]!.milestones.some(
        (m) => m.id === 'REFERRAL_MILESTONE',
      ),
    ).toBe(false);
  });
});
