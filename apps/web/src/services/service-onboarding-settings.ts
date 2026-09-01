export interface ServiceOnboardingSettings {
  welcomeTitle: string;
  welcomeMessage: string;
  questions: string[];
}

export interface ServiceAnnouncement {
  enabled: boolean;
  title: string;
  message: string;
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
  return {
    welcomeTitle: typeof onboarding.welcomeTitle === 'string' ? onboarding.welcomeTitle : '',
    welcomeMessage: typeof onboarding.welcomeMessage === 'string' ? onboarding.welcomeMessage : '',
    questions: Array.isArray(survey.questions)
      ? survey.questions.filter((item): item is string => typeof item === 'string').slice(0, 7)
      : [],
  };
}

/**
 * Returns the service-wide notice shown on the signed-in participant home.
 * This intentionally lives with the service onboarding configuration: it is
 * lightweight operational copy, not a message delivery or a personal record.
 */
export function readServiceAnnouncement(onboardingConfig: unknown): ServiceAnnouncement {
  const onboarding = record(onboardingConfig);
  return {
    enabled: onboarding.announcementEnabled === true,
    title:
      typeof onboarding.announcementTitle === 'string' ? onboarding.announcementTitle.trim() : '',
    message:
      typeof onboarding.announcementMessage === 'string'
        ? onboarding.announcementMessage.trim()
        : '',
  };
}
