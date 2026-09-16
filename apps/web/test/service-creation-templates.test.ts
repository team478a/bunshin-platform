import { describe, expect, it } from 'vitest';
import {
  fortunePackageReleaseStatus,
  isFortuneServicePackage,
  SERVICE_CREATION_TEMPLATES,
} from '../src/services/service-creation-templates';

describe('service creation templates', () => {
  it('prepares public registration and attribution for the side-hustle service', () => {
    expect(SERVICE_CREATION_TEMPLATES.SIDE_HUSTLE_AFFILIATE).toMatchObject({
      registrationMode: 'PUBLIC',
      lineEnabled: true,
      referralEnabled: true,
    });
    expect(SERVICE_CREATION_TEMPLATES.SIDE_HUSTLE_AFFILIATE.onboarding.questions).toHaveLength(5);
    expect(SERVICE_CREATION_TEMPLATES.SIDE_HUSTLE_AFFILIATE.onboarding.welcomeTitle).not.toBe('');
  });

  it('keeps enterprise participation invitation-only by default', () => {
    expect(SERVICE_CREATION_TEMPLATES.ENTERPRISE_PROGRAM).toMatchObject({
      registrationMode: 'INVITATION_ONLY',
      inviteCodeEnabled: true,
      referralEnabled: false,
    });
    expect(SERVICE_CREATION_TEMPLATES.ENTERPRISE_PROGRAM.onboarding.questions).toHaveLength(6);
  });

  it('leaves onboarding empty when the administrator chooses custom settings', () => {
    expect(SERVICE_CREATION_TEMPLATES.CUSTOM.onboarding).toEqual({
      welcomeTitle: '',
      welcomeMessage: '',
      questions: [],
    });
  });

  it('prepares a LINE-only daily idea service with a service business profile', () => {
    expect(SERVICE_CREATION_TEMPLATES.BUSINESS_DAILY_IDEAS).toMatchObject({
      registrationMode: 'PUBLIC',
      emailEnabled: false,
      lineEnabled: true,
      referralEnabled: false,
      businessProfileEnabled: true,
      dailyIdeaDelivery: {
        enabled: true,
        cadence: 'DAILY',
        defaultNotificationTime: '08:00',
        lockCadence: true,
        contentMode: 'READY_TO_USE',
      },
    });
  });

  it('prepares a versioned LINE-first fortune package without enabling delivery or AI', () => {
    expect(SERVICE_CREATION_TEMPLATES.FORTUNE_DAILY_GUIDANCE).toMatchObject({
      registrationMode: 'PUBLIC',
      emailEnabled: false,
      lineEnabled: true,
      inviteCodeEnabled: false,
      referralEnabled: false,
      fortunePackage: {
        key: 'FORTUNE_DAILY_GUIDANCE',
        version: 1,
        minimumAge: 18,
        historyRetentionDays: 90,
        weeklyNotificationEnabled: false,
        aiEnabled: false,
      },
    });
    expect(
      isFortuneServicePackage({
        fortunePackage: SERVICE_CREATION_TEMPLATES.FORTUNE_DAILY_GUIDANCE.fortunePackage,
      }),
    ).toBe(true);
    expect(isFortuneServicePackage({ fortunePackage: { key: 'FORTUNE_DAILY_GUIDANCE' } })).toBe(
      false,
    );
  });

  it('reports whether an installed fortune package is current or needs a system update', () => {
    expect(
      fortunePackageReleaseStatus({
        fortunePackage: { key: 'FORTUNE_DAILY_GUIDANCE', version: 1 },
      }),
    ).toEqual({
      key: 'FORTUNE_DAILY_GUIDANCE',
      installedVersion: 1,
      currentVersion: 1,
      state: 'CURRENT',
    });
    expect(
      fortunePackageReleaseStatus({
        fortunePackage: { key: 'FORTUNE_DAILY_GUIDANCE', version: 2 },
      }).state,
    ).toBe('UNSUPPORTED_NEWER');
    expect(fortunePackageReleaseStatus({ fortunePackage: { version: 1 } }).state).toBe(
      'NOT_SELECTED',
    );
  });
});
