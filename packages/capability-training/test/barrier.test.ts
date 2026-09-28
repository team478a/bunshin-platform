import { describe, expect, it } from 'vitest';
import { defineNextActionDecision } from '@bunshin/application';
import {
  applyTrainingBarrierAdjustment,
  getAiTrainingMissionQuality,
  renderAiTrainingAction,
  resolveTrainingBarrierAdjustment,
  restoreTrainingStandardVariant,
} from '../src/index';

const quality = getAiTrainingMissionQuality('SALES_EMAIL')!;
const standard = renderAiTrainingAction(
  defineNextActionDecision({
    actionKey: 'SALES_EMAIL',
    mode: 'WORK',
    reasonCode: 'LEARNING_GOAL_PRIORITY',
    target: null,
    ruleVersion: 'TEST',
    reevaluateAt: null,
  }),
  {
    key: 'SALES_EMAIL',
    routeKey: 'PERSONALIZED',
    phaseKey: 'PRACTICE',
    title: '営業メールを作る',
    estimatedMinutes: 10,
    quality,
  },
  { difficulty: 'STANDARD', reasonCode: 'PRACTICE_STANDARD' },
);

describe('AI training barrier adjustment', () => {
  it('maps busy to a short mission and keeps the learning objective', () => {
    expect(resolveTrainingBarrierAdjustment('BUSY').missionVariant).toBe('SHORT');

    const adjusted = applyTrainingBarrierAdjustment(standard, 'BUSY');

    expect(adjusted.missionVariant).toBe('SHORT');
    expect(adjusted.estimatedMinutes).toBe(1);
    expect(adjusted.learningObjective).toBe(standard.learningObjective);
    expect(adjusted.successCriteria).toHaveLength(1);
    expect(adjusted.evaluationCriteria).toHaveLength(1);
  });

  it.each(['TOO_DIFFICULT', 'DONT_KNOW_HOW'] as const)(
    'maps %s to an easy short mission',
    (reason) => {
      const adjusted = applyTrainingBarrierAdjustment(standard, reason);
      expect(adjusted.missionVariant).toBe('SHORT');
      expect(adjusted.difficulty).toBe('EASY');
    },
  );

  it.each(['NOT_RELEVANT', 'LOW_VALUE'] as const)(
    'recommends goal review for %s without replacing the mission objective',
    (reason) => {
      const adjusted = applyTrainingBarrierAdjustment(standard, reason);
      expect(adjusted.missionVariant).toBe('STANDARD');
      expect(adjusted.goalReviewRecommended).toBe(true);
      expect(adjusted.learningObjective).toBe(standard.learningObjective);
    },
  );

  it('restores the exact standard task after using the short variant', () => {
    const short = applyTrainingBarrierAdjustment(standard, 'BUSY');
    const restored = restoreTrainingStandardVariant(short);

    expect(restored?.missionVariant).toBe('STANDARD');
    expect(restored?.title).toBe(standard.title);
    expect(restored?.task).toBe(standard.task);
    expect(restored?.successCriteria).toEqual(standard.successCriteria);
  });
});
