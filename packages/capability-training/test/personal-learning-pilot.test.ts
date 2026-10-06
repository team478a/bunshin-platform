import { describe, it, expect } from 'vitest';
import {
  isPersonalLearningPilotProgram,
  personalLearningPilotAllows,
  personalLearningPilotProfilePreparationAllows,
} from '../src';
const id = '00000000-0000-4000-8000-000000000001';
const settings = {
  moduleKey: 'AI_TRAINING_V1',
  personalLearningPilot: { enabled: true, enrollmentIds: [id] },
  trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
};
describe('restricted Personal Learning pilot', () => {
  it('prepares only disabled, bounded dedicated programs without changing or enabling settings', () => {
    const value = { ...settings, personalLearningPilot: { enabled: false, enrollmentIds: [id] } };
    const before = JSON.stringify(value);
    expect(personalLearningPilotProfilePreparationAllows(value, id)).toBe(true);
    expect(personalLearningPilotAllows(value, id)).toBe(false);
    expect(JSON.stringify(value)).toBe(before);
    expect(personalLearningPilotProfilePreparationAllows(settings, id)).toBe(false);
    expect(
      personalLearningPilotProfilePreparationAllows(value, '00000000-0000-4000-8000-000000000002'),
    ).toBe(false);
    expect(
      personalLearningPilotProfilePreparationAllows({ ...value, trainingOperations: {} }, id),
    ).toBe(false);
    expect(
      personalLearningPilotProfilePreparationAllows(
        { ...value, personalLearningPilot: { enabled: false, enrollmentIds: Array(6).fill(id) } },
        id,
      ),
    ).toBe(false);
    expect(
      personalLearningPilotProfilePreparationAllows({ ...value, personalLearningPilot: null }, id),
    ).toBe(false);
  });
  it('requires dedicated opt-in and exact enrollment', () => {
    expect(personalLearningPilotAllows(settings, id)).toBe(true);
    expect(personalLearningPilotAllows(settings, '00000000-0000-4000-8000-000000000002')).toBe(
      false,
    );
    expect(personalLearningPilotAllows({ moduleKey: 'AI_TRAINING_V1' }, id)).toBe(false);
  });
  it('never permits default notifications or more than five participants', () => {
    expect(personalLearningPilotAllows({ ...settings, trainingOperations: {} }, id)).toBe(false);
    expect(
      personalLearningPilotAllows(
        { ...settings, personalLearningPilot: { enabled: true, enrollmentIds: Array(6).fill(id) } },
        id,
      ),
    ).toBe(false);
    expect(
      personalLearningPilotAllows(
        { ...settings, personalLearningPilot: { enabled: true, enrollmentIds: [id, id] } },
        id,
      ),
    ).toBe(false);
  });
  it.each([null, {}, { enabled: false }, { enabled: true, enrollmentIds: [id], extra: true }])(
    'reserves malformed/disabled programs without fallback (%j)',
    (pilot) => {
      const value = { ...settings, personalLearningPilot: pilot };
      expect(isPersonalLearningPilotProgram(value)).toBe(true);
      expect(personalLearningPilotAllows(value, id)).toBe(false);
    },
  );
  it('leaves old V1 programs unreserved', () => {
    expect(isPersonalLearningPilotProgram({ moduleKey: 'AI_TRAINING_V1' })).toBe(false);
  });
});
