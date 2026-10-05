import { ApplicationError } from '@bunshin/shared';

export const LEARNING_SCOPE_CLASSIFICATIONS = [
  'LEARNING',
  'LEARNING_SUPPORT',
  'CONTENT_REQUEST',
  'CONSULTING',
  'AUTOMATION_REQUEST',
  'OUT_OF_SCOPE',
] as const;
export type LearningScopeClassification = (typeof LEARNING_SCOPE_CLASSIFICATIONS)[number];

/** A classification receipt, never an execution permission or confirmed Goal. */
export interface LearningScopeResult {
  readonly classification: LearningScopeClassification | null;
  readonly detectedClassifications: readonly LearningScopeClassification[];
  readonly ruleVersion: string;
  readonly reason: string;
  readonly requiresConfirmation: boolean;
  /** Unconfirmed learning suggestion; contains no Goal identity or approval. */
  readonly suggestedLearningIntent: string | null;
}

export function defineLearningScopeResult(input: LearningScopeResult): LearningScopeResult {
  const detected = [...new Set(input.detectedClassifications)];
  const validClassification = (value: unknown) =>
    LEARNING_SCOPE_CLASSIFICATIONS.some((classification) => classification === value);
  if (
    (input.classification !== null && !validClassification(input.classification)) ||
    detected.some((value) => !validClassification(value)) ||
    (input.classification === null
      ? detected.length !== 0
      : !detected.includes(input.classification)) ||
    !/^[A-Z][A-Z0-9_]{0,79}$/.test(input.ruleVersion) ||
    !/^[A-Z][A-Z0-9_]{0,79}$/.test(input.reason) ||
    typeof input.requiresConfirmation !== 'boolean' ||
    ((input.classification === null ||
      detected.length > 1 ||
      input.classification === 'CONTENT_REQUEST' ||
      input.classification === 'AUTOMATION_REQUEST') &&
      !input.requiresConfirmation) ||
    (input.suggestedLearningIntent !== null &&
      (!input.requiresConfirmation ||
        detected.length !== 1 ||
        (input.classification !== 'CONTENT_REQUEST' &&
          input.classification !== 'AUTOMATION_REQUEST') ||
        !input.suggestedLearningIntent.trim() ||
        input.suggestedLearningIntent.length > 300))
  ) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid learning scope result');
  }
  return Object.freeze({
    ...input,
    detectedClassifications: Object.freeze(detected),
    suggestedLearningIntent: input.suggestedLearningIntent?.trim() ?? null,
  });
}
