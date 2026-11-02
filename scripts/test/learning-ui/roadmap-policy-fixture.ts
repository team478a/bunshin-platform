import type { HassyRoadmapPolicyView } from '../../../apps/web/src/services/hassy-roadmap-settings';
export function roadmapPolicyFixture(hq = false): HassyRoadmapPolicyView {
  const settings = { generated: 2, decisions: 2, activeDays: 4, validReferrals: 3 };
  return {
    version: 'hassy-roadmap-policy-v1',
    revision: 1,
    headquarters: settings,
    service: null,
    effective: { ...settings },
    permissions: { headquarters: hq, service: true },
  };
}
