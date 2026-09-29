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
    normalized.length === 0 ||
    LOW_INFORMATION_ANSWERS.some((placeholder) => normalized.includes(placeholder))
  );
}

/** Returns one question at a time so profile enrichment stays quick on mobile. */
export function nextOnboardingRefinement(
  questions: string[],
  storedAnswers: ServiceOnboardingAnswer[],
  options: { state?: unknown; nextRefinementAt?: Date | null; now?: Date } = {},
): { index: number; question: string; answer: string } | null {
  const now = options.now ?? new Date();
  if (options.nextRefinementAt && options.nextRefinementAt > now) return null;
  const state = readOnboardingRefinementState(options.state);
  const answers = answersForCurrentQuestions(questions, storedAnswers);
  const index = answers.findIndex(
    (answer, index) =>
      isLowInformationOnboardingAnswer(answer) &&
      !state.deferred.some(
        (entry) => entry.question === questions[index]?.trim() && new Date(entry.until) > now,
      ),
  );
  return index === -1
    ? null
    : { index, question: questions[index] ?? '', answer: answers[index] ?? '' };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function nextOnboardingRefinementAt(now: Date): Date {
  return new Date(now.getTime() + DAY_MS);
}

type RefinementEvent = { question: string; at: string; until: string };
type RefinementState = { version: 1; deferred: RefinementEvent[]; history: RefinementEvent[] };

/** Bounded, versioned metadata only; never stores answer bodies. */
export function readOnboardingRefinementState(value: unknown): RefinementState {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const events = (items: unknown): RefinementEvent[] =>
    !Array.isArray(items)
      ? []
      : items.slice(-20).flatMap((item: unknown) => {
          if (!item || typeof item !== 'object') return [];
          const entry = item as Record<string, unknown>;
          if (
            typeof entry['question'] !== 'string' ||
            !entry['question'].trim() ||
            entry['question'].length > 1000 ||
            typeof entry['at'] !== 'string' ||
            !Number.isFinite(Date.parse(entry['at'])) ||
            typeof entry['until'] !== 'string' ||
            !Number.isFinite(Date.parse(entry['until']))
          )
            return [];
          return [{ question: entry['question'].trim(), at: entry['at'], until: entry['until'] }];
        });
  return { version: 1, deferred: events(record['deferred']), history: events(record['history']) };
}

export function deferOnboardingRefinement(
  questions: string[],
  question: string,
  value: unknown,
  now: Date,
): RefinementState {
  const state = readOnboardingRefinementState(value);
  const key = question.trim();
  if (!questions.some((entry) => entry.trim() === key)) {
    throw new Error('ONBOARDING_QUESTION_INVALID');
  }
  if (state.deferred.some((entry) => entry.question === key && new Date(entry.until) > now)) {
    return state;
  }
  const event = {
    question: key,
    at: now.toISOString(),
    until: new Date(now.getTime() + 7 * DAY_MS).toISOString(),
  };
  return {
    version: 1,
    deferred: [
      ...state.deferred.filter(
        (entry) =>
          entry.question !== key &&
          questions.some((current) => current.trim() === entry.question) &&
          new Date(entry.until) > now,
      ),
      event,
    ],
    history: [...state.history, event].slice(-20),
  };
}
