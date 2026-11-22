import type { ServiceFoundationRecord } from '@bunshin/application';
import { describe, expect, it } from 'vitest';
import { fortuneReferralAvailable } from '../src/fortune/referral-access';

const registration: ServiceFoundationRecord['registration'] = {
  mode: 'PUBLIC',
  emailEnabled: true,
  lineEnabled: true,
  inviteCodeEnabled: false,
  referralEnabled: true,
  onboardingConfig: null,
  surveyConfig: null,
};

describe('Fortune referral access', () => {
  it.each([
    ['PUBLIC', 'PUBLIC', true, true],
    ['PUBLIC', 'APPROVAL_REQUIRED', true, true],
    ['PUBLIC', 'INVITATION_ONLY', true, false],
    ['PUBLIC', 'INVITATION_APPROVAL_REQUIRED', true, false],
    ['PUBLIC', 'CLOSED', true, false],
    ['PRIVATE', 'PUBLIC', true, false],
    ['PUBLIC', 'PUBLIC', false, false],
  ] as const)(
    'applies service settings %s, %s, enabled=%s',
    (visibility, mode, referralEnabled, available) => {
      expect(
        fortuneReferralAvailable({
          visibility,
          registration: { ...registration, mode, referralEnabled },
        }),
      ).toBe(available);
    },
  );
});
