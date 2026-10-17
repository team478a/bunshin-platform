import { personalLearningFeatureEnabled } from './personal-learning-pilot';

export type PersonalLearningTopicStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';
export type PersonalLearningPersonaStatus = 'UNCONFIRMED' | 'CONFIRMED' | 'REJECTED';

/** Provisional reviewed cap: three simultaneous topics when the opt-in flag is enabled. */
export const PERSONAL_LEARNING_ACTIVE_TOPIC_LIMIT = 3;

export function personalLearningTopicLimit(settings: unknown): number {
  return personalLearningFeatureEnabled(settings, 'multiTopic')
    ? PERSONAL_LEARNING_ACTIVE_TOPIC_LIMIT
    : 1;
}

export function canCreatePersonalLearningTopic(
  settings: unknown,
  activeTopicCount: number,
): boolean {
  return (
    Number.isSafeInteger(activeTopicCount) &&
    activeTopicCount >= 0 &&
    activeTopicCount < personalLearningTopicLimit(settings)
  );
}

/** Rejected inferences are never supplied to an AI call; unconfirmed items remain explicitly tagged. */
export function personaItemsForAi<T extends { status: PersonalLearningPersonaStatus }>(
  items: readonly T[],
): Array<T & { epistemicStatus: 'UNCONFIRMED_GUESS' | 'LEARNER_CONFIRMED' }> {
  return items.flatMap((item) => {
    if (item.status === 'REJECTED') return [];
    return [
      {
        ...item,
        epistemicStatus: item.status === 'CONFIRMED' ? 'LEARNER_CONFIRMED' : 'UNCONFIRMED_GUESS',
      },
    ];
  });
}
