import { describe, expect, it } from 'vitest';
import { createPersonalLearningProgramDefinition } from '../src/personal-learning-program-definition';
import {
  createAiTrainingV1Definition,
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
} from '../src/index';

describe('open-ended Personal Learning runtime shell', () => {
  it('has no fixed learning deadline or finished-product mode', () => {
    const definition = createPersonalLearningProgramDefinition();
    expect(definition.duration).toEqual({ type: 'OPEN_ENDED' });
    expect(definition.supportModes).toEqual(['GUIDED']);
    expect(definition.participation).toBe('INVITATION_ONLY');
    expect(definition.resultDefinitions).toEqual([]);
  });
  it('references only the existing Missions for the three review Definitions', () => {
    const definition = createPersonalLearningProgramDefinition();
    expect(definition.missions.map((m) => m.key)).toEqual(['PROMPT_BASIC', 'PROMPT_CONDITION']);
    for (const fixture of AI_TRAINING_LEARNING_DEFINITION_FIXTURES)
      expect(definition.missions.some((m) => m.key === fixture.legacyMissionRef.actionKey)).toBe(
        true,
      );
    expect(AI_TRAINING_LEARNING_DEFINITION_FIXTURES).toHaveLength(3);
  });
  it('does not modify the published thirty-day V1 definition', () => {
    const before = createAiTrainingV1Definition();
    createPersonalLearningProgramDefinition();
    expect(createAiTrainingV1Definition()).toEqual(before);
    expect(before.duration).toEqual({ type: 'FIXED_DAYS', days: 30 });
  });
});
