import type { ComponentProps } from 'react';
import type { UsageGuidancePolicyEditor } from '../../../apps/web/app/s/[serviceSlug]/manage/recommendations/usage-policy-editor';
type SocialUsageGuidanceView = ComponentProps<typeof UsageGuidancePolicyEditor>['initial'];
export function usagePolicyFixture(hq = false): SocialUsageGuidanceView {
  const settings = {
    enabled: true,
    imageMinimum: 5,
    platformMinimum: 2,
    referralMinimum: 3,
    questionIntervalDays: 7,
  };
  return {
    version: 'social-usage-guidance-policy-v1',
    revision: 1,
    headquarters: settings,
    service: null,
    effective: { ...settings },
    permissions: { headquarters: hq, service: true },
  };
}
