import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SERVICE_DAILY_IDEA_DELIVERY,
  DEFAULT_SERVICE_PROFILE_QUESTIONS,
  effectiveServiceContentAssistanceLevel,
  readServiceOnboardingSettings,
  serviceContentAssistanceLevel,
  serviceDeliveryDefaultAssistanceLevel,
  serviceOnboardingChoicePreset,
} from '../src/services/service-onboarding-settings';

describe('service onboarding settings', () => {
  it('reads only supported public guidance fields', () => {
    expect(
      readServiceOnboardingSettings(
        { templateKey: 'CUSTOM', welcomeTitle: 'ようこそ', welcomeMessage: '説明' },
        { questions: ['使うSNSは？', '目標は？'], secret: 'ignored' },
      ),
    ).toEqual({
      welcomeTitle: 'ようこそ',
      welcomeMessage: '説明',
      questions: ['使うSNSは？', '目標は？'],
      profileQuestions: DEFAULT_SERVICE_PROFILE_QUESTIONS,
      businessProfileEnabled: false,
      dailyIdeaDelivery: DEFAULT_SERVICE_DAILY_IDEA_DELIVERY,
    });
  });

  it('fails safely for malformed stored JSON', () => {
    expect(readServiceOnboardingSettings(null, { questions: [1, '有効', null] })).toEqual({
      welcomeTitle: '',
      welcomeMessage: '',
      questions: ['有効'],
      profileQuestions: DEFAULT_SERVICE_PROFILE_QUESTIONS,
      businessProfileEnabled: false,
      dailyIdeaDelivery: DEFAULT_SERVICE_DAILY_IDEA_DELIVERY,
    });
  });

  it('enforces the free business delivery policy for previously saved services', () => {
    expect(
      readServiceOnboardingSettings(
        {
          businessProfileEnabled: true,
          dailyIdeaDelivery: {
            enabled: true,
            cadence: 'WEEKDAYS',
            defaultNotificationTime: '09:30',
            lockCadence: true,
            contentMode: 'IDEA',
            mediaMode: 'IMAGE',
            videoStyle: 'CALM',
            videoNarration: { enabled: true, voice: 'coral', speed: 'STANDARD' },
            videoBgm: {
              enabled: true,
              assetId: '22222222-2222-4222-8222-222222222222',
              volumePercent: 20,
            },
            visualCharacter: {
              enabled: true,
              profileVersionId: '11111111-1111-4111-8111-111111111111',
            },
          },
        },
        null,
      ),
    ).toMatchObject({
      businessProfileEnabled: true,
      dailyIdeaDelivery: {
        enabled: true,
        cadence: 'DAILY',
        defaultNotificationTime: '09:30',
        lockCadence: true,
        contentMode: 'READY_TO_USE',
        mediaMode: 'TEXT_ONLY',
        videoStyle: 'CALM',
        videoNarration: { enabled: false, voice: 'coral', speed: 'STANDARD' },
        videoBgm: {
          enabled: false,
          assetId: null,
          volumePercent: 20,
        },
        visualCharacter: {
          enabled: false,
          profileVersionId: null,
        },
      },
    });
  });

  it('maps service content and enrolled program plans to the generated mission level', () => {
    expect(serviceContentAssistanceLevel('IDEA')).toBe('IDEA_ONLY');
    expect(serviceContentAssistanceLevel('PROMPT')).toBe('GUIDED');
    expect(serviceContentAssistanceLevel('READY_TO_USE')).toBe('READY_TO_USE');
    expect(
      serviceDeliveryDefaultAssistanceLevel({ enabled: false, contentMode: 'IDEA' }),
    ).toBeNull();
    expect(
      effectiveServiceContentAssistanceLevel({
        contentMode: 'IDEA',
        enrollmentSupportMode: 'GUIDED',
        preferredSupportMode: 'READY_TO_USE',
      }),
    ).toBe('READY_TO_USE');
  });

  it('accepts the prompt delivery mode from stored service settings', () => {
    expect(
      readServiceOnboardingSettings({ dailyIdeaDelivery: { contentMode: 'PROMPT' } }, null)
        .dailyIdeaDelivery.contentMode,
    ).toBe('PROMPT');
  });

  it('keeps automatic image delivery opt-in for existing services', () => {
    expect(
      readServiceOnboardingSettings({ dailyIdeaDelivery: { mediaMode: 'IMAGE' } }, null)
        .dailyIdeaDelivery.mediaMode,
    ).toBe('IMAGE');
    expect(readServiceOnboardingSettings({}, null).dailyIdeaDelivery.mediaMode).toBe('TEXT_ONLY');
    expect(readServiceOnboardingSettings({}, null).dailyIdeaDelivery.videoStyle).toBe('STANDARD');
    expect(
      readServiceOnboardingSettings({ dailyIdeaDelivery: { videoStyle: 'MINIMAL' } }, null)
        .dailyIdeaDelivery.videoStyle,
    ).toBe('MINIMAL');
    expect(readServiceOnboardingSettings({}, null).dailyIdeaDelivery.videoNarration).toEqual({
      enabled: false,
      voice: 'marin',
      speed: 'SLOW',
    });
    expect(readServiceOnboardingSettings({}, null).dailyIdeaDelivery.videoBgm).toEqual({
      enabled: false,
      assetId: null,
      volumePercent: 12,
    });
    expect(readServiceOnboardingSettings({}, null).dailyIdeaDelivery.visualCharacter).toEqual({
      enabled: false,
      profileVersionId: null,
    });
  });

  it('allows each service to disable irrelevant profile questions', () => {
    expect(
      readServiceOnboardingSettings(
        {
          profileQuestions: {
            industry: false,
            purpose: false,
            activityName: true,
          },
        },
        null,
      ).profileQuestions,
    ).toEqual({
      ...DEFAULT_SERVICE_PROFILE_QUESTIONS,
      industry: false,
      purpose: false,
      activityName: true,
    });
  });

  it('offers tap-friendly presets for standard and media questions only', () => {
    expect(serviceOnboardingChoicePreset('どのSNSで発信したいですか？')?.options).toContain(
      'インスタグラム',
    );
    expect(
      serviceOnboardingChoicePreset(
        '千ノ国メディアを、どのようなきっかけで知りましたか？（例：知人からの紹介）',
      )?.options,
    ).toContain('友人・知人からの紹介');
    expect(serviceOnboardingChoicePreset('運営者が自由に追加した質問')).toBeNull();
  });
});
