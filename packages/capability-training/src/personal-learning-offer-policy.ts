const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const PERSONAL_LEARNING_OFFER_POLICIES = ['AI_SKILL_V1', 'SIDE_HUSTLE_V1'] as const;
export type PersonalLearningOfferPolicy = (typeof PERSONAL_LEARNING_OFFER_POLICIES)[number];

/** Missing is the legacy AI-skill offer; malformed explicit values fail closed. */
export function personalLearningOfferPolicy(settings: unknown): PersonalLearningOfferPolicy | null {
  const root = object(settings);
  if (!root || !Object.hasOwn(root, 'learningOfferPolicy')) return 'AI_SKILL_V1';
  const value = root['learningOfferPolicy'];
  return PERSONAL_LEARNING_OFFER_POLICIES.includes(value as PersonalLearningOfferPolicy)
    ? (value as PersonalLearningOfferPolicy)
    : null;
}
