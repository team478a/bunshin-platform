import { fortuneIntakeOptions } from './fortune-intake';
import {
  fortuneUnderstandingConsultation,
  parseConfirmedFortuneUnderstanding,
  type ConfirmedFortuneUnderstanding,
} from './fortune-understanding';

export type FortuneDeepProposal = {
  alternatives: string[];
  actionReason: string;
};

export type FortuneDeepReadingDetails = FortuneDeepProposal & {
  consultationSummary: string | null;
  importantValue: string | null;
};

export function fortuneDeepReadingEnabled(settings: unknown) {
  return (
    fortuneIntakeOptions(settings).enabled &&
    settings !== null &&
    typeof settings === 'object' &&
    'deepReadingEnabled' in settings &&
    settings.deepReadingEnabled === true
  );
}

export function parseFortuneReviewedItems(value: unknown): ConfirmedFortuneUnderstanding[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) return null;
  const items = value.map(parseConfirmedFortuneUnderstanding).filter((item) => item !== null);
  return items.length === value.length &&
    new Set(items.map(({ field }) => field)).size === items.length
    ? items
    : null;
}

export function buildFortuneDeepReadingDetails(
  items: readonly ConfirmedFortuneUnderstanding[],
  proposal: FortuneDeepProposal,
): FortuneDeepReadingDetails {
  return {
    consultationSummary:
      fortuneUnderstandingConsultation(items.filter(({ field }) => field !== 'VALUES')) || null,
    importantValue: items.find(({ field }) => field === 'VALUES')?.text ?? null,
    ...proposal,
  };
}

export function parseFortuneDeepReadingDetails(value: unknown): FortuneDeepReadingDetails | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('consultationSummary' in value) ||
    !('importantValue' in value) ||
    !('alternatives' in value) ||
    !('actionReason' in value)
  )
    return null;
  const { consultationSummary, importantValue, alternatives, actionReason } = value;
  if (
    (consultationSummary !== null && typeof consultationSummary !== 'string') ||
    (importantValue !== null && typeof importantValue !== 'string') ||
    !Array.isArray(alternatives) ||
    !alternatives.every((option): option is string => typeof option === 'string') ||
    typeof actionReason !== 'string'
  )
    return null;
  return { consultationSummary, importantValue, alternatives, actionReason };
}
