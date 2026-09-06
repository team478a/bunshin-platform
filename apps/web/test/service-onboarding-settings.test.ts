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

  it('reads the enterprise daily idea delivery policy without affecting legacy services', () => {
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
          },
        },
        null,
      ),
    ).toMatchObject({
      businessProfileEnabled: true,
      dailyIdeaDelivery: {
        enabled: true,
        cadence: 'WEEKDAYS',
        defaultNotificationTime: '09:30',
        lockCadence: true,
        contentMode: 'IDEA',
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
        '千ノ国メタバースを、どのようなきっかけで知りましたか？（例：知人からの紹介）',
      )?.options,
    ).toContain('友人・知人からの紹介');
    expect(serviceOnboardingChoicePreset('運営者が自由に追加した質問')).toBeNull();
  });
});
