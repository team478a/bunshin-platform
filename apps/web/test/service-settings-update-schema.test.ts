import { describe, expect, it } from 'vitest';
import {
  parseServiceSettingsUpdatePayload,
  serviceSettingsUpdateSchema,
} from '../src/http/service-settings';

const officialSettingsPayload = {
  displayName: 'ワタシワークス公式',
  description: '企業・店舗・個人事業主へ、毎日そのまま使えるSNS投稿文を届ける無料サービス',
  operatorName: '運営団体ワタシワークス',
  contactEmail: '',
  termsUrl: 'https://www.watashi-works.com/terms',
  privacyUrl: 'https://www.watashi-works.com/privacy',
  logoUrl: 'https://www.watashi-works.com/watashiworks-logo.jpg',
  iconUrl: 'https://www.watashi-works.com/watashiworks-icon.jpg',
  faviconUrl: 'https://www.watashi-works.com/watashiworks-icon.jpg',
  primaryColor: '#0b356a',
  secondaryColor: '#ff3b30',
  fontFamily: 'system-ui',
  registrationMode: 'PUBLIC',
  emailEnabled: false,
  lineEnabled: true,
  inviteCodeEnabled: false,
  referralEnabled: false,
  trendResearchEnabled: true,
  welcomeTitle: 'あなたの事業に合う投稿文をお届けします',
  welcomeMessage:
    '業種や商品について教えてください。設定後は毎日LINEに、コピーして使える投稿文が届きます。',
  announcementEnabled: false,
  announcementTitle: '',
  announcementMessage: '',
  announcementStartsAt: '',
  announcementEndsAt: '',
  onboardingQuestions: ['発信するときに大切にしたいことを教えてください。'],
  profileQuestions: {
    industry: true,
    purpose: true,
    activityName: true,
    businessName: true,
    region: true,
    productService: true,
    socialProfile: true,
    notificationConsent: true,
  },
  businessProfileEnabled: true,
  businessProfileInputMode: 'MINIMAL',
  dailyIdeaDelivery: {
    enabled: true,
    cadence: 'DAILY',
    defaultNotificationTime: '08:00',
    lockCadence: true,
    contentMode: 'READY_TO_USE',
    mediaMode: 'TEXT_ONLY',
    videoStyle: 'STANDARD',
    videoBgm: { enabled: false, assetId: null, volumePercent: 12 },
    videoNarration: { enabled: false, voice: 'marin', speed: 'SLOW' },
    visualCharacter: { enabled: false, profileVersionId: null },
  },
  reason: '公式サービスのロゴ・アイコン・法的文書URLを設定',
};

describe('service settings update schema', () => {
  it('accepts the official service settings payload shown by the editor', async () => {
    const result = await serviceSettingsUpdateSchema.safeParseAsync(officialSettingsPayload);
    expect(result.success, result.success ? undefined : JSON.stringify(result.error.issues)).toBe(
      true,
    );
  });

  it('normalizes legacy nested onboarding values before saving', async () => {
    await expect(
      parseServiceSettingsUpdatePayload({
        ...officialSettingsPayload,
        profileQuestions: { industry: true },
        dailyIdeaDelivery: {
          enabled: true,
          cadence: 'DAILY',
          defaultNotificationTime: '08:00',
          lockCadence: true,
          contentMode: 'READY_TO_USE',
          mediaMode: 'TEXT_ONLY',
          videoNarration: { enabled: false, voice: 'legacy-voice' },
        },
      }),
    ).resolves.toMatchObject({
      profileQuestions: {
        industry: true,
        notificationConsent: true,
      },
      dailyIdeaDelivery: {
        enabled: true,
        cadence: 'DAILY',
        mediaMode: 'TEXT_ONLY',
        videoStyle: 'STANDARD',
        videoNarration: { enabled: false, voice: 'marin', speed: 'SLOW' },
      },
    });
  });

  it('returns a validation error for an invalid public field', async () => {
    await expect(
      parseServiceSettingsUpdatePayload({ ...officialSettingsPayload, logoUrl: 'invalid' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
