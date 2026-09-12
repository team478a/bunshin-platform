import { describe, expect, it } from 'vitest';
import {
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
});
