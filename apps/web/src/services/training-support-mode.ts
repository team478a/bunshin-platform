import { ApplicationError } from '@bunshin/shared';

/** Published V1 definitions and historical records remain immutable. */
export function isTrainingProgram(settings: unknown): boolean {
  return (
    !!settings &&
    typeof settings === 'object' &&
    !Array.isArray(settings) &&
    (settings as Record<string, unknown>)['moduleKey'] === 'AI_TRAINING_V1'
  );
}

export function selectableTrainingModes<T extends string>(
  modes: readonly T[],
  training: boolean,
): T[] {
  return modes.filter((mode) => !training || mode === 'GUIDED');
}

export function requireTrainingLearningMode(settings: unknown, modes: readonly string[]): void {
  if (
    isTrainingProgram(settings) &&
    (modes.length === 0 || modes.some((mode) => mode !== 'GUIDED'))
  ) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'AI研修は本人がAIを使う学習支援のみ利用できます。',
    );
  }
}
