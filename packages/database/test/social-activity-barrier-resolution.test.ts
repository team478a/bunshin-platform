import { describe, expect, it } from 'vitest';
import {
  buildSocialActivityBarrierGoalAttribution,
  buildSocialActivityBarrierGoalMetrics,
} from '@bunshin/capability-social';
import { shouldResolveSocialActivityBarrier } from '../src/social-activity-barrier-resolution';

const observation = {
  scope: {
    workspaceId: 'workspace-1',
    serviceId: 'service-1',
    groupMembershipId: 'membership-1',
    userId: 'user-1',
    bunshinId: 'bunshin-1',
  },
  observationWindow: {
    from: new Date('2026-09-01'),
    to: new Date('2026-09-20'),
    eligibleDays: 18,
    excludedSystemIncidentDays: 0,
  },
  metrics: {
    onboardingCompleted: true,
    lineDelivered: 10,
    missionViewed: 8,
    missionAccepted: 6,
    contentCopied: 5,
    postCompleted: 4,
    insightRecorded: 4,
    positiveResponseRecorded: 3,
    conversionActionRecorded: 1,
  },
  goalAttribution: buildSocialActivityBarrierGoalAttribution(['INQUIRY']),
  goalMetrics: buildSocialActivityBarrierGoalMetrics([], {
    insightRecorded: 4,
    positiveResponseRecorded: 0,
  }),
};

describe('shouldResolveSocialActivityBarrier', () => {
  it('resolves a confirmed category after a clean sufficient observation with no matching signal', () => {
    expect(shouldResolveSocialActivityBarrier({ category: 'MEDIA', observation })).toBe(true);
  });

  it('does not resolve when a system incident exists', () => {
    expect(
      shouldResolveSocialActivityBarrier({
        category: 'MEDIA',
        observation: {
          ...observation,
          observationWindow: { ...observation.observationWindow, excludedSystemIncidentDays: 1 },
        },
      }),
    ).toBe(false);
  });
});
