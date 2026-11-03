import type { ReferralManagementOverview } from '@bunshin/application';
export const referralFixture = (): ReferralManagementOverview => ({
  canSetHeadquartersPolicy: true,
  policy: {
    id: '11111111-1111-4111-8111-111111111111',
    version: 1,
    authority: 'HEADQUARTERS',
    status: 'ACTIVE',
    timezone: 'Asia/Tokyo',
    conditions: {
      requireNewRegistration: true,
      requireOnboarding: false,
      requireFirstUserGeneration: false,
      minimumActiveDays: 0,
    },
  },
  headquartersPolicy: {
    id: '11111111-1111-4111-8111-111111111111',
    version: 1,
    authority: 'HEADQUARTERS',
    status: 'ACTIVE',
    timezone: 'Asia/Tokyo',
    conditions: {
      requireNewRegistration: true,
      requireOnboarding: false,
      requireFirstUserGeneration: false,
      minimumActiveDays: 0,
    },
  },
  referrals: [
    {
      scope: { workspaceId: 'synthetic-workspace', serviceId: 'synthetic-service' },
      referralId: '22222222-2222-4222-8222-222222222222',
      referredMembershipId: '33333333-3333-4333-8333-333333333333',
      referrerMembershipId: '44444444-4444-4444-8444-444444444444',
      revision: 0,
      state: 'UNASSESSED',
      review: 'UNKNOWN',
      confirmedPolicyVersionId: null,
      confirmedAt: null,
      revokedAt: null,
    },
  ],
  hasMore: false,
});
