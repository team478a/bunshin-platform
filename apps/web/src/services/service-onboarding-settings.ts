export interface ServiceOnboardingSettings {
  welcomeTitle: string;
  welcomeMessage: string;
  questions: string[];
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
