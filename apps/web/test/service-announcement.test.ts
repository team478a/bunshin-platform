import { describe, expect, it } from 'vitest';
import {
  isServiceAnnouncementVisible,
  readServiceAnnouncement,
} from '../src/services/service-onboarding-settings';

describe('readServiceAnnouncement', () => {
  it('returns a disabled empty announcement when no configuration exists', () => {
    expect(readServiceAnnouncement(null)).toEqual({
      enabled: false,
      title: '',
      message: '',
      startsAt: null,
      endsAt: null,
    });
  });

  it('reads only the explicit service announcement fields', () => {
    expect(
      readServiceAnnouncement({
        announcementEnabled: true,
        announcementTitle: '今週のお知らせ',
        announcementMessage: '投稿を1つ完成させましょう。',
        welcomeTitle: '別の設定',
      }),
    ).toEqual({
      enabled: true,
      title: '今週のお知らせ',
      message: '投稿を1つ完成させましょう。',
      startsAt: null,
      endsAt: null,
    });
  });

  it('shows the notice only inside its configured period', () => {
    const announcement = readServiceAnnouncement({
      announcementEnabled: true,
      announcementTitle: '今週のお知らせ',
      announcementMessage: '投稿を1つ完成させましょう。',
      announcementStartsAt: '2026-09-01T00:00:00.000Z',
      announcementEndsAt: '2026-09-02T00:00:00.000Z',
    });

    expect(isServiceAnnouncementVisible(announcement, new Date('2026-08-31T23:59:59.000Z'))).toBe(
      false,
    );
    expect(isServiceAnnouncementVisible(announcement, new Date('2026-09-01T12:00:00.000Z'))).toBe(
      true,
    );
    expect(isServiceAnnouncementVisible(announcement, new Date('2026-09-02T00:00:00.000Z'))).toBe(
      false,
    );
  });
});
