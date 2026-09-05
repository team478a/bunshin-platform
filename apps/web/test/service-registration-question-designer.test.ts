import { describe, expect, it } from 'vitest';
import { suggestedProfileQuestions } from '../app/s/[serviceSlug]/manage/settings/service-settings-editor';

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
});
