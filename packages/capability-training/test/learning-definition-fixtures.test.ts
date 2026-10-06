import { describe, expect, it } from 'vitest';
import {
  defineLearningGoalCandidate,
  defineConfirmedLearningGoalReference,
  projectProgramMemberGoalReference,
  definePersonalLearningPlan,
  PERSONAL_LEARNING_PLAN_CONTRACT_VERSION,
} from '@bunshin/application';
import {
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  AI_TRAINING_DEFINITION_FIXTURE_VERSION,
  getAiTrainingMissionQuality,
  AI_TRAINING_MISSION_QUALITY_VERSION,
  TRAINING_SKILL_KEYS,
  AI_TRAINING_SKILL_RULE_VERSION,
  classifyAiTrainingLearningScope,
  aiTrainingGoalSemanticReference,
  AI_TRAINING_LEARNING_CATALOG_VERSION,
} from '../src/index';

describe('AI Learning Definition review fixtures', () => {
  it('contains exactly three structures, not a prebuilt content library', () => {
    expect(
      AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((fixture) => fixture.reference.definitionKey),
    ).toEqual(['PROMPT_STRUCTURE', 'CONTEXT_SETTING', 'CONSTRAINT_SETTING']);
    expect(Object.isFrozen(AI_TRAINING_LEARNING_DEFINITION_FIXTURES)).toBe(true);
  });
  it.each(AI_TRAINING_LEARNING_DEFINITION_FIXTURES)(
    'pins %j to existing quality and skills, not generated personalized content',
    (fixture) => {
      const quality = getAiTrainingMissionQuality(fixture.legacyMissionRef.actionKey)!;
      expect(fixture.reference.version).toBe(AI_TRAINING_DEFINITION_FIXTURE_VERSION);
      expect(fixture.learningObjective).toBe(quality.learningObjective);
      expect(fixture.commonMistakes).toEqual(quality.commonMistakes);
      expect(fixture.evaluationRubricRef.version).toBe(AI_TRAINING_MISSION_QUALITY_VERSION);
      expect(fixture.evaluationRubricRef.rubricKey).toBe(quality.key);
      for (const skill of fixture.targetSkillRefs) {
        expect(TRAINING_SKILL_KEYS).toContain(skill.skillKey);
        expect(quality.skillKeys).toContain(skill.skillKey);
        expect(skill.version).toBe(AI_TRAINING_SKILL_RULE_VERSION);
      }
      expect(fixture.coreConcepts.length).toBeGreaterThan(0);
      expect(fixture.safetyBoundary.length).toBeGreaterThan(0);
      expect(fixture.practicePattern).toContain('Prompt');
      expect(fixture).not.toHaveProperty('task');
      expect(fixture).not.toHaveProperty('hint');
      expect(fixture).not.toHaveProperty('businessScenario');
      expect(fixture).not.toHaveProperty('content');
      expect(Object.isFrozen(fixture.commonMistakes)).toBe(true);
      expect(Object.isFrozen(fixture.targetSkillRefs[0])).toBe(true);
    },
  );
  it('keeps Skill, Definition and Mission as separate identities', () => {
    const [structure, context, constraint] = AI_TRAINING_LEARNING_DEFINITION_FIXTURES;
    expect(structure?.reference.definitionKey).not.toBe(structure?.targetSkillRefs[0]?.skillKey);
    expect(structure?.legacyMissionRef.actionKey).toBe(context?.legacyMissionRef.actionKey);
    expect(context?.reference.definitionKey).not.toBe(structure?.reference.definitionKey);
    expect(context?.prerequisites).toEqual([structure?.reference]);
    expect(constraint?.prerequisites).toEqual([context?.reference]);
  });
  it('builds only a reference path around a supplied confirmed Goal and Plan receipt', () => {
    const scope = {
      workspaceId: 'w',
      groupId: 's',
      programEnrollmentId: 'e',
      groupMembershipId: 'm',
      userId: 'u',
    };
    const semanticRef = aiTrainingGoalSemanticReference(
      'USE_AI_IN_DAILY_WORK',
      AI_TRAINING_LEARNING_CATALOG_VERSION,
    );
    const candidate = defineLearningGoalCandidate({
      kind: 'CANDIDATE',
      scope,
      semanticRef,
      scopeDecision: classifyAiTrainingLearningScope({ text: 'プロンプトを上手くなりたい' }),
    });
    const reference = projectProgramMemberGoalReference(scope, {
      ...scope,
      id: 'goal',
      goalDefinitionId: null,
      status: 'ACTIVE',
    });
    const goal = defineConfirmedLearningGoalReference({
      candidate,
      reference,
      confirmation: {
        state: 'LEARNER_CONFIRMED',
        programMemberGoalId: 'goal',
        confirmedByUserId: 'u',
        semanticRef,
      },
    });
    const plan = definePersonalLearningPlan({
      contractVersion: PERSONAL_LEARNING_PLAN_CONTRACT_VERSION,
      ruleVersion: 'FIXTURE_PLAN_V1',
      planId: 'plan',
      revision: 1,
      previousRevision: null,
      revisionReason: 'INITIAL',
      scope,
      goal,
      steps: AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((fixture) => ({
        definition: fixture.reference,
        prerequisites: fixture.prerequisites,
        selectionReason: 'GOAL_ALIGNMENT',
      })),
      status: 'CONFIRMED',
      confirmation: { planId: 'plan', revision: 1, confirmedByUserId: 'u' },
    });
    expect(plan.steps).toHaveLength(3);
    expect(JSON.stringify(plan)).not.toContain('coreConcepts');
    expect(JSON.stringify(plan)).not.toContain('practicePattern');
    expect(plan.steps[2]?.definition.version).toBe(AI_TRAINING_DEFINITION_FIXTURE_VERSION);
    expect(getAiTrainingMissionQuality('PROMPT_BASIC')?.learningObjective).toBe(
      AI_TRAINING_LEARNING_DEFINITION_FIXTURES[0]?.learningObjective,
    );
  });
});
