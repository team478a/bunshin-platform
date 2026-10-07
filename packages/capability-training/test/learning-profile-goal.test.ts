import { describe, expect, it } from 'vitest';
import { defineLearningGoalCandidate } from '@bunshin/application';
import {
  projectAiTrainingLearnerProfiles,
  aiTrainingGoalSemanticReference,
  defineAiTrainingExperience,
  classifyAiTrainingLearningScope,
  AI_TRAINING_LEARNING_CATALOG_VERSION,
  TRAINING_GOAL_KEYS,
  recommendedTrainingGoalKeys,
} from '../src/index';

const scope = {
  workspaceId: 'w',
  groupId: 's',
  programEnrollmentId: 'e',
  groupMembershipId: 'm',
  userId: 'u',
};
const profile = {
  ...scope,
  id: 'profile',
  assessmentVersion: AI_TRAINING_LEARNING_CATALOG_VERSION,
  dailyMinutes: 10,
  aiLevel: 'BEGINNER',
  aiUseCases: ['NOT_YET'],
  preferredTopics: ['PROMPT_IMPROVEMENT'],
  learningGoalKey: 'USE_AI_IN_DAILY_WORK',
  workContext: { secret: 'not projected' },
  workChallenges: ['WRITING_TAKES_TIME'],
  skillScores: { promptStructure: 70 },
  role: 'OFFICE',
};
const goal = {
  ...scope,
  id: 'goal',
  goalDefinitionId: null,
  status: 'ACTIVE' as const,
  title: 'legacy goal',
  dueAt: new Date('2026-10-31'),
  targetValue: 1,
};
const project = (source = profile) =>
  projectAiTrainingLearnerProfiles({ scope, profile: source, goals: [goal] });

describe('AI Package Profile read adapter', () => {
  it('reads existing profile and Goal without duplicating the source or private context', () => {
    const result = project();
    expect(result.learner.preferredDailyMinutes).toBe(10);
    expect(result.learner.currentPrimaryGoalRef?.programMemberGoalId).toBe('goal');
    expect(result.aiTraining).toMatchObject({
      aiLevel: 'BEGINNER',
      aiUseCases: ['NOT_YET'],
      preferredTopics: ['PROMPT_IMPROVEMENT'],
      learningGoalKey: 'USE_AI_IN_DAILY_WORK',
      aiExperience: 'UNKNOWN',
    });
    expect(result.aiTraining).not.toHaveProperty('workContext');
    expect(result.learner).not.toHaveProperty('aiLevel');
    expect(result.learner).not.toHaveProperty('aiExperience');
    expect(result.learner.currentPrimaryGoalRef).not.toHaveProperty('title');
    expect(result.learner.currentPrimaryGoalRef).not.toHaveProperty('dueAt');
    expect(result.learner.currentPrimaryGoalRef).not.toHaveProperty('semanticRef');
  });
  it('distinguishes missing Profile from beginner and unanswered experience from explicitly NONE', () => {
    const unknown = projectAiTrainingLearnerProfiles({ scope, profile: null, goals: [] });
    expect(unknown.aiTraining).toMatchObject({
      aiLevel: 'UNKNOWN',
      aiExperience: 'UNKNOWN',
      aiUseCases: null,
      preferredTopics: null,
      learningGoalKey: null,
    });
    expect(unknown.learner.preferredDailyMinutes).toBeNull();
    expect(project().aiTraining.aiExperience).toBe('UNKNOWN');
    expect(defineAiTrainingExperience('NONE')).not.toBe(defineAiTrainingExperience('UNKNOWN'));
    expect(defineAiTrainingExperience('SOME')).toBe('SOME');
  });
  it('treats an empty stored topic array as a known empty choice, not a missing Profile', () => {
    expect(
      project({ ...profile, aiUseCases: [], preferredTopics: [] }).aiTraining.preferredTopics,
    ).toEqual([]);
  });
  it.each(TRAINING_GOAL_KEYS)('keeps legacy Goal key %s as a semantic reference only', (key) => {
    const ref = aiTrainingGoalSemanticReference(key, AI_TRAINING_LEARNING_CATALOG_VERSION);
    expect(ref).toEqual({
      packageKey: 'AI_TRAINING',
      goalKey: key,
      version: AI_TRAINING_LEARNING_CATALOG_VERSION,
    });
    expect(ref).not.toHaveProperty('programMemberGoalId');
    expect(project({ ...profile, learningGoalKey: key }).aiTraining.learningGoalKey).toBe(key);
  });
  it.each(['SALES', 'OFFICE', 'MANAGER', 'OTHER'] as const)(
    'retains recommended Goal compatibility for %s',
    (role) => {
      for (const key of recommendedTrainingGoalKeys(role))
        expect(TRAINING_GOAL_KEYS).toContain(key);
    },
  );
  it('preserves all cancelled/achieved/paused history without changing Enrollment or source rows', () => {
    const goals = [
      goal,
      { ...goal, id: 'cancelled', status: 'CANCELLED' as const },
      { ...goal, id: 'achieved', status: 'ACHIEVED' as const },
      { ...goal, id: 'paused', status: 'PAUSED' as const },
    ];
    const result = projectAiTrainingLearnerProfiles({ scope, profile, goals });
    expect(result.goalHistory.map((ref) => ref.status)).toEqual([
      'ACTIVE',
      'CANCELLED',
      'ACHIEVED',
      'PAUSED',
    ]);
    expect(goal.dueAt.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(result.goalHistory[0]).not.toHaveProperty('endsAt');
    expect(result.goalHistory[0]).not.toHaveProperty('confirmedByUserId');
  });
  it.each([
    { assessmentVersion: 'UNKNOWN_VERSION' },
    { dailyMinutes: 20 },
    { aiLevel: 'NONE' },
    { aiUseCases: ['UNKNOWN_KEY'] },
    { preferredTopics: ['UNKNOWN_KEY'] },
    { learningGoalKey: 'FREE_TEXT' },
    { aiUseCases: { all: 'everything' } },
    { workspaceId: 'other' },
    { groupId: 'other' },
    { programEnrollmentId: 'other' },
    { groupMembershipId: 'other' },
    { userId: 'other' },
  ])('rejects incompatible or cross-scope source %j', (patch) => {
    expect(() => project({ ...profile, ...patch } as typeof profile)).toThrow();
  });
  it('rejects multiple active Goals without modifying legacy storage', () => {
    expect(() =>
      projectAiTrainingLearnerProfiles({
        scope,
        profile,
        goals: [goal, { ...goal, id: 'second' }],
      }),
    ).toThrow();
  });
  it('copies and freezes projections rather than retaining mutable input arrays', () => {
    const result = project();
    expect(result.aiTraining.preferredTopics).not.toBe(profile.preferredTopics);
    expect(Object.isFrozen(result.aiTraining.preferredTopics)).toBe(true);
    expect(Object.isFrozen(result.goalHistory)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each(['画像を作って', 'メールを自動化して', '集客をどうしたらいい？', '今日の天気'])(
    'does not transform a P1-A result into a learning Goal for %s',
    (text) => {
      expect(() =>
        defineLearningGoalCandidate({
          kind: 'CANDIDATE',
          scope,
          semanticRef: aiTrainingGoalSemanticReference(
            'USE_AI_IN_DAILY_WORK',
            AI_TRAINING_LEARNING_CATALOG_VERSION,
          ),
          scopeDecision: classifyAiTrainingLearningScope({ text }),
        }),
      ).toThrow();
    },
  );
  it('validates a supplied learning candidate but never generates or confirms it', () => {
    const candidate = defineLearningGoalCandidate({
      kind: 'CANDIDATE',
      scope,
      semanticRef: aiTrainingGoalSemanticReference(
        'USE_AI_IN_DAILY_WORK',
        AI_TRAINING_LEARNING_CATALOG_VERSION,
      ),
      scopeDecision: classifyAiTrainingLearningScope({ text: 'ChatGPTを勉強したい' }),
    });
    expect(candidate.kind).toBe('CANDIDATE');
    expect(candidate).not.toHaveProperty('status');
    expect(candidate).not.toHaveProperty('confirmedByUserId');
  });
  it('rejects unknown Goal semantic version and experience values', () => {
    expect(() =>
      aiTrainingGoalSemanticReference('UNKNOWN', AI_TRAINING_LEARNING_CATALOG_VERSION),
    ).toThrow();
    expect(() => aiTrainingGoalSemanticReference('USE_AI_IN_DAILY_WORK', 'V2')).toThrow();
    expect(() => defineAiTrainingExperience('BEGINNER' as 'NONE')).toThrow();
  });
});
