import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SERVICE_PROFILE_QUESTIONS,
  readServiceOnboardingSettings,
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
    });
  });

  it('fails safely for malformed stored JSON', () => {
    expect(readServiceOnboardingSettings(null, { questions: [1, '有効', null] })).toEqual({
      welcomeTitle: '',
      welcomeMessage: '',
      questions: ['有効'],
      profileQuestions: DEFAULT_SERVICE_PROFILE_QUESTIONS,
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
});
