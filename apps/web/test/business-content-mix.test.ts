import { describe, expect, it, vi } from 'vitest';
import {
  BUSINESS_CONTENT_MIX,
  buildBusinessContentSchedule,
} from '../src/services/business-content-mix';

vi.mock('server-only', () => ({}));

function nextMonday(value: string, weeks: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

describe('business content mix', () => {
  it('matches the 30/20/20/15/15 distribution over a complete 20-post cycle', () => {
    const items = Array.from({ length: 4 }, (_, week) =>
      buildBusinessContentSchedule({
        weekStartDate: nextMonday('2026-09-07', week),
        cadence: 'WEEKDAYS',
      }),
    ).flat();
    const counts = Object.fromEntries(
      BUSINESS_CONTENT_MIX.map(({ category }) => [
        category,
        items.filter((item) => item.category === category).length,
      ]),
    );
    expect(counts).toEqual({
      HELPFUL_EXPERTISE: 6,
      COMPANY_STAFF: 4,
      FAQ_PROBLEM: 4,
      CASE_STUDY: 3,
      PRODUCT_SERVICE: 3,
    });
  });

  it('creates seven dated items for daily delivery', () => {
    const items = buildBusinessContentSchedule({
      weekStartDate: '2026-09-07',
      cadence: 'DAILY',
    });
    expect(items).toHaveLength(7);
    expect(items.map(({ scheduledDate }) => scheduledDate)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
  });
});
