import { describe, expect, it } from 'vitest';

import {
  buildRewardsPilotMetrics,
  participatedInRewardsPilotPeriod,
  resolveRewardsPilotMeasurementPeriod,
} from '../src/rewards/rewards-pilot-metrics';

describe('rewards pilot measurement period', () => {
  it('freezes an ended pilot at its configured dates', () => {
    const period = resolveRewardsPilotMeasurementPeriod({
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: new Date('2026-08-29T00:00:00Z'),
      now: new Date('2026-09-12T00:00:00Z'),
    });
    expect(period).toEqual({
      from: new Date('2026-08-01T00:00:00Z'),
      toExclusive: new Date('2026-08-29T00:00:00Z'),
      status: 'COMPLETED',
    });
  });

  it('keeps expired enabled assignments in the completed pilot cohort', () => {
    const period = resolveRewardsPilotMeasurementPeriod({
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: new Date('2026-08-29T00:00:00Z'),
      now: new Date('2026-09-12T00:00:00Z'),
    });
    expect(
      participatedInRewardsPilotPeriod(
        {
          status: 'ENABLED',
          startsAt: new Date('2026-08-01T00:00:00Z'),
          endsAt: new Date('2026-08-29T00:00:00Z'),
        },
        period,
      ),
    ).toBe(true);
  });

  it('does not count an assignment that never overlapped the measured period', () => {
    const period = resolveRewardsPilotMeasurementPeriod({
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: new Date('2026-08-29T00:00:00Z'),
      now: new Date('2026-09-12T00:00:00Z'),
    });
    expect(
      participatedInRewardsPilotPeriod(
        {
          status: 'ENABLED',
          startsAt: new Date('2026-09-01T00:00:00Z'),
          endsAt: null,
        },
        period,
      ),
    ).toBe(false);
  });
});

describe('buildRewardsPilotMetrics', () => {
  it('counts adoption, three-day continuation, redemption, and point totals', () => {
    const metrics = buildRewardsPilotMetrics({
      participantIds: ['user-1', 'user-2', 'outside'],
      posts: [
        { userId: 'user-1', postedAt: new Date('2026-09-01T03:00:00Z') },
        { userId: 'user-1', postedAt: new Date('2026-09-02T03:00:00Z') },
        { userId: 'user-1', postedAt: new Date('2026-09-03T03:00:00Z') },
        { userId: 'outside-2', postedAt: new Date('2026-09-03T03:00:00Z') },
      ],
      transactions: [
        { userId: 'user-1', type: 'GRANT', amount: 15 },
        { userId: 'user-1', type: 'CONSUME', amount: -10 },
        { userId: 'outside-2', type: 'GRANT', amount: 999 },
      ],
    });

    expect(metrics).toMatchObject({
      participantCount: 3,
      postingUserCount: 1,
      continuedUserCount: 1,
      redemptionUserCount: 1,
      postCount: 3,
      grantedPoints: 15,
      consumedPoints: 10,
    });
  });

  it('flags repeated self-reports while keeping the reasons reviewable', () => {
    const posts = Array.from({ length: 5 }, (_, index) => ({
      userId: 'user-1',
      postedAt: new Date(`2026-09-01T03:0${index}:00Z`),
    }));

    const metrics = buildRewardsPilotMetrics({
      participantIds: ['user-1'],
      posts,
      transactions: [],
    });

    expect(metrics.reviewCandidates).toEqual([
      {
        userId: 'user-1',
        reasons: ['2026-09-01に投稿完了を5件記録', '10分以内に投稿完了を3件以上記録'],
      },
    ]);
  });

  it('treats Japanese calendar days separately', () => {
    const metrics = buildRewardsPilotMetrics({
      participantIds: ['user-1'],
      posts: [
        { userId: 'user-1', postedAt: new Date('2026-09-01T14:59:00Z') },
        { userId: 'user-1', postedAt: new Date('2026-09-01T15:01:00Z') },
        { userId: 'user-1', postedAt: new Date('2026-09-02T15:01:00Z') },
      ],
      transactions: [],
    });

    expect(metrics.continuedUserCount).toBe(1);
  });
});
