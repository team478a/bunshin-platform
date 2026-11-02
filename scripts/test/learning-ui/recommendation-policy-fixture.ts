import type { ComponentProps } from 'react';
import type { RecommendationPolicyEditor } from '../../../apps/web/app/s/[serviceSlug]/manage/recommendations/policy-editor';
export function recommendationPolicyFixture(
  headquarters = false,
): ComponentProps<typeof RecommendationPolicyEditor>['initial'] {
  const settings = {
    enabled: true,
    minimumAccepted: 4,
    cooldownDays: 60,
    categories: ['TIME' as const, 'HOW_TO' as const],
  };
  return {
    version: 'social-recommendation-policy-v1',
    revision: 1,
    headquarters: settings,
    service: null,
    effective: settings,
    permissions: { headquarters, service: true },
  };
}
