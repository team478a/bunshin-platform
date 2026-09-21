import { describe, expect, it } from 'vitest';
import { AiTrainingV1Policy, getAiTrainingMissionQuality } from '../src/index';
import {
  AiTrainingParticipantService,
  parseAiTrainingActionDisplay,
  resolveTrainingMissionDifficulty,
  type AiTrainingParticipantState,
  type AiTrainingRuntimeCandidate,
  type AiTrainingRuntimeRepository,
  type TrainingRuntimeError,
} from '../src/runtime';

const now = new Date('2026-09-21T00:00:00.000Z');
const input = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  actorUserId: '33333333-3333-4333-8333-333333333333',
  programEnrollmentId: '44444444-4444-4444-8444-444444444444',
  now,
};

const baseState = (): AiTrainingParticipantState => ({
  enrollmentId: input.programEnrollmentId,
  programName: 'AI研修30日',
  enrollmentStatus: 'ACTIVE',
  startsAt: now,
  endsAt: null,
  profile: {
    role: 'SALES',
    aiLevel: 'BEGINNER',
    aiUseCases: ['EMAIL'],
    workChallenges: ['WRITING_TAKES_TIME'],
    preferredTopics: ['SALES_EMAIL'],
    dailyMinutes: 10,
    learningGoalKey: 'CREATE_SALES_EMAIL',
  },
  goal: { title: '営業メールをAIで作れる' },
  action: null,
});

const candidate = (): AiTrainingRuntimeCandidate => ({
  workspaceId: input.workspaceId,
  groupId: input.groupId,
  programEnrollmentId: input.programEnrollmentId,
  programTemplateVersionId: '55555555-5555-4555-8555-555555555555',
  participantUserId: input.actorUserId,
  settings: { moduleKey: 'AI_TRAINING_V1', pauseAfterDays: 7, routeKey: 'PERSONALIZED' },
  profile: {
    role: 'SALES',
    aiLevel: 'BEGINNER',
    learningGoalKey: 'CREATE_SALES_EMAIL',
    needsReview: false,
    recentSuccesses: 0,
    recentFailures: 0,
    streak: 0,
    skillScores: {},
  },
  currentPhase: 'FOUNDATION',
  completedMissionKeys: [],
  completedMissionCount: 0,
  lastMissionKey: null,
  bottleneckKey: null,
  activityBaselineAt: now,
  lastActionAt: now,
  activeWaitUntil: null,
  progressRevision: null,
  missions: [
    {
      key: 'AI_BASIC',
      routeKey: 'PERSONALIZED',
      phaseKey: 'FOUNDATION',
      title: 'AIの基本を知る',
      estimatedMinutes: 5,
      quality: getAiTrainingMissionQuality('AI_BASIC')!,
    },
  ],
});

class MemoryRepository implements AiTrainingRuntimeRepository {
  state = baseState();
  runtimeCandidate: AiTrainingRuntimeCandidate | null = candidate();
  writes = 0;

  findState() {
    return Promise.resolve(this.state);
  }

  findCandidate() {
    return Promise.resolve(this.runtimeCandidate);
  }

  persistDecision(value: Parameters<AiTrainingRuntimeRepository['persistDecision']>[0]) {
    this.writes += 1;
    this.state = {
      ...this.state,
      action: {
        id: '66666666-6666-4666-8666-666666666666',
        sequence: 1,
        actionKey: value.mission.key,
        mode: value.decision.mode,
        status: 'PRESENTED',
        display: value.displaySnapshot,
        presentedAt: value.evaluatedAt,
        reevaluateAt: value.decision.reevaluateAt,
        submission: null,
      },
    };
    return Promise.resolve('APPLIED' as const);
  }
}

describe('AiTrainingParticipantService', () => {
  it('returns setup-required state without selecting a mission when the profile is absent', async () => {
    const repository = new MemoryRepository();
    repository.state = { ...baseState(), profile: null };

    const state = await new AiTrainingParticipantService(
      repository,
      new AiTrainingV1Policy(),
    ).current(input);

    expect(state.profile).toBeNull();
    expect(repository.writes).toBe(0);
  });

  it('selects and persists a mission from the published candidate list', async () => {
    const repository = new MemoryRepository();

    const state = await new AiTrainingParticipantService(
      repository,
      new AiTrainingV1Policy(),
    ).current(input);

    expect(state.action?.actionKey).toBe('AI_BASIC');
    expect(state.action?.display.reasonCode).toBe('AI_FOUNDATION_NOT_COMPLETED');
    expect(state.action?.display.task).toContain('AIに任せたい作業');
    expect(state.action?.display.learningObjective).toContain('AIに任せる作業');
    expect(state.action?.display.businessScenario).toContain('今日の仕事');
    expect(state.action?.display.successCriteria).toContain('作業内容が具体的');
    expect(state.action?.display.schemaVersion).toBe(3);
    expect(state.action?.display.difficulty).toBe('EASY');
    expect(state.action?.display.difficultyReasonCode).toBe('FOUNDATION_EASY');
    expect(repository.writes).toBe(1);
  });

  it('reuses the active assignment instead of creating a duplicate', async () => {
    const repository = new MemoryRepository();
    await new AiTrainingParticipantService(repository, new AiTrainingV1Policy()).current(input);
    await new AiTrainingParticipantService(repository, new AiTrainingV1Policy()).current(input);

    expect(repository.writes).toBe(1);
  });

  it('rejects a policy decision that is absent from the published mission list', async () => {
    const repository = new MemoryRepository();
    repository.runtimeCandidate = { ...candidate(), missions: [] };

    await expect(
      new AiTrainingParticipantService(repository, new AiTrainingV1Policy()).current(input),
    ).rejects.toEqual(
      expect.objectContaining<Partial<TrainingRuntimeError>>({ code: 'CONFIGURATION_ERROR' }),
    );
    expect(repository.writes).toBe(0);
  });
});

describe('AI training adaptive difficulty', () => {
  const salesMission = {
    key: 'SALES_EMAIL' as const,
    routeKey: 'PERSONALIZED',
    phaseKey: 'PRACTICE' as const,
    title: '営業メールを作る',
    estimatedMinutes: 10,
    quality: getAiTrainingMissionQuality('SALES_EMAIL')!,
  };

  it('uses standard difficulty until relevant skills are consistently strong', () => {
    const context = {
      now,
      role: 'SALES' as const,
      aiLevel: 'INTERMEDIATE' as const,
      learningGoalKey: 'CREATE_SALES_EMAIL' as const,
      currentPhase: 'PRACTICE' as const,
      completedMissionKeys: [],
      completedMissionCount: 5,
      recentSuccesses: 2,
      recentFailures: 0,
      needsReview: false,
      lastMissionKey: 'PROMPT_FORMAT',
      streak: 2,
      bottleneckKey: null,
      skillScores: {
        businessApplication: 90,
        contextSetting: 90,
        constraintSetting: 90,
        outputControl: 90,
      },
      activityBaselineAt: now,
      lastActionAt: now,
      pauseAfterDays: 7,
      activeWaitUntil: null,
    };
    const decision = new AiTrainingV1Policy().evaluate({
      ...context,
      completedMissionKeys: [
        'AI_BASIC',
        'CHATGPT_BASIC',
        'PROMPT_BASIC',
        'PROMPT_CONDITION',
        'PROMPT_FORMAT',
      ],
    });

    expect(resolveTrainingMissionDifficulty(context, decision, salesMission)).toEqual({
      difficulty: 'STANDARD',
      reasonCode: 'PRACTICE_STANDARD',
    });
  });

  it('promotes to challenge only after consecutive success and high relevant skill scores', () => {
    const context = {
      now,
      role: 'SALES' as const,
      aiLevel: 'INTERMEDIATE' as const,
      learningGoalKey: 'CREATE_SALES_EMAIL' as const,
      currentPhase: 'PRACTICE' as const,
      completedMissionKeys: [],
      completedMissionCount: 8,
      recentSuccesses: 3,
      recentFailures: 0,
      needsReview: false,
      lastMissionKey: 'SALES_HEARING',
      streak: 3,
      bottleneckKey: null,
      skillScores: {
        businessApplication: 85,
        contextSetting: 82,
        constraintSetting: 88,
        outputControl: 81,
      },
      activityBaselineAt: now,
      lastActionAt: now,
      pauseAfterDays: 7,
      activeWaitUntil: null,
    };
    const decision = new AiTrainingV1Policy().evaluate({
      ...context,
      completedMissionKeys: [
        'AI_BASIC',
        'CHATGPT_BASIC',
        'PROMPT_BASIC',
        'PROMPT_CONDITION',
        'PROMPT_FORMAT',
      ],
    });

    expect(resolveTrainingMissionDifficulty(context, decision, salesMission)).toEqual({
      difficulty: 'CHALLENGE',
      reasonCode: 'STABLE_HIGH_SCORE_CHALLENGE',
    });
  });
});

describe('AI training display snapshot compatibility', () => {
  it('restores the fixed task for assignments created before task text was added', () => {
    const display = parseAiTrainingActionDisplay({
      schemaVersion: 1,
      actionKey: 'AI_BASIC',
      mode: 'WORK',
      reasonCode: 'AI_FOUNDATION_NOT_COMPLETED',
      title: 'AIの基本を知る',
      reason: '最初の課題です。',
      instructions: ['回答を作る'],
      estimatedMinutes: 5,
      renderer: 'TRAINING_FIXED_V1',
    });

    expect(display?.task).toContain('AIに任せたい作業');
    expect(display?.learningObjective).toContain('AIに任せる作業');
    expect(display?.successCriteria).toContain('作業内容が具体的');
  });
});
