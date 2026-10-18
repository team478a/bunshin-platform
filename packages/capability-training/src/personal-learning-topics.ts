import { personalLearningFeatureEnabled } from './personal-learning-pilot';

export type PersonalLearningTopicStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

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
