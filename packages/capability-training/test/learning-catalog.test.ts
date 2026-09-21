import { describe, expect, it } from 'vitest';
import {
  AI_TRAINING_LEARNING_CATALOG_VERSION,
  TRAINING_GOALS,
  TRAINING_TOPICS,
  findTrainingGoal,
  recommendedTrainingGoalKeys,
} from '../src/index';

describe('AI training learning catalog', () => {
  it('keeps stable versioned keys for persisted assessment answers', () => {
    expect(AI_TRAINING_LEARNING_CATALOG_VERSION).toBe('AI_TRAINING_CATALOG_V1');
    expect(new Set(TRAINING_TOPICS.map(({ key }) => key)).size).toBe(TRAINING_TOPICS.length);
    expect(new Set(TRAINING_GOALS.map(({ key }) => key)).size).toBe(TRAINING_GOALS.length);
  });

  it('returns role-relevant goals while retaining a common daily-work goal', () => {
    expect(recommendedTrainingGoalKeys('SALES')).toContain('CREATE_SALES_EMAIL');
    expect(recommendedTrainingGoalKeys('OFFICE')).toContain('ORGANIZE_MEETING_MINUTES');
    expect(recommendedTrainingGoalKeys('MANAGER')).toContain('IMPROVE_WORK_WITH_AI');
    expect(recommendedTrainingGoalKeys('OTHER')).toEqual(['USE_AI_IN_DAILY_WORK']);
  });

  it('resolves a canonical goal title instead of accepting a client supplied title', () => {
    expect(findTrainingGoal('DRAFT_PROPOSAL')?.label).toBe('提案書の下書きをAIで作れる');
  });
});
