import { parseAiTrainingOperationsSettings } from './operations';
import { parsePilotParticipantPolicy } from './pilot-participant-cap';

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export type PersonalLearningMode = 'DYNAMIC_V1' | 'FIXED_DEFINITIONS_V1';
export const PERSONAL_LEARNING_FEATURE_KEYS = [
  'conversation',
  'multiTopic',
  'lineLearning',
  'extendedScope',
  'learningNudges',
] as const;
export type PersonalLearningFeature = (typeof PERSONAL_LEARNING_FEATURE_KEYS)[number];
export type PersonalLearningFeatures = Readonly<Record<PersonalLearningFeature, boolean>>;
const defaultFeatures: PersonalLearningFeatures = Object.freeze({
  conversation: false,
  multiTopic: false,
  lineLearning: false,
  extendedScope: false,
  learningNudges: false,
});
const legacyFeatureKeys = PERSONAL_LEARNING_FEATURE_KEYS.filter((key) => key !== 'learningNudges');

/** Missing mode is the legacy contract; malformed explicit values fail closed. */
export function personalLearningMode(settings: unknown): PersonalLearningMode | null {
  const pilot = object(object(settings)?.['personalLearningPilot']);
  const mode = pilot?.['learningMode'];
  if (mode === undefined) return 'FIXED_DEFINITIONS_V1';
  return mode === 'DYNAMIC_V1' || mode === 'FIXED_DEFINITIONS_V1' ? mode : null;
}

/** Feature switches are always opt-in; old Programs and malformed settings stay OFF. */
export function personalLearningFeatures(settings: unknown): PersonalLearningFeatures | null {
  const pilot = object(object(settings)?.['personalLearningPilot']);
  const raw = pilot?.['learningFeatures'];
  if (raw === undefined) return defaultFeatures;
  const features = object(raw);
  if (
    !features ||
    !(
      Object.keys(features).length === PERSONAL_LEARNING_FEATURE_KEYS.length ||
      Object.keys(features).length === legacyFeatureKeys.length
    ) ||
    legacyFeatureKeys.some((key) => typeof features[key] !== 'boolean') ||
    (Object.hasOwn(features, 'learningNudges') &&
      typeof features['learningNudges'] !== 'boolean') ||
    Object.keys(features).some(
      (key) => !PERSONAL_LEARNING_FEATURE_KEYS.includes(key as PersonalLearningFeature),
    )
  )
    return null;
  return Object.freeze({
    conversation: features['conversation'] as boolean,
    multiTopic: features['multiTopic'] as boolean,
    lineLearning: features['lineLearning'] as boolean,
    extendedScope: features['extendedScope'] as boolean,
    learningNudges: features['learningNudges'] === true,
  });
}

export function personalLearningFeatureEnabled(
  settings: unknown,
  feature: PersonalLearningFeature,
): boolean {
  return personalLearningFeatures(settings)?.[feature] === true;
}

export function personalLearningDynamicProgramAllows(settings: unknown, enrollmentId: string) {
  return (
    personalLearningMode(settings) === 'DYNAMIC_V1' &&
    personalLearningFeatures(settings) !== null &&
    personalLearningPilotAllows(settings, enrollmentId)
  );
}

/** A reserved Program never falls back to the legacy scheduler, even when disabled/malformed. */
export function isPersonalLearningPilotProgram(settings: unknown): boolean {
  const root = object(settings);
  return root !== null && Object.hasOwn(root, 'personalLearningPilot');
}

/**
 * Capacity available to ordinary paid registrations while the bounded Pilot is running.
 * A reserved but stopped/malformed Pilot deliberately returns null (fail closed).
 */
export function personalLearningPublicRegistrationCapacity(settings: unknown): number | null {
  const root = object(settings);
  const pilot = object(root?.['personalLearningPilot']);
  const policy = parsePilotParticipantPolicy(pilot?.['participantControl']);
  if (
    root?.['moduleKey'] !== 'AI_TRAINING_V1' ||
    pilot?.['enabled'] !== true ||
    !policy ||
    policy.currentWave < 1 ||
    parseAiTrainingOperationsSettings(settings).notificationsEnabled ||
    parseAiTrainingOperationsSettings(settings).postponedReminderEnabled
  )
    return null;
  return Math.min(policy.externalParticipantCap, policy.currentWaveCap);
}

export function personalLearningPilotAllows(settings: unknown, enrollmentId: string): boolean {
  const root = object(settings);
  const pilot = object(root?.['personalLearningPilot']);
  const ids = pilot?.['enrollmentIds'];
  const capped = Object.hasOwn(pilot ?? {}, 'participantControl');
  const policy = capped ? parsePilotParticipantPolicy(pilot?.['participantControl']) : null;
  return (
    root?.['moduleKey'] === 'AI_TRAINING_V1' &&
    pilot?.['enabled'] === true &&
    Object.keys(pilot).every((key) =>
      [
        'enabled',
        'enrollmentIds',
        ...(capped ? ['participantControl'] : []),
        ...(Object.hasOwn(pilot, 'learningMode') ? ['learningMode'] : []),
        ...(Object.hasOwn(pilot, 'learningFeatures') ? ['learningFeatures'] : []),
      ].includes(key),
    ) &&
    personalLearningMode(settings) !== null &&
    personalLearningFeatures(settings) !== null &&
    (!capped || policy !== null) &&
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <=
      (policy
        ? Math.min(policy.externalParticipantCap, policy.currentWaveCap) +
          policy.internalParticipantCap
        : 5) &&
    ids.every(
      (id) =>
        typeof id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
    ) &&
    new Set(ids).size === ids.length &&
    ids.includes(enrollmentId) &&
    !parseAiTrainingOperationsSettings(settings).notificationsEnabled &&
    !parseAiTrainingOperationsSettings(settings).postponedReminderEnabled
  );
}

/** Preparation only: validate the same bounded allowlist without enabling execution. */
export function personalLearningPilotProfilePreparationAllows(
  settings: unknown,
  enrollmentId: string,
): boolean {
  const root = object(settings);
  const pilot = object(root?.['personalLearningPilot']);
  if (!root || !pilot || pilot['enabled'] !== false) return false;
  // Pure validation projection; stored settings and runtime enablement remain unchanged.
  return personalLearningPilotAllows(
    { ...root, personalLearningPilot: { ...pilot, enabled: true } },
    enrollmentId,
  );
}
