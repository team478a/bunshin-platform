export interface ServiceOnboardingSettings {
  welcomeTitle: string;
  welcomeMessage: string;
  questions: string[];
  profileQuestions: ServiceProfileQuestionSettings;
}

export interface ServiceProfileQuestionSettings {
  industry: boolean;
  purpose: boolean;
  activityName: boolean;
  businessName: boolean;
  region: boolean;
  productService: boolean;
  socialProfile: boolean;
  notificationConsent: boolean;
}

export const DEFAULT_SERVICE_PROFILE_QUESTIONS: ServiceProfileQuestionSettings = {
  industry: true,
  purpose: true,
  activityName: true,
  businessName: true,
  region: true,
  productService: true,
  socialProfile: true,
  notificationConsent: true,
};

export interface ServiceAnnouncement {
  enabled: boolean;
  title: string;
  message: string;
  startsAt: string | null;
  endsAt: string | null;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function readServiceOnboardingSettings(
  onboardingConfig: unknown,
  surveyConfig: unknown,
): ServiceOnboardingSettings {
  const onboarding = record(onboardingConfig);
  const survey = record(surveyConfig);
  const configuredProfileQuestions = record(onboarding.profileQuestions);
  const profileQuestions = Object.fromEntries(
    Object.entries(DEFAULT_SERVICE_PROFILE_QUESTIONS).map(([key, fallback]) => [
      key,
      typeof configuredProfileQuestions[key] === 'boolean'
        ? configuredProfileQuestions[key]
        : fallback,
    ]),
  ) as unknown as ServiceProfileQuestionSettings;
  return {
    welcomeTitle: typeof onboarding.welcomeTitle === 'string' ? onboarding.welcomeTitle : '',
    welcomeMessage: typeof onboarding.welcomeMessage === 'string' ? onboarding.welcomeMessage : '',
    questions: Array.isArray(survey.questions)
      ? survey.questions.filter((item): item is string => typeof item === 'string').slice(0, 7)
      : [],
    profileQuestions,
  };
}

/**
 * Returns the service-wide notice shown on the signed-in participant home.
 * This intentionally lives with the service onboarding configuration: it is
 * lightweight operational copy, not a message delivery or a personal record.
 */
export function readServiceAnnouncement(onboardingConfig: unknown): ServiceAnnouncement {
  const onboarding = record(onboardingConfig);
  const date = (value: unknown) => {
    if (typeof value !== 'string') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };
  return {
    enabled: onboarding.announcementEnabled === true,
    title:
      typeof onboarding.announcementTitle === 'string' ? onboarding.announcementTitle.trim() : '',
    message:
      typeof onboarding.announcementMessage === 'string'
        ? onboarding.announcementMessage.trim()
        : '',
    startsAt: date(onboarding.announcementStartsAt),
    endsAt: date(onboarding.announcementEndsAt),
  };
}

export function isServiceAnnouncementVisible(announcement: ServiceAnnouncement, now = new Date()) {
  if (!announcement.enabled || !announcement.title || !announcement.message) return false;
  if (announcement.startsAt && new Date(announcement.startsAt) > now) return false;
  return !announcement.endsAt || new Date(announcement.endsAt) > now;
}
