import { describe, expect, it } from 'vitest';
import {
  buildFortuneWeeklyLineMessage,
  fortuneWeeklyDeliveryKey,
  fortuneWeeklyLocalSlot,
  isFortuneWeeklyNotificationDue,
} from '../src/fortune/weekly-line-delivery';

describe('fortune weekly LINE delivery', () => {
  it('uses the configured local weekday and hour', () => {
    const now = new Date('2026-09-16T10:15:00.000Z'); // Wednesday 19:15 in Tokyo
    expect(
      isFortuneWeeklyNotificationDue({
        now,
        timeZone: 'Asia/Tokyo',
        weekday: 3,
        hour: 19,
      }),
    ).toBe(true);
    expect(
      isFortuneWeeklyNotificationDue({
        now,
        timeZone: 'Asia/Tokyo',
        weekday: 3,
        hour: 20,
      }),
    ).toBe(false);
    expect(fortuneWeeklyDeliveryKey(now, 'Asia/Tokyo')).toBe('2026-09-16');
  });

  it('uses the service calendar week when a member chooses a different day', () => {
    expect(fortuneWeeklyLocalSlot(new Date('2026-11-15T15:00:00.000Z'), 'Asia/Tokyo')).toEqual({
      date: '2026-11-16',
      weekStart: '2026-11-16',
      weekday: 1,
      hour: 0,
    });
  });

  it('keeps private fortune content out of the notification', () => {
    const message = buildFortuneWeeklyLineMessage({
      serviceName: '毎週のカード',
      serviceUrl: 'https://example.test/s/fortune',
    });
    expect(message).toContain('今週の占いのお知らせ');
    expect(message).toContain('https://example.test/s/fortune');
    expect(message).toContain('占い結果や個人情報');
    expect(message).not.toContain('正位置');
    expect(message).not.toContain('逆位置');
  });
});
