export const AI_TRAINING_HELP_RESOLVED_EVENT = 'TRAINING_HELP_RESOLVED';

export type AiTrainingOperationsSettings = {
  notificationsEnabled: boolean;
  notificationHour: number;
  postponedReminderEnabled: boolean;
  postponedReminderHours: number;
  helpQueueEnabled: boolean;
};

export const DEFAULT_AI_TRAINING_OPERATIONS_SETTINGS: AiTrainingOperationsSettings = {
  notificationsEnabled: true,
  notificationHour: 9,
  postponedReminderEnabled: true,
  postponedReminderHours: 24,
  helpQueueEnabled: true,
};

const boundedInteger = (value: unknown, fallback: number, min: number, max: number) =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max
    ? (value as number)
    : fallback;

export function parseAiTrainingOperationsSettings(value: unknown): AiTrainingOperationsSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return DEFAULT_AI_TRAINING_OPERATIONS_SETTINGS;
  const root = value as Record<string, unknown>;
  const candidate = root['trainingOperations'];
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
    return DEFAULT_AI_TRAINING_OPERATIONS_SETTINGS;
  const settings = candidate as Record<string, unknown>;
  return {
    notificationsEnabled:
      typeof settings['notificationsEnabled'] === 'boolean'
        ? settings['notificationsEnabled']
        : true,
    notificationHour: boundedInteger(settings['notificationHour'], 9, 0, 23),
    postponedReminderEnabled:
      typeof settings['postponedReminderEnabled'] === 'boolean'
        ? settings['postponedReminderEnabled']
        : true,
    postponedReminderHours: boundedInteger(settings['postponedReminderHours'], 24, 1, 168),
    helpQueueEnabled:
      typeof settings['helpQueueEnabled'] === 'boolean' ? settings['helpQueueEnabled'] : true,
  };
}
