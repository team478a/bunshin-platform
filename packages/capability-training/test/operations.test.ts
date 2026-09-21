import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_TRAINING_OPERATIONS_SETTINGS,
  parseAiTrainingOperationsSettings,
} from '../src/operations';

describe('AI training operations settings', () => {
  it('uses safe defaults for existing programs', () => {
    expect(parseAiTrainingOperationsSettings({ moduleKey: 'AI_TRAINING_V1' })).toEqual(
      DEFAULT_AI_TRAINING_OPERATIONS_SETTINGS,
    );
  });

  it('accepts bounded service settings and rejects unsafe numeric values', () => {
    expect(
      parseAiTrainingOperationsSettings({
        trainingOperations: {
          notificationsEnabled: false,
          notificationHour: 20,
          postponedReminderEnabled: false,
          postponedReminderHours: 999,
          helpQueueEnabled: false,
        },
      }),
    ).toEqual({
      notificationsEnabled: false,
      notificationHour: 20,
      postponedReminderEnabled: false,
      postponedReminderHours: 24,
      helpQueueEnabled: false,
    });
  });
});
