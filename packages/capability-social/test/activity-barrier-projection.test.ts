import { describe, expect, it, vi } from 'vitest';
import {
  RunSocialActivityBarrierProjectionBatch,
  isSocialActivityBarrierProjectionDue,
  socialActivityBarrierObservationWindow,
} from '../src/activity-barrier-projection';

const scope = {
  workspaceId: 'workspace',
  serviceId: 'service',
  groupMembershipId: 'membership',
  userId: 'user',
  bunshinId: 'bunshin',
};

describe('social activity barrier projection', () => {
  it('uses one deterministic 28 day window and runs only at 03:10 JST', () => {
    const due = new Date('2026-09-26T18:10:00.000Z');
    expect(isSocialActivityBarrierProjectionDue(due)).toBe(true);
    expect(isSocialActivityBarrierProjectionDue(new Date('2026-09-26T18:11:00.000Z'))).toBe(false);
    expect(socialActivityBarrierObservationWindow(due)).toEqual({
      from: new Date('2026-08-29T15:00:00.000Z'),
      to: new Date('2026-09-26T15:00:00.000Z'),
    });
  });

  it('isolates failures and persists only inferred suspicions', async () => {
    const candidates = { list: vi.fn().mockResolvedValue([scope, { ...scope, bunshinId: 'b2' }]) };
    const observations = {
      collect: vi
        .fn()
        .mockResolvedValueOnce({
          scope,
          observationWindow: {
            from: new Date(),
            to: new Date(Date.now() + 1),
            eligibleDays: 7,
            excludedSystemIncidentDays: 0,
          },
          metrics: {
            onboardingCompleted: true,
            lineDelivered: 7,
            missionViewed: 0,
            missionAccepted: 0,
            contentCopied: 0,
            postCompleted: 0,
            insightRecorded: 0,
            positiveResponseRecorded: 0,
            conversionActionRecorded: 0,
          },
          goalAttribution: {
            missionCounts: {
              FOLLOWERS: 0,
              LINE_REGISTRATION: 0,
              INQUIRY: 7,
              VISIT_RESERVATION: 0,
              SALES: 0,
              RECRUIT: 0,
              REPEAT: 0,
              BRAND_AWARENESS: 0,
              TRUST_EXPERTISE: 0,
              BLOG_TRAFFIC: 0,
              OTHER: 0,
              UNATTRIBUTED: 0,
            },
            observedMissionCount: 7,
            attributedMissionCount: 7,
            unattributedMissionCount: 0,
            distinctAttributedGoalCount: 1,
            mixedAttributedGoals: false,
          },
        })
        .mockRejectedValueOnce(new Error('one member failed')),
    };
    const cases = {
      saveSuspicions: vi.fn().mockResolvedValue([{ id: 'case' }, { id: 'case2' }, { id: 'case3' }]),
    };
    const result = await new RunSocialActivityBarrierProjectionBatch(
      candidates,
      observations,
      cases,
    ).execute({ at: new Date('2026-09-26T18:10:00.000Z'), force: true });
    expect(result).toMatchObject({ scanned: 2, evaluated: 1, suspected: 3, failures: 1 });
    expect(cases.saveSuspicions).toHaveBeenCalledOnce();
  });

  it('does no database work outside the daily schedule', async () => {
    const candidates = { list: vi.fn() };
    const result = await new RunSocialActivityBarrierProjectionBatch(
      candidates,
      { collect: vi.fn() },
      { saveSuspicions: vi.fn() },
    ).execute({ at: new Date('2026-09-26T18:11:00.000Z') });
    expect(result.due).toBe(false);
    expect(candidates.list).not.toHaveBeenCalled();
  });
});
