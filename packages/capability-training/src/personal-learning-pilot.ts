import { parseAiTrainingOperationsSettings } from './operations';
import { parsePilotParticipantPolicy } from './pilot-participant-cap';

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** A reserved Program never falls back to the legacy scheduler, even when disabled/malformed. */
export function isPersonalLearningPilotProgram(settings: unknown): boolean {
  const root = object(settings);
  return root !== null && Object.hasOwn(root, 'personalLearningPilot');
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
      ['enabled', 'enrollmentIds', ...(capped ? ['participantControl'] : [])].includes(key),
    ) &&
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
