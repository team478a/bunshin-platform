import { describe, expect, it } from 'vitest';
import {
  AiTrainingV1Policy,
  AI_TRAINING_PERSONALIZATION_VERSION,
  getAiTrainingMissionQuality,
  renderPersonalizedAiTrainingAction,
  resolveTrainingMissionDifficulty,
  RuleBasedTrainingMissionPersonalizer,
  type AiTrainingRuntimeCandidate,
} from '../src';

const now = new Date('2026-09-28T00:00:00.000Z');
const quality = getAiTrainingMissionQuality('SALES_EMAIL')!;
const mission = {
  key: 'SALES_EMAIL' as const,
  routeKey: 'PERSONALIZED',
  phaseKey: 'PRACTICE' as const,
  title: quality.title,
  estimatedMinutes: quality.estimatedMinutes,
  quality,
};
const candidate = (role: 'SALES' | 'OFFICE', target: string): AiTrainingRuntimeCandidate => ({
  workspaceId: 'workspace',
  groupId: 'group',
  programEnrollmentId: `enrollment-${role}`,
  programTemplateVersionId: 'version',
  participantUserId: `user-${role}`,
  profileUpdatedAt: new Date('2026-09-28T00:00:00Z'),
  profileId: 'profile-a',
  settings: { moduleKey: 'AI_TRAINING_V1', pauseAfterDays: 7, routeKey: 'PERSONALIZED' },
  profile: {
    role,
    aiLevel: 'BEGINNER',
    learningGoalKey: 'CREATE_SALES_EMAIL',
    needsReview: false,
    recentSuccesses: 0,
    recentFailures: 0,
    streak: 0,
    skillScores: {},
    workContext: {
      schemaVersion: 1,
      workDescription: role === 'SALES' ? '法人営業をしています' : '総務事務をしています',
      timeConsumingTask: target,
      aiImprovementTarget: target,
      deviceType: 'PC',
    },
  },
  currentPhase: 'PRACTICE',
  completedMissionKeys: [],
  completedMissionCount: 0,
  lastMissionKey: null,
  bottleneckKey: null,
  activityBaselineAt: now,
  lastActionAt: now,
  activeWaitUntil: null,
  progressRevision: null,
  workUseCount: 0,
  missions: [mission],
});

const decision = {
  actionKey: 'SALES_EMAIL',
  mode: 'WORK' as const,
  reasonCode: 'LEARNING_GOAL_PRIORITY',
  target: null,
  ruleVersion: 'AI_TRAINING_V1_RULES_3',
  reevaluateAt: null,
};

describe('AI training mission personalization', () => {
  it('changes the scenario by role and work context without changing mission or criteria', async () => {
    const sales = candidate('SALES', '商談後のフォローメール');
    const office = candidate('OFFICE', '提出期限変更の社内連絡');
    const personalizer = new RuleBasedTrainingMissionPersonalizer();
    const salesDisplay = await renderPersonalizedAiTrainingAction({
      decision,
      mission,
      candidate: sales,
      personalizer,
      difficultyDecision: resolveTrainingMissionDifficulty(
        { ...sales.profile, ...sales, now, pauseAfterDays: 7 },
        decision,
        mission,
      ),
    });
    const officeDisplay = await renderPersonalizedAiTrainingAction({
      decision,
      mission,
      candidate: office,
      personalizer,
      difficultyDecision: { difficulty: 'STANDARD', reasonCode: 'PRACTICE_STANDARD' },
    });

    expect(salesDisplay.businessScenario).toContain('商談後のフォローメール');
    expect(officeDisplay.businessScenario).toContain('提出期限変更の社内連絡');
    expect(salesDisplay.businessScenario).not.toBe(officeDisplay.businessScenario);
    expect(salesDisplay.actionKey).toBe(officeDisplay.actionKey);
    expect(salesDisplay.learningObjective).toBe(quality.learningObjective);
    expect(salesDisplay.successCriteria).toEqual(quality.successCriteria);
    expect(salesDisplay.personalizationVersion).toBe(AI_TRAINING_PERSONALIZATION_VERSION);
  });

  it('falls back to the fixed mission when personalization fails', async () => {
    const display = await renderPersonalizedAiTrainingAction({
      decision,
      mission,
      candidate: candidate('SALES', '商談後のメール'),
      personalizer: { personalize: () => Promise.reject(new Error('provider unavailable')) },
      difficultyDecision: { difficulty: 'STANDARD', reasonCode: 'PRACTICE_STANDARD' },
    });

    expect(display.personalizationStatus).toBe('FIXED_FALLBACK');
    expect(display.businessScenario).toBe(quality.businessScenario);
    expect(display.task).toBe(quality.task);
    expect(display.actionKey).toBe('SALES_EMAIL');
  });

  it('uses work results as a selection reason without changing skill state', () => {
    const policy = new AiTrainingV1Policy();
    const base = candidate('SALES', '商談後のメール');
    const result = policy.evaluate({
      now,
      ...base.profile,
      currentPhase: 'PRACTICE',
      completedMissionKeys: [
        'AI_BASIC',
        'CHATGPT_BASIC',
        'PROMPT_BASIC',
        'PROMPT_CONDITION',
        'PROMPT_FORMAT',
      ],
      completedMissionCount: 5,
      lastMissionKey: 'PROMPT_FORMAT',
      bottleneckKey: null,
      activityBaselineAt: now,
      lastActionAt: now,
      pauseAfterDays: 7,
      activeWaitUntil: null,
      workUseCount: 1,
    });

    expect(result.actionKey).toBe('SALES_EMAIL');
    expect(result.reasonCode).toBe('WORK_USAGE_CONFIRMED_NEXT_PRACTICE');
    expect(base.profile.skillScores).toEqual({});
  });
});
