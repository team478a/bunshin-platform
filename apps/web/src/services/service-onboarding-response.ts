export type ServiceOnboardingAnswer = Record<string, string>;

export function readServiceOnboardingAnswers(value: unknown): ServiceOnboardingAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    return typeof entry['question'] === 'string' && typeof entry['answer'] === 'string'
      ? [{ question: entry['question'], answer: entry['answer'] }]
      : [];
  });
}

export function serviceOnboardingProposalContext(answers: ServiceOnboardingAnswer[]): string {
  const context = answers
    .slice(0, 7)
    .map((entry) => `質問：${entry['question'] ?? ''}\n回答：${entry['answer'] ?? ''}`)
    .join('\n');
  return context.slice(0, 3000);
}

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
