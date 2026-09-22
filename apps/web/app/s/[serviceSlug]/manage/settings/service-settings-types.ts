import type {
  readServiceAnnouncement,
  readServiceOnboardingSettings,
} from '../../../../../src/services/service-onboarding-settings';

export interface ServiceSettingsValue {
  displayName: string;
  description: string;
  operatorName: string;
  contactEmail: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  trendResearchEnabled?: boolean;
  brand: {
    logoUrl: string | null;
    iconUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
  };
  registration: {
    mode: 'PUBLIC' | 'INVITATION_ONLY' | 'APPROVAL_REQUIRED' | 'CLOSED';
    emailEnabled: boolean;
    lineEnabled: boolean;
    inviteCodeEnabled: boolean;
    referralEnabled: boolean;
    onboardingConfig: unknown;
    surveyConfig: unknown;
  };
}

export type ServiceOnboardingSettings = ReturnType<typeof readServiceOnboardingSettings>;
export type DailyIdeaDeliverySettings = ServiceOnboardingSettings['dailyIdeaDelivery'];
export type ServiceAnnouncementSettings = ReturnType<typeof readServiceAnnouncement>;

export interface VisualCharacterOption {
  id: string;
  name: string;
  version: number;
}

export interface AudioTrackOption {
  id: string;
  originalFilename: string;
}
