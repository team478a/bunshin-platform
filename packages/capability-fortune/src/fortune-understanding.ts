import {
  FORTUNE_INTAKE_KEYS,
  fortuneIntakeConsultation,
  type FortuneIntakeAnswer,
} from './fortune-intake';
import type { FortuneTheme } from './fortune-definition';

export const FORTUNE_UNDERSTANDING_FIELDS = ['CONSULTATION', ...FORTUNE_INTAKE_KEYS] as const;
export const FORTUNE_UNDERSTANDING_SOURCES = [
  'CONSULTATION',
  'ANSWER',
  'CORRECTION',
  'CONFIRMED_SUGGESTION',
] as const;
export type FortuneUnderstandingField = (typeof FORTUNE_UNDERSTANDING_FIELDS)[number];
export type FortuneUnderstandingSource = (typeof FORTUNE_UNDERSTANDING_SOURCES)[number];
export type ConfirmedFortuneUnderstanding = {
  field: FortuneUnderstandingField;
  state: 'CONFIRMED';
  text: string;
  source: FortuneUnderstandingSource;
};
export type FortuneUnderstandingItem =
  | ConfirmedFortuneUnderstanding
  | { field: FortuneUnderstandingField; state: 'INFERRED'; text: string; source: 'THEME' }
  | { field: FortuneUnderstandingField; state: 'UNKNOWN' };
export type FortuneUnderstandingSnapshot = {
  items: ConfirmedFortuneUnderstanding[];
  revision: string | null;
  profileRevision: string | null;
  savedAt: string | null;
  expiresAt: string | null;
  canSave: boolean;
};

export const fortuneUnderstandingFieldLabels: Record<FortuneUnderstandingField, string> = {
  CONSULTATION: '今回話したこと',
  SITUATION: '本人が説明した状況',
  REASON: '気になっている理由',
  VALUES: '大切にしたいこと',
  DESIRED: '望む状態',
  GOAL: '鑑定で知りたいこと',
};

export const fortuneUnderstandingTextLimit = (field: FortuneUnderstandingField) =>
  field === 'CONSULTATION' ? 200 : 50;

export function buildFortuneUnderstanding(
  theme: FortuneTheme,
  consultation: string,
  answers: readonly FortuneIntakeAnswer[],
): FortuneUnderstandingItem[] {
  const themeLabel = { LOVE: '恋愛', WORK: '仕事', RELATIONSHIPS: '人間関係' }[theme];
  return FORTUNE_UNDERSTANDING_FIELDS.map((field) => {
    const text = (
      field === 'CONSULTATION' ? consultation : answers.find(({ key }) => key === field)?.answer
    )?.trim();
    if (text) {
      return {
        field,
        state: 'CONFIRMED',
        text,
        source: field === 'CONSULTATION' ? 'CONSULTATION' : 'ANSWER',
      };
    }
    if (
      field === 'GOAL' &&
      !answers.some(({ key }) => key === 'GOAL') &&
      (consultation.trim() || answers.some(({ answer }) => answer))
    ) {
      return {
        field,
        state: 'INFERRED',
        text: `${themeLabel}について、今後の選択肢を整理したい`,
        source: 'THEME',
      };
    }
    return { field, state: 'UNKNOWN' };
  });
}

export function confirmedFortuneUnderstanding(items: readonly FortuneUnderstandingItem[]) {
  return items.filter((item): item is ConfirmedFortuneUnderstanding => item.state === 'CONFIRMED');
}

export function fortuneUnderstandingConsultation(items: readonly FortuneUnderstandingItem[]) {
  const confirmed = confirmedFortuneUnderstanding(items);
  return fortuneIntakeConsultation(
    confirmed.find(({ field }) => field === 'CONSULTATION')?.text ?? '',
    confirmed.flatMap(({ field, text }) =>
      field === 'CONSULTATION' ? [] : [{ key: field, answer: text }],
    ),
  );
}

export function parseConfirmedFortuneUnderstanding(
  value: unknown,
): ConfirmedFortuneUnderstanding | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('field' in value) ||
    !('text' in value) ||
    !('source' in value) ||
    !('state' in value) ||
    value.state !== 'CONFIRMED'
  )
    return null;
  const field = FORTUNE_UNDERSTANDING_FIELDS.find((candidate) => candidate === value.field);
  const source = FORTUNE_UNDERSTANDING_SOURCES.find((candidate) => candidate === value.source);
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  if (!field || !source || !text || text.length > fortuneUnderstandingTextLimit(field)) return null;
  if (source === 'CONSULTATION' && field !== 'CONSULTATION') return null;
  if (source === 'ANSWER' && field === 'CONSULTATION') return null;
  if (source === 'CONFIRMED_SUGGESTION' && field !== 'GOAL') return null;
  return { field, state: 'CONFIRMED', text, source };
}
