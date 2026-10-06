import { parseAiTrainingOperationsSettings } from './operations';

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
  return (
    root?.['moduleKey'] === 'AI_TRAINING_V1' &&
    pilot?.['enabled'] === true &&
    Object.keys(pilot).every((key) => ['enabled', 'enrollmentIds'].includes(key)) &&
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= 5 &&
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
