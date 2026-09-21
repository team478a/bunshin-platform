import { describe, expect, it } from 'vitest';
import {
  finalizeTrainingSkillEvaluation,
  mergeTrainingSkillScores,
  trainingSkillBottleneckKey,
  type TrainingSkillScores,
} from '../src/index';

const scores = (overrides: Partial<TrainingSkillScores> = {}): TrainingSkillScores => ({
  promptStructure: 80,
  contextSetting: 75,
  constraintSetting: 70,
  outputControl: 65,
  businessApplication: 72,
  revisionSkill: 68,
  ...overrides,
});

describe('training skill evaluation domain rules', () => {
  it('passes only when understanding and every evaluated skill meet the threshold', () => {
    const evaluation = finalizeTrainingSkillEvaluation(
      {
        understanding: 82,
        skills: scores(),
        strengths: ['目的が明確です'],
        weaknesses: [],
        proposedNextSkill: 'businessApplication',
      },
      ['promptStructure', 'contextSetting'],
    );

    expect(evaluation.result).toBe('PASS');
    expect(evaluation.recommendedNextSkill).toBe('businessApplication');
  });

  it('overrides the AI recommendation with the weakest evaluated skill for review', () => {
    const evaluation = finalizeTrainingSkillEvaluation(
      {
        understanding: 78,
        skills: scores({ contextSetting: 42 }),
        strengths: ['依頼が具体的です'],
        weaknesses: ['背景が不足しています'],
        proposedNextSkill: 'outputControl',
      },
      ['promptStructure', 'contextSetting'],
    );

    expect(evaluation.result).toBe('REVIEW');
    expect(evaluation.recommendedNextSkill).toBe('contextSetting');
    expect(evaluation.nextRecommendation).toContain('背景の伝え方');
  });

  it('projects only evaluated skills and creates a stable bottleneck key', () => {
    const evaluation = finalizeTrainingSkillEvaluation(
      {
        understanding: 55,
        skills: scores({ constraintSetting: 45 }),
        strengths: [],
        weaknesses: ['条件が不足しています'],
        proposedNextSkill: 'revisionSkill',
      },
      ['constraintSetting'],
    );

    expect(mergeTrainingSkillScores({ promptStructure: 90 }, evaluation)).toEqual({
      promptStructure: 90,
      constraintSetting: 45,
    });
    expect(trainingSkillBottleneckKey('constraintSetting')).toBe(
      'TRAINING_SKILL_CONSTRAINT_SETTING',
    );
  });
});
