import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const evaluator = readFileSync(
  new URL('../src/providers/openai-training-answer-evaluator.ts', import.meta.url),
  'utf8',
);
const evaluationHttp = readFileSync(
  new URL('../src/http/ai-training-evaluation.ts', import.meta.url),
  'utf8',
);
const evaluationJobHandler = readFileSync(
  new URL('../src/jobs/training-answer-evaluation-job-handler.ts', import.meta.url),
  'utf8',
);

describe('AI training skill evaluation boundary', () => {
  it('uses AI for structured evidence and domain rules for the final decision', () => {
    expect(evaluator).toContain('skills: skillScoresSchema');
    expect(evaluator).toContain('recommendedNextSkill: z.enum(TRAINING_SKILL_KEYS)');
    expect(evaluator).toContain('finalizeTrainingSkillEvaluation');
  });

  it('projects only the scoped participant state and records explainable event metadata', () => {
    expect(evaluationHttp).toContain('workspaceId: service.workspaceId');
    expect(evaluationHttp).toContain('groupId: service.serviceId');
    expect(evaluationHttp).toContain('programEnrollmentId: enrollment.id');
    expect(evaluationHttp).toContain('userId: actor.userId');
    expect(evaluationJobHandler).toContain('mergeTrainingSkillScores');
    expect(evaluationJobHandler).toContain(
      'evaluatedSkillKeys: evaluated.evaluation.evaluatedSkillKeys',
    );
    expect(evaluationJobHandler).toContain(
      'recommendedNextSkill: evaluated.evaluation.recommendedNextSkill',
    );
    expect(evaluationJobHandler).toContain(
      'evaluationRuleVersion: evaluated.evaluation.evaluationRuleVersion',
    );
  });
});
