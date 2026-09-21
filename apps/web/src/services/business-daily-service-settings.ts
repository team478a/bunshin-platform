import type { ServiceDailyIdeaDeliverySettings } from './service-onboarding-settings';

export type BusinessDailyServiceSettings = {
  businessProfileEnabled: boolean;
  emailEnabled: boolean;
  lineEnabled: boolean;
  inviteCodeEnabled: boolean;
  referralEnabled: boolean;
  dailyIdeaDelivery: ServiceDailyIdeaDeliverySettings;
};

export type BusinessFreeRegistrationSettings = {
  businessProfileEnabled: boolean;
  registrationMode: 'PUBLIC' | 'INVITATION_ONLY' | 'APPROVAL_REQUIRED' | 'CLOSED';
  emailEnabled: boolean;
  lineEnabled: boolean;
  inviteCodeEnabled: boolean;
  referralEnabled: boolean;
};

export function enforceBusinessFreeRegistrationSettings<T extends BusinessFreeRegistrationSettings>(
  value: T,
): T {
  if (!value.businessProfileEnabled) return value;
  return {
    ...value,
    registrationMode: 'PUBLIC',
    inviteCodeEnabled: false,
    referralEnabled: false,
  };
}

export function enforceBusinessDailyDeliverySettings(
  businessProfileEnabled: boolean,
  value: ServiceDailyIdeaDeliverySettings,
): ServiceDailyIdeaDeliverySettings {
  if (!businessProfileEnabled) return value;
  return {
    ...value,
    enabled: true,
    cadence: 'DAILY',
    lockCadence: true,
    contentMode: 'READY_TO_USE',
    mediaMode: 'TEXT_ONLY',
    videoBgm: { ...value.videoBgm, enabled: false, assetId: null },
    videoNarration: { ...value.videoNarration, enabled: false },
    visualCharacter: {
      ...value.visualCharacter,
      enabled: false,
      profileVersionId: null,
    },
  };
}

export function enforceBusinessDailyServiceSettings<T extends BusinessDailyServiceSettings>(
  value: T,
): T {
  if (!value.businessProfileEnabled) return value;
  return {
    ...value,
    inviteCodeEnabled: false,
    referralEnabled: false,
    dailyIdeaDelivery: enforceBusinessDailyDeliverySettings(true, value.dailyIdeaDelivery),
  };
}
