import { describe, expect, it } from 'vitest';
import {
  buildWeeklyReportLineMessage,
  isWeeklyReportDeliveryDue,
  readWeeklyReportDeliverySetting,
  writeWeeklyReportDeliverySetting,
} from '../src/services/weekly-report-line-delivery';

describe('weekly report LINE delivery', () => {
  it('keeps the feature stopped until an operator enables it', () => {
    expect(readWeeklyReportDeliverySetting({})).toEqual({
      enabled: false,
      weekday: 'MONDAY',
      localTime: '09:00',
    });
  });

  it('preserves other onboarding settings when saving the schedule', () => {
    expect(
      writeWeeklyReportDeliverySetting(
        { welcomeTitle: 'ようこそ' },
        { enabled: true, weekday: 'FRIDAY', localTime: '18:30' },
      ),
    ).toEqual({
      welcomeTitle: 'ようこそ',
      weeklyReportDelivery: { enabled: true, weekday: 'FRIDAY', localTime: '18:30' },
    });
  });

  it('becomes due at or after the configured local time on the configured day', () => {
    const setting = { enabled: true, weekday: 'MONDAY' as const, localTime: '09:00' };
    expect(
      isWeeklyReportDeliveryDue({
        setting,
        now: new Date('2026-09-14T00:00:00.000Z'),
      }),
    ).toBe(true);
    expect(
      isWeeklyReportDeliveryDue({
        setting,
        now: new Date('2026-09-13T23:59:00.000Z'),
      }),
    ).toBe(false);
  });

  it('creates a short personal summary with only the authenticated report link', () => {
    expect(
      buildWeeklyReportLineMessage({
        serviceName: '投稿サポート',
        headline: '今週は2件、投稿できました',
        nextStep: '今日あったことを一つ残す',
        reportUrl: 'https://example.com/s/demo/weekly-report?week=2026-09-07',
      }),
    ).toBe(
      '投稿サポートの1週間のふり返りです。\n\n今週は2件、投稿できました\n\n次にやること\n今日あったことを一つ残す\n\n今週できたことを見る\nhttps://example.com/s/demo/weekly-report?week=2026-09-07',
    );
  });

  it('adds an expiry warning only when unused points expire within 30 days', () => {
    expect(
      buildWeeklyReportLineMessage({
        serviceName: '投稿サポート',
        headline: '今週は2件、投稿できました',
        nextStep: '今日あったことを一つ残す',
        reportUrl: 'https://example.com/report',
        pointExpiry: { amount: 25, dateLabel: '9月30日' },
      }),
    ).toContain(
      'ポイントのお知らせ\n今後30日以内に25 WPが期限を迎えます。最も近い期限は9月30日です。',
    );
  });
});
