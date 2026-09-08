import { describe, expect, it } from 'vitest';
import { resolveDeliveryScheduleStatus } from '../src/services/delivery-schedule-status';

describe('delivery schedule status', () => {
  it('reports an unscheduled day and the next confirmed delivery date', () => {
    expect(
      resolveDeliveryScheduleStatus({
        today: '2026-09-08',
        scheduledDates: ['2026-09-07', '2026-09-10'],
        missionDates: [],
      }),
    ).toEqual({ state: 'OFF', nextScheduledDate: '2026-09-10' });
  });

  it('distinguishes preparation from a ready mission', () => {
    const input = {
      today: '2026-09-08',
      scheduledDates: ['2026-09-08'],
      missionDates: [] as string[],
    };
    expect(resolveDeliveryScheduleStatus(input).state).toBe('PREPARING');
    expect(resolveDeliveryScheduleStatus({ ...input, missionDates: ['2026-09-08'] }).state).toBe(
      'READY',
    );
  });
});
