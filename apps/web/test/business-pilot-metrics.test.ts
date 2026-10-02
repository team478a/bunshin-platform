import { describe, expect, it } from 'vitest';
import { buildBusinessPilotMetrics } from '../src/services/business-pilot-metrics';
import {
  readBusinessOutcomes,
  sumBusinessOutcomes,
  writeBusinessOutcomes,
} from '../src/services/business-outcomes';

describe('business pilot metrics', () => {
  it('calculates funnel rates, retention, and three-day activity', () => {
    const now = new Date('2026-09-14T12:00:00.000Z');
    const metrics = buildBusinessPilotMetrics({
      now,
      participants: [
        { userId: 'seven', joinedAt: new Date('2026-09-06T00:00:00.000Z') },
        { userId: 'thirty', joinedAt: new Date('2026-08-14T00:00:00.000Z') },
      ],
      events: [
        { userId: 'seven', occurredAt: new Date('2026-09-13T00:30:00.000Z') },
        { userId: 'seven', occurredAt: new Date('2026-09-09T01:00:00.000Z') },
        { userId: 'seven', occurredAt: new Date('2026-09-10T01:00:00.000Z') },
        { userId: 'thirty', occurredAt: new Date('2026-09-13T02:00:00.000Z') },
      ],
      missions: 10,
      viewed: 7,
      accepted: 6,
      copied: 5,
      posted: 4,
      lineSent: 8,
      lineOpened: 4,
    });
    expect(metrics.openRate).toBe(50);
    expect(metrics.viewRate).toBe(70);
    expect(metrics.acceptanceRate).toBe(60);
    expect(metrics.sevenDayRetention).toEqual({ eligible: 2, retained: 1, percent: 50 });
    expect(metrics.thirtyDayRetention).toEqual({ eligible: 1, retained: 1, percent: 100 });
    expect(metrics.threeDayActiveUsers).toBe(1);
  });
});

describe('business outcomes', () => {
  it('preserves unrelated manual metrics and sums valid counters', () => {
    const written = writeBusinessOutcomes(
      { likes: 4 },
      {
        inquiries: 2,
        reservations: 1,
        visits: 0,
        repeatReservations: 1,
        repeatVisits: 0,
        orders: 1,
        other: 0,
      },
    );
    expect(written['likes']).toBe(4);
    expect(readBusinessOutcomes(written).orders).toBe(1);
    expect(
      sumBusinessOutcomes([written, { businessOutcomes: { inquiries: 3, visits: 2 } }]),
    ).toEqual({
      inquiries: 5,
      reservations: 1,
      visits: 2,
      repeatReservations: 1,
      repeatVisits: 0,
      orders: 1,
      other: 0,
    });
  });

  it('reads legacy metrics as zero repeat outcomes without reclassifying reservations', () => {
    expect(
      readBusinessOutcomes({
        businessOutcomes: { inquiries: 0, reservations: 2, visits: 1, orders: 0, other: 0 },
      }),
    ).toEqual({
      inquiries: 0,
      reservations: 2,
      visits: 1,
      repeatReservations: 0,
      repeatVisits: 0,
      orders: 0,
      other: 0,
    });
  });
});
