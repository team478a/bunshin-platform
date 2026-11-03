import { describe, expect, it } from 'vitest';
import {
  defaultSocialRecommendationSettings,
  normalizeSocialRecommendationSettings,
  readSocialRecommendationPolicy,
  effectiveSocialRecommendationSettings,
  assertServiceRecommendationSettings,
  recommendationEvidenceAllowed,
  socialSupportCooldownDays,
  SOCIAL_RECOMMENDATION_POLICY_VERSION as version,
} from '../src/recommendation-policy';
import type { SocialRecommendationPolicy } from '../src/recommendation-policy';
import type { SocialActivityBarrierEvidence } from '../src/activity-barrier';
const defaults = () => defaultSocialRecommendationSettings();
describe('SNS-specific recommendation policy', () => {
  it('preserves legacy defaults without granting new entitlements', () => {
    expect(
      effectiveSocialRecommendationSettings(readSocialRecommendationPolicy(undefined)),
    ).toEqual(defaults());
    const copy = defaults();
    copy.categories.length = 0;
    expect(defaults().categories).toHaveLength(11);
  });
  it.each([
    { minimumAccepted: 1 },
    { cooldownDays: 29 },
    { cooldownDays: 366 },
    { enabled: 'yes' },
    { categories: ['TIME', 'TIME'] },
    { categories: ['OTHER'] },
    { extra: 'unknown' },
  ])('rejects unsafe or unknown settings %j', (changes) => {
    expect(() => normalizeSocialRecommendationSettings({ ...defaults(), ...changes })).toThrow();
  });
  it('allows OEM narrowing but never relaxing the headquarters conditions', () => {
    const hq = {
      ...defaults(),
      minimumAccepted: 4,
      cooldownDays: 60,
      categories: ['TIME' as const],
    };
    expect(() =>
      assertServiceRecommendationSettings({ ...hq, minimumAccepted: 5, enabled: false }, hq),
    ).not.toThrow();
    expect(() => assertServiceRecommendationSettings(defaults(), hq)).toThrow();
    expect(() => assertServiceRecommendationSettings(hq, null)).toThrow();
    expect(() =>
      assertServiceRecommendationSettings({ ...hq, enabled: true }, { ...hq, enabled: false }),
    ).toThrow();
  });
  it('keeps stale OEM overrides inside a subsequently stricter headquarters policy', () => {
    const policy: SocialRecommendationPolicy = {
      version,
      revision: 2,
      headquarters: {
        ...defaults(),
        minimumAccepted: 6,
        cooldownDays: 90,
        categories: ['TIME' as const],
        enabled: false,
      },
      service: defaults(),
    };
    expect(effectiveSocialRecommendationSettings(policy)).toEqual(policy.headquarters);
  });
  it('filters preserved evidence against current count, category and stop conditions', () => {
    const evidence = {
      evidenceCode: 'ACCEPTED_WITHOUT_POST_REPORT',
      metrics: { missionAccepted: 3 },
    } as SocialActivityBarrierEvidence;
    expect(
      recommendationEvidenceAllowed({ ...defaults(), minimumAccepted: 4 }, 'TIME', evidence),
    ).toBe(false);
    expect(recommendationEvidenceAllowed(defaults(), 'TIME', evidence)).toBe(true);
    expect(recommendationEvidenceAllowed({ ...defaults(), categories: [] }, 'TIME', evidence)).toBe(
      false,
    );
  });
  it('fails closed on corrupted stored policies and preserves frozen or legacy cooldowns', () => {
    expect(() => readSocialRecommendationPolicy({ version: 'unknown' })).toThrow();
    expect(socialSupportCooldownDays({})).toBe(30);
    expect(socialSupportCooldownDays({ recommendationPolicy: { version, cooldownDays: 60 } })).toBe(
      60,
    );
    expect(() =>
      socialSupportCooldownDays({ recommendationPolicy: { version, cooldownDays: 1 } }),
    ).toThrow();
  });
});
