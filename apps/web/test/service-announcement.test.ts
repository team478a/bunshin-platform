import { describe, expect, it } from 'vitest';
import { readServiceAnnouncement } from '../src/services/service-onboarding-settings';

describe('readServiceAnnouncement', () => {
  it('returns a disabled empty announcement when no configuration exists', () => {
    expect(readServiceAnnouncement(null)).toEqual({
      enabled: false,
      title: '',
      message: '',
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
    });
  });
});
