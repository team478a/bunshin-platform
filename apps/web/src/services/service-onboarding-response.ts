export type ServiceOnboardingAnswer = Record<string, string>;

const LOW_INFORMATION_ANSWERS = [
  'まだ決めていない',
  'まだありません',
  'もう少し知ってから考えたい',
  'よく覚えていない',
  'まだ回答していません',
] as const;

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
  if (questions.length !== answers.length || questions.length > 7) {
    throw new Error('ONBOARDING_ANSWERS_INVALID');
  }
  return questions.map((question, index) => {
    const answer = answers[index]?.trim() ?? '';
    if (!answer || answer.length > 1000) throw new Error('ONBOARDING_ANSWERS_INVALID');
    return { question, answer };
  });
}

export function answersForCurrentQuestions(
  questions: string[],
  storedAnswers: ServiceOnboardingAnswer[],
): string[] {
  const byQuestion = new Map(
    storedAnswers.map((entry) => [entry['question']?.trim() ?? '', entry['answer']?.trim() ?? '']),
  );
  return questions.map((question) => byQuestion.get(question.trim()) ?? '');
}

export function isLowInformationOnboardingAnswer(answer: string) {
  const normalized = answer.replace(/\s+/g, '').trim();
  return (
    normalized.length < 2 ||
    LOW_INFORMATION_ANSWERS.some((placeholder) => normalized.includes(placeholder))
  );
}

/** Returns one question at a time so profile enrichment stays quick on mobile. */
export function nextOnboardingRefinement(
  questions: string[],
  storedAnswers: ServiceOnboardingAnswer[],
): { index: number; question: string; answer: string } | null {
  const answers = answersForCurrentQuestions(questions, storedAnswers);
  const index = answers.findIndex(isLowInformationOnboardingAnswer);
  return index === -1
    ? null
    : { index, question: questions[index] ?? '', answer: answers[index] ?? '' };
}
