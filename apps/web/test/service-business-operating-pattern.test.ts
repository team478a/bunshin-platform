import { businessGrowthProgramStatus } from '@bunshin/application';
import { describe, expect, it } from 'vitest';
import {
  BusinessOperatingPattern,
  buildBusinessOperatingPattern,
} from '../app/s/[serviceSlug]/bunshins/[bunshinId]/business-operating-pattern';

const zero = {
  inquiries: 0,
  reservations: 0,
  visits: 0,
  repeatReservations: 0,
  repeatVisits: 0,
  orders: 0,
  other: 0,
};

describe('business operating pattern', () => {
  it('finds frequent posting weekdays and the topic with the strongest response', () => {
    const pattern = buildBusinessOperatingPattern([
      {
        id: 'one',
        missionDate: '2026-09-07',
        topic: '商品紹介',
        postedAt: 'now',
        businessOutcomes: { ...zero, inquiries: 1 },
      },
      {
        id: 'two',
        missionDate: '2026-09-14',
        topic: '利用事例',
        postedAt: 'now',
        businessOutcomes: { ...zero, reservations: 2 },
      },
      {
        id: 'three',
        missionDate: '2026-09-11',
        topic: '仕事風景',
        postedAt: 'now',
        businessOutcomes: zero,
      },
    ]);

    expect(pattern.weekdays).toEqual(['月曜日', '金曜日']);
    expect(pattern.bestTopic).toBe('利用事例');
    expect(pattern.postedCount).toBe(3);
  });

  it('ignores unposted missions', () => {
    const pattern = buildBusinessOperatingPattern([
      {
        id: 'one',
        missionDate: '2026-09-14',
        topic: '未投稿',
        postedAt: null,
        businessOutcomes: { ...zero, orders: 5 },
      },
    ]);

    expect(pattern.weekdays).toEqual([]);
    expect(pattern.bestTopic).toBeNull();
    expect(pattern.postedCount).toBe(0);
  });

  it('shows the operating pattern from the final phase onward', () => {
    const early = BusinessOperatingPattern({
      program: businessGrowthProgramStatus({
        startedAt: '2026-08-17',
        currentDate: '2026-09-15',
      }),
      missions: [],
      roadmapHref: '/roadmap',
    });
    const finalPhase = BusinessOperatingPattern({
      program: businessGrowthProgramStatus({
        startedAt: '2026-07-17',
        currentDate: '2026-09-15',
      }),
      missions: [],
      roadmapHref: '/roadmap',
    });

    expect(early).toBeNull();
    expect(finalPhase).not.toBeNull();
  });
});
