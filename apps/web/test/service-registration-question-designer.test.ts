import { describe, expect, it } from 'vitest';
import {
  suggestedOnboardingCopy,
  suggestedProfileQuestions,
} from '../app/s/[serviceSlug]/manage/settings/service-settings-editor';

describe('service registration question designer', () => {
  it('removes business segmentation questions for an information media service', () => {
    expect(suggestedProfileQuestions('MEDIA', 'INFORMATION')).toMatchObject({
      industry: false,
      purpose: false,
      activityName: true,
      businessName: false,
      productService: false,
      socialProfile: false,
      notificationConsent: true,
    });
  });

  it('keeps detailed profile questions for business support', () => {
    expect(suggestedProfileQuestions('BUSINESS', 'SUPPORT')).toEqual({
      industry: true,
      purpose: true,
      activityName: true,
      businessName: true,
      region: true,
      productService: true,
      socialProfile: true,
      notificationConsent: true,
    });
  });

  it('suggests only the personal inputs needed to create social content', () => {
    expect(suggestedProfileQuestions('MEDIA', 'PERSONALIZED_SOCIAL_CONTENT')).toEqual({
      industry: false,
      purpose: false,
      activityName: false,
      businessName: false,
      region: false,
      productService: false,
      socialProfile: false,
      notificationConsent: true,
    });

    expect(suggestedOnboardingCopy('PERSONALIZED_SOCIAL_CONTENT')).toMatchObject({
      welcomeTitle: 'あなたらしい投稿を作るために、少し教えてください',
      questions: expect.arrayContaining([
        expect.stringContaining('どのようなきっかけ'),
        expect.stringContaining('どのような方とつながっていますか'),
        expect.stringContaining('実際に感じたことや伝えたいこと'),
      ]),
    });
  });
});
