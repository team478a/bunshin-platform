import { describe, expect, it } from 'vitest';
import {
  assertNotSelfServiceReferral,
  normalizeServiceReferralAttribution,
  normalizeServiceReferralRewardRule,
} from '../src/service-referral-credit';

describe('service referral credit core', () => {
  it('keeps attribution as bounded labels rather than a client-supplied URL', () => {
    expect(
      normalizeServiceReferralAttribution({
        source: ' instagram ',
        campaignKey: ' official_202609 ',
        contentKey: ' post-01 ',
      }),
    ).toEqual({
      source: 'instagram',
      campaignKey: 'official_202609',
      contentKey: 'post-01',
      landingVariant: null,
    });
  });

  it('validates an expiring, recipient-specific reward rule', () => {
    expect(
      normalizeServiceReferralRewardRule({
        ruleKey: 'onboarding-referrer',
        milestone: 'ONBOARDING_COMPLETED',
        recipient: 'REFERRER',
        creditAmount: 3,
        expiresAfterDays: 90,
        monthlyGrantLimit: 30,
      }),
    ).toMatchObject({ creditAmount: 3, expiresAfterDays: 90 });
  });

  it('rejects a self referral by membership or common user', () => {
    expect(() =>
      assertNotSelfServiceReferral({
        referrerMembershipId: 'member-1',
        referredMembershipId: 'member-2',
        referrerUserId: 'user-1',
        referredUserId: 'user-1',
      }),
    ).toThrow('self referral');
  });
});
