import { describe, expect, it } from 'vitest';
import {
  buildFortuneWeeklyLineMessage,
  fortuneWeeklyDeliveryKey,
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
