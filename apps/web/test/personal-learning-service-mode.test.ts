import { describe, expect, it } from 'vitest';
import {
  isPersonalLearningProgramActive,
  isPersonalLearningServiceProgram,
} from '../src/services/personal-learning-service-mode';

describe('personal learning service mode', () => {
  it('keeps an AI Training service in learning mode while its reserved program is suspended', () => {
    const program = { status: 'SUSPENDED' as const, settings: { moduleKey: 'AI_TRAINING_V1' } };
    expect(isPersonalLearningServiceProgram(program)).toBe(true);
    expect(isPersonalLearningProgramActive(program)).toBe(false);
  });

  it('does not let archived or draft programs change service mode', () => {
    expect(
      isPersonalLearningServiceProgram({
        status: 'ARCHIVED',
        settings: { moduleKey: 'AI_TRAINING_V1' },
      }),
    ).toBe(false);
    expect(
      isPersonalLearningServiceProgram({
        status: 'DRAFT',
        settings: { moduleKey: 'AI_TRAINING_V1' },
      }),
    ).toBe(false);
  });

  it('does not classify non-training programs as a learning service', () => {
    expect(
      isPersonalLearningServiceProgram({
        status: 'ACTIVE',
        settings: { moduleKey: 'AI_RESALE_V1' },
      }),
    ).toBe(false);
  });
});
