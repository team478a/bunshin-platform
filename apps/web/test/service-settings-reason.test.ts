import { describe, expect, it } from 'vitest';
import { serviceSettingsChangesRequiringReason } from '../src/services/service-settings-reason';
import { serviceSettingsFixture } from './service-settings-fixture';

describe('service settings reason boundaries', () => {
  it('does not add a reason requirement for unchanged free-business defaults', () => {
    const { configuration, payload } = serviceSettingsFixture(true);
    expect(serviceSettingsChangesRequiringReason(configuration, payload)).toEqual([]);
  });
  it('does not require a reason for ordinary content, appearance or delivery-time edits', () => {
    const { configuration, payload } = serviceSettingsFixture();
    const next = {
      ...payload,
      displayName: '新しい表示名',
      description: '新しい説明',
      dailyIdeaDelivery: {
        ...payload.dailyIdeaDelivery,
        defaultNotificationTime: '10:30',
        videoStyle: 'CALM' as const,
        videoBgm: { ...payload.dailyIdeaDelivery.videoBgm, volumePercent: 20 },
        videoNarration: { ...payload.dailyIdeaDelivery.videoNarration, voice: 'cedar' as const },
      },
    };
    expect(serviceSettingsChangesRequiringReason(configuration, next)).toEqual([]);
  });
  it.each(['registration', 'legal', 'provider', 'profile', 'business', 'media'] as const)(
    'retains a reason for %s changes',
    (kind) => {
      const { configuration, payload } = serviceSettingsFixture();
      const next = {
        ...payload,
        termsUrl: payload.termsUrl || null,
        privacyUrl: payload.privacyUrl || null,
      };
      if (kind === 'registration') next.registrationMode = 'INVITATION_ONLY';
      if (kind === 'legal') next.termsUrl = 'https://example.test/terms';
      if (kind === 'provider') next.trendResearchEnabled = !next.trendResearchEnabled;
      if (kind === 'profile')
        next.profileQuestions = {
          ...next.profileQuestions,
          notificationConsent: !next.profileQuestions.notificationConsent,
        };
      if (kind === 'business') next.businessProfileEnabled = !next.businessProfileEnabled;
      if (kind === 'media')
        next.dailyIdeaDelivery = { ...next.dailyIdeaDelivery, enabled: true, mediaMode: 'VIDEO' };
      expect(serviceSettingsChangesRequiringReason(configuration, next).length).toBeGreaterThan(0);
    },
  );
  it('does not treat equivalent legal URL formatting as a new important change', () => {
    const { configuration, payload } = serviceSettingsFixture();
    expect(
      serviceSettingsChangesRequiringReason(
        { ...configuration, termsUrl: 'https://example.test/' },
        { ...payload, termsUrl: 'https://example.test' },
      ),
    ).toEqual([]);
  });
});
