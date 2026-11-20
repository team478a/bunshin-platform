export const FORTUNE_INTAKE_MAX_QUESTIONS = 5;
export const FORTUNE_INTAKE_DEFAULT_QUESTIONS = 3;

export const FORTUNE_INTAKE_KEYS = ['SITUATION', 'REASON', 'VALUES', 'DESIRED', 'GOAL'] as const;
export type FortuneIntakeKey = (typeof FORTUNE_INTAKE_KEYS)[number];

export const FORTUNE_INTAKE_QUESTIONS = {
  SITUATION: {
    text: '今の状況について、どこから整理したいですか？',
    choices: ['最近起きたこと', '以前から続いていること', 'まだ状況を整理できていない'],
  },
  REASON: {
    text: 'そのことが気になり始めたきっかけはありますか？',
    choices: ['最近変化があった', '少しずつ気になってきた', 'はっきりしたきっかけはない'],
  },
  VALUES: {
    text: '考えるとき、どんなことを大切にしたいですか？',
    choices: ['安心できること', '自分で納得して選べること', '周りとの関係を保つこと'],
  },
  DESIRED: {
    text: '少し先に、どんな状態になっていたらうれしいですか？',
    choices: ['今の状況を少し変えたい', '今のままで負担を減らしたい', 'いくつかの可能性を知りたい'],
  },
  GOAL: {
    text: '今回の占いで、何を整理できると役立ちそうですか？',
    choices: ['今の気持ち', '選択肢とそれぞれの違い', '今日できる小さな一歩'],
  },
} as const satisfies Record<FortuneIntakeKey, { text: string; choices: readonly string[] }>;

export type FortuneIntakeAnswer = { key: FortuneIntakeKey; answer: string | null };

export function fortuneIntakeQuestionKey(value: unknown): FortuneIntakeKey | null {
  return FORTUNE_INTAKE_KEYS.find((key) => key === value) ?? null;
}

const consultationLabels: Record<FortuneIntakeKey, string> = {
  SITUATION: '今の状況',
  REASON: 'きっかけ',
  VALUES: '大切なこと',
  DESIRED: '望む状態',
  GOAL: '知りたいこと',
};

export function fortuneIntakeConsultation(
  consultation: string,
  answers: readonly FortuneIntakeAnswer[],
) {
  return [
    consultation.trim(),
    ...answers.flatMap(({ key, answer }) =>
      answer ? [`【${consultationLabels[key]}】${answer}`] : [],
    ),
  ]
    .filter(Boolean)
    .join('\n');
}

export function fortuneIntakeOptions(value: unknown) {
  const settings = value as {
    intake?: { enabled?: unknown; questions?: unknown; calls?: unknown };
  } | null;
  const count = (input: unknown, fallback: number) =>
    typeof input === 'number' &&
    Number.isInteger(input) &&
    input >= 0 &&
    input <= FORTUNE_INTAKE_MAX_QUESTIONS
      ? input
      : fallback;
  const questions = count(settings?.intake?.questions, FORTUNE_INTAKE_DEFAULT_QUESTIONS);
  return {
    enabled: settings?.intake?.enabled === true,
    questions,
    calls: count(settings?.intake?.calls, questions),
  };
}
