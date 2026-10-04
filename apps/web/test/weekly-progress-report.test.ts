import { describe, expect, it } from 'vitest';
import {
  buildParticipantBusinessProgress,
  buildWeeklyProgressSummary,
  resolveWeeklyReportWindow,
  summarizeExpiringPointGrants,
} from '../src/services/weekly-progress-report';

describe('weekly progress report', () => {
  it('turns operational counts into one plain next step', () => {
    const report = buildWeeklyProgressSummary({
      missions: 5,
      viewed: 3,
      confirmed: 2,
      copied: 1,
      posted: 1,
      rested: 1,
      materials: 2,
      pointsEarned: 30,
      badges: ['はじめの一歩', 'はじめの一歩'],
    });
    expect(report.headline).toBe('今週は1件、投稿できました');
    expect(report.nextStep).toContain('一つ残す');
    expect(report.completedActions).toBe(7);
    expect(report.needsSupport).toBe(false);
    expect(report.badges).toEqual(['はじめの一歩']);
  });

  it('identifies a participant who opened ideas but stopped before choosing an action', () => {
    const report = buildWeeklyProgressSummary({ missions: 3, viewed: 2 });
    expect(report.needsSupport).toBe(true);
    expect(report.supportReason).toBe('投稿案を見たあと、次の操作で止まっています');
    expect(report.nextStep).toContain('内容を確認');
  });

  it('accepts only Mondays from the current twelve-week window', () => {
    const now = new Date('2026-09-12T03:00:00.000Z');
    expect(resolveWeeklyReportWindow('2026-09-07', now).weekStart).toBe('2026-09-07');
    expect(resolveWeeklyReportWindow('2026-09-08', now).weekStart).toBe('2026-09-07');
    expect(resolveWeeklyReportWindow('2027-01-04', now).weekStart).toBe('2026-09-07');
  });

  it('counts only the unused part of grants and selects the nearest expiry', () => {
    const later = new Date('2026-10-20T14:59:59.000Z');
    const sooner = new Date('2026-09-30T14:59:59.000Z');
    expect(
      summarizeExpiringPointGrants([
        { amount: 20, expiresAt: later, consumptions: [{ amount: 5 }] },
        { amount: 10, expiresAt: sooner, consumptions: [{ amount: 10 }] },
        { amount: 12, expiresAt: sooner, consumptions: [{ amount: 2 }] },
      ]),
    ).toEqual({ expiringPoints: 25, nextPointExpiryAt: sooner });
  });

  it('summarizes business progress without customer details', () => {
    const progress = buildParticipantBusinessProgress({
      startedAt: new Date('2026-07-17T00:00:00.000Z'),
      asOf: new Date('2026-09-15T03:00:00.000Z'),
      lastPostedAt: new Date('2026-09-14T02:00:00.000Z'),
      outcomes: {
        inquiries: 2,
        reservations: 1,
        visits: 0,
        repeatReservations: 1,
        repeatVisits: 1,
        orders: 1,
        other: 0,
      },
      weeklyPosts: [
        {
          topic: '初回相談の流れ',
          outcomes: {
            inquiries: 2,
            reservations: 1,
            visits: 0,
            repeatReservations: 1,
            repeatVisits: 1,
            orders: 1,
            other: 0,
          },
        },
      ],
    });

    expect(progress.program?.day).toBe(61);
    expect(progress.program?.phase.key).toBe('ESTABLISH_PATTERN');
    expect(progress.outcomeTotal).toBe(6);
    expect(progress.bestTopic).toBe('初回相談の流れ');
    expect(progress.nextWeekFocus).toContain('もう一度伝える');
    expect(progress.lastPostedAt?.toISOString()).toBe('2026-09-14T02:00:00.000Z');
  });

  it('uses the current 90-day phase when no customer response is recorded', () => {
    const progress = buildParticipantBusinessProgress({
      startedAt: new Date('2026-09-01T00:00:00.000Z'),
      asOf: new Date('2026-09-07T03:00:00.000Z'),
      lastPostedAt: null,
      outcomes: {
        inquiries: 0,
        reservations: 0,
        visits: 0,
        repeatReservations: 0,
        repeatVisits: 0,
        orders: 0,
        other: 0,
      },
      weeklyPosts: [],
    });

    expect(progress.program?.phase.key).toBe('FOUNDATION');
    expect(progress.nextWeekFocus).toBe('一番紹介したい商品・サービスを決める');
  });
});
