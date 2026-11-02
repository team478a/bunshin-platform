import { describe, expect, it } from 'vitest';
import { projectSocialServiceReferralActivities } from '../src/index';
import type { MemberUsageRequest, MemberUsageSources } from '@bunshin/application';
const request: MemberUsageRequest = {
  actorUserId: 'owner',
  scope: {
    workspaceId: 'workspace',
    serviceId: 'service',
    groupMembershipId: 'member',
    userId: 'owner',
    bunshinId: 'subject',
  },
  asOf: new Date('2026-11-03T00:00:00Z'),
  timezone: 'Asia/Tokyo',
};
describe('SOCIAL referral activity binding', () => {
  it('keeps only proven user generation as activity and retains unknown-origin evidence', () => {
    const source: MemberUsageSources = {
      scope: { ...request.scope },
      completeness: 'COMPLETE',
      activities: [],
      decisions: [],
      postRecords: [],
      aiUsage: [],
      generations: (['USER', 'SCHEDULER', 'SYSTEM', 'UNKNOWN'] as const).map((trigger) => ({
        id: trigger,
        scope: { ...request.scope },
        occurredAt: new Date('2026-11-01T00:00:00Z'),
        status: 'SUCCESS',
        trigger,
      })),
    };
    source.generations = [
      ...source.generations,
      {
        id: 'failed',
        scope: { ...request.scope },
        occurredAt: request.asOf,
        status: 'FAILED',
        trigger: 'USER',
      },
    ];
    const before = structuredClone(source);
    const value = projectSocialServiceReferralActivities(request, source);
    expect(value.hasUnknownGenerationTrigger).toBe(true);
    expect(value.activities.map((item) => [item.id, item.kind])).toEqual([
      ['USER', 'USER_GENERATION'],
    ]);
    expect(source).toEqual(before);
    value.activities[0]!.scope.bunshinId = 'changed';
    value.activities[0]!.occurredAt.setUTCFullYear(2000);
    expect(source).toEqual(before);
  });
});
