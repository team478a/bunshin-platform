import { describe, expect, it } from 'vitest';
import {
  canCreatePersonalLearningTopic,
  personaItemsForAi,
  personalLearningTopicLimit,
} from '../src/personal-learning-topics';

describe('dynamic learning topic policy', () => {
  it('keeps multiTopic OFF by default and limits active themes to one', () => {
    expect(personalLearningTopicLimit({ personalLearningPilot: { enabled: true } })).toBe(1);
    expect(canCreatePersonalLearningTopic({}, 0)).toBe(true);
    expect(canCreatePersonalLearningTopic({}, 1)).toBe(false);
  });

  it('allows at most three active topics only when explicitly enabled', () => {
    const settings = {
      personalLearningPilot: {
        learningFeatures: {
          conversation: true,
          multiTopic: true,
          lineLearning: false,
          extendedScope: false,
        },
      },
    };
    expect(personalLearningTopicLimit(settings)).toBe(3);
    expect(canCreatePersonalLearningTopic(settings, 2)).toBe(true);
    expect(canCreatePersonalLearningTopic(settings, 3)).toBe(false);
  });
});

describe('personal persona context', () => {
  it('never sends rejected guesses and marks all other persona facts with their certainty', () => {
    expect(
      personaItemsForAi([
        { id: 'a', status: 'UNCONFIRMED' as const },
        { id: 'b', status: 'CONFIRMED' as const },
        { id: 'c', status: 'REJECTED' as const },
      ]),
    ).toEqual([
      { id: 'a', status: 'UNCONFIRMED', epistemicStatus: 'UNCONFIRMED_GUESS' },
      { id: 'b', status: 'CONFIRMED', epistemicStatus: 'LEARNER_CONFIRMED' },
    ]);
  });
});
