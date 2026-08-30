export type ServiceOnboardingAnswer = Record<string, string>;

export function buildServiceOnboardingAnswers(
  questions: string[],
  answers: string[],
): ServiceOnboardingAnswer[] {
  if (questions.length === 0 || questions.length !== answers.length || questions.length > 7) {
    throw new Error('ONBOARDING_ANSWERS_INVALID');
  }
  return questions.map((question, index) => {
    const answer = answers[index]?.trim() ?? '';
    if (!answer || answer.length > 1000) throw new Error('ONBOARDING_ANSWERS_INVALID');
    return { question, answer };
  });
}
