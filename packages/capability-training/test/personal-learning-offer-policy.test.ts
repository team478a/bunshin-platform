import { describe, expect, it } from 'vitest';
import {
  personalLearningFeatures,
  personalLearningOfferPolicy,
  personalLearningPilotAllows,
} from '../src';

const enrollmentId = '00000000-0000-4000-8000-000000000001';
const settings = {
  moduleKey: 'AI_TRAINING_V1',
  personalLearningPilot: {
    enabled: true,
    enrollmentIds: [enrollmentId],
    learningFeatures: {
      conversation: true,
      multiTopic: false,
      lineLearning: true,
      extendedScope: false,
    },
  },
  trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
};

describe('personal learning offer policy', () => {
  it('defaults a missing top-level key and accepts the registered policy', () => {
    expect(personalLearningOfferPolicy(settings)).toBe('AI_SKILL_V1');
    expect(personalLearningOfferPolicy({ ...settings, learningOfferPolicy: 'AI_SKILL_V1' })).toBe(
      'AI_SKILL_V1',
    );
  });

  it.each(['', 'UNKNOWN_POLICY', 1, null, {}])(
    'fails closed for an unregistered or malformed value (%j)',
    (learningOfferPolicy) => {
      expect(personalLearningOfferPolicy({ ...settings, learningOfferPolicy })).toBeNull();
    },
  );

  it('does not change the strict pilot or feature parser when added at the settings root', () => {
    const withPolicy = { ...settings, learningOfferPolicy: 'AI_SKILL_V1' };
    expect(personalLearningPilotAllows(withPolicy, enrollmentId)).toBe(
      personalLearningPilotAllows(settings, enrollmentId),
    );
    expect(personalLearningFeatures(withPolicy)).toEqual(personalLearningFeatures(settings));
  });
});
