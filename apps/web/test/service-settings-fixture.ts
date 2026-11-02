import { serviceHomeFixture } from './service-management-home-fixture';
import { readServiceOnboardingSettings } from '../src/services/service-onboarding-settings';

export function serviceSettingsFixture(businessFree = false) {
  const initial = serviceHomeFixture(false).configuration;
  const configuration = {
    ...initial,
    description: 'サービスの説明',
    registration: {
      ...initial.registration,
      emailEnabled: !businessFree,
      lineEnabled: businessFree,
      onboardingConfig: businessFree
        ? { businessProfileEnabled: true, businessProfileInputMode: 'MINIMAL' }
        : initial.registration.onboardingConfig,
    },
  };
  const onboarding = readServiceOnboardingSettings(
    configuration.registration.onboardingConfig,
    configuration.registration.surveyConfig,
  );
  const payload = {
    displayName: configuration.displayName,
    description: configuration.description,
    operatorName: configuration.operatorName,
    contactEmail: configuration.contactEmail ?? '',
    termsUrl: configuration.termsUrl ?? '',
    privacyUrl: configuration.privacyUrl ?? '',
    logoUrl: configuration.brand.logoUrl ?? '',
    iconUrl: configuration.brand.iconUrl ?? '',
    faviconUrl: configuration.brand.faviconUrl ?? '',
    primaryColor: configuration.brand.primaryColor,
    secondaryColor: configuration.brand.secondaryColor,
    fontFamily: configuration.brand.fontFamily,
    registrationMode: configuration.registration.mode,
    emailEnabled: configuration.registration.emailEnabled,
    lineEnabled: configuration.registration.lineEnabled,
    inviteCodeEnabled: configuration.registration.inviteCodeEnabled,
    referralEnabled: configuration.registration.referralEnabled,
    trendResearchEnabled: configuration.trendResearchEnabled ?? true,
    welcomeTitle: onboarding.welcomeTitle,
    welcomeMessage: onboarding.welcomeMessage,
    onboardingQuestions: onboarding.questions,
    profileQuestions: onboarding.profileQuestions,
    businessProfileEnabled: onboarding.businessProfileEnabled,
    businessProfileInputMode: onboarding.businessProfileInputMode,
    dailyIdeaDelivery: onboarding.dailyIdeaDelivery,
  };
  return { configuration, payload };
}
