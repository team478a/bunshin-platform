import { describe, expect, it } from 'vitest';
import {
  localDateInTimezone,
  progressStatusLabel,
  weekRange,
  weeklyCalendar,
} from '../src/activity-progress';

describe('activity progress presentation', () => {
  it('derives a Monday-to-Sunday range without using server locale', () => {
    expect(weekRange('2026-08-27')).toEqual({
      weekStart: '2026-08-24',
      weekEnd: '2026-08-30',
    });
  });

  it('uses the configured timezone at the date boundary', () => {
    expect(localDateInTimezone(new Date('2026-08-26T15:30:00.000Z'), 'Asia/Tokyo')).toBe(
      '2026-08-27',
    );
  });

  it('uses plain Japanese labels', () => {
    expect(progressStatusLabel.RESTED).toBe('お休みしました');
    expect(progressStatusLabel.POSTED).toBe('投稿しました');
  });

  it('fills days without a mission so the calendar always has seven days', () => {
    const days = weeklyCalendar({
      weekStart: '2026-08-24',
      weekEnd: '2026-08-30',
      weeklyGoal: 3,
      remainingConfirmations: 2,
      weekly: {
        confirmedDays: 1,
        preparedDays: 0,
        postedDays: 0,
        restedDays: 0,
        days: [{ dailyMissionId: 'mission-1', missionDate: '2026-08-27', status: 'CONFIRMED' }],
      },
      cumulative: {
        confirmedDays: 1,
        preparedDays: 0,
        postedDays: 0,
        restedDays: 0,
        activeDays: 1,
        lastActiveDate: '2026-08-27',
      },
    });
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ missionDate: '2026-08-24', status: 'UNSEEN' });
    expect(days[3]).toMatchObject({ dailyMissionId: 'mission-1', status: 'CONFIRMED' });
  });
});
