import { describe, expect, it } from 'vitest';
import {
  inferSocialUsageGuidance,
  defaultSocialUsageGuidanceSettings,
  normalizeSocialUsageGuidanceSettings,
  readSocialUsageGuidancePolicy,
  effectiveSocialUsageGuidanceSettings,
  assertServiceUsageGuidanceSettings,
  usageGuidanceAllowed,
  type SocialUsageGuidancePolicy,
} from '../src/usage-guidance';
import {
  buildSocialActivityBarrierGoalAttribution,
  buildSocialActivityBarrierGoalMetrics,
  type InferSocialActivityBarriersInput,
} from '../src/activity-barrier';
import {
  buildSocialActivityBarrierQuestion,
  selectSocialActivitySupport,
} from '../src/activity-barrier-support';
import { RunSocialActivityBarrierProjectionBatch } from '../src/activity-barrier-projection';
import { vi } from 'vitest';
const input = (): InferSocialActivityBarriersInput => ({
  scope: { workspaceId: 'w', serviceId: 's', groupMembershipId: 'm', userId: 'u', bunshinId: 'b' },
  observationWindow: {
    from: new Date('2026-10-01Z'),
    to: new Date('2026-10-29Z'),
    eligibleDays: 28,
    excludedSystemIncidentDays: 0,
  },
  metrics: {
    onboardingCompleted: true,
    lineDelivered: 0,
    missionViewed: 0,
    missionAccepted: 0,
    contentCopied: 0,
    postCompleted: 0,
    insightRecorded: 0,
    positiveResponseRecorded: 0,
    conversionActionRecorded: 0,
  },
  goalAttribution: buildSocialActivityBarrierGoalAttribution([]),
  goalMetrics: buildSocialActivityBarrierGoalMetrics([], {
    insightRecorded: 0,
    positiveResponseRecorded: 0,
  }),
  usageGuidance: { successfulImageRequests: 5, usedPlatforms: 2, confirmedReferrals: 3 },
});
describe('SNS observed usage guidance', () => {
  it('produces scoped, ordered, separate guidance evidence without claiming an obstacle', () => {
    const candidates = inferSocialUsageGuidance(input());
    expect(candidates.map((c) => c.evidence.evidenceCode)).toEqual([
      'USAGE_IMAGE_CREDITS',
      'USAGE_MULTIPLE_PLATFORMS',
      'USAGE_REFERRAL_REVIEW',
    ]);
    for (const [index, candidate] of candidates.entries()) {
      expect(candidate.scope).toEqual(input().scope);
      expect(candidate.priority).toBe(100 + index);
      const question = buildSocialActivityBarrierQuestion([
        {
          ...candidate,
          id: 'id',
          ruleVersion: candidate.evidence.ruleVersion,
          recurrenceCount: 0,
          firstDetectedAt: new Date(),
          lastDetectedAt: new Date(),
          nextEligibleAt: null,
        },
      ]);
      expect(question.title).not.toContain('困って');
      const selection = selectSocialActivitySupport(candidate);
      expect(selection.mode).toBe('USAGE_GUIDANCE');
      expect(selection.support.steps.join('')).not.toContain('自動付与します');
    }
  });
  it('does not infer usage from profile registration, unknown referral counts or incomplete setup', () => {
    const value = input();
    value.usageGuidance = {
      successfulImageRequests: 4,
      usedPlatforms: 1,
      confirmedReferrals: null,
    };
    expect(inferSocialUsageGuidance(value)).toEqual([]);
    value.metrics.onboardingCompleted = false;
    expect(inferSocialUsageGuidance(value)).toEqual([]);
  });
  it('prioritizes existing barrier questions over extra usage guidance in the scheduler', async () => {
    const value = input();
    value.metrics.missionAccepted = 3;
    const saveSuspicions = vi.fn().mockResolvedValue([]);
    await new RunSocialActivityBarrierProjectionBatch(
      { list: vi.fn().mockResolvedValue([value.scope]) },
      { collect: vi.fn().mockResolvedValue(value) },
      { saveSuspicions },
    ).execute({ at: new Date('2026-10-30Z'), force: true });
    const saved = saveSuspicions.mock.calls[0]![0] as {
      candidates: { evidence: { evidenceCode: string } }[];
    };
    expect(
      saved.candidates.every((c) => c.evidence.evidenceCode === 'ACCEPTED_WITHOUT_POST_REPORT'),
    ).toBe(true);
  });
  it('uses managed thresholds, latest headquarters limits and separate legacy namespace', () => {
    const base = defaultSocialUsageGuidanceSettings();
    const policy: SocialUsageGuidancePolicy = {
      version: 'social-usage-guidance-policy-v1',
      revision: 1,
      headquarters: base,
      service: { ...base, imageMinimum: 10, questionIntervalDays: 14 },
    };
    expect(effectiveSocialUsageGuidanceSettings(policy).imageMinimum).toBe(10);
    expect(
      usageGuidanceAllowed(
        effectiveSocialUsageGuidanceSettings(policy),
        inferSocialUsageGuidance(input())[0]!.evidence,
      ),
    ).toBe(false);
    policy.headquarters!.imageMinimum = 12;
    expect(effectiveSocialUsageGuidanceSettings(policy).imageMinimum).toBe(12);
    expect(() =>
      assertServiceUsageGuidanceSettings({ ...base, imageMinimum: 5 }, policy.headquarters),
    ).toThrow();
    expect(() => assertServiceUsageGuidanceSettings(base, null)).toThrow();
    expect(readSocialUsageGuidancePolicy(undefined).revision).toBe(0);
    expect(() =>
      readSocialUsageGuidancePolicy({ version: 'social-recommendation-policy-v1' }),
    ).toThrow();
  });
  it.each([
    { imageMinimum: 4 },
    { platformMinimum: 1 },
    { referralMinimum: 2 },
    { questionIntervalDays: 0 },
    { questionIntervalDays: 1 },
    { questionIntervalDays: 91 },
    { enabled: 'yes' },
    { extra: true },
  ])('rejects invalid conditions %j', (patch) => {
    expect(() =>
      normalizeSocialUsageGuidanceSettings({ ...defaultSocialUsageGuidanceSettings(), ...patch }),
    ).toThrow();
  });
});
