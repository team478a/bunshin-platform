import { describe, expect, it } from 'vitest';
import { AiTrainingV1Policy, createAiTrainingV1Definition } from '../src/index';

const now = new Date('2026-09-21T00:00:00.000Z');
const policy = new AiTrainingV1Policy();
const base = {
  now,
  role: 'SALES' as const,
  aiLevel: 'BEGINNER' as const,
  currentPhase: 'FOUNDATION' as const,
  completedMissionKeys: [],
  completedMissionCount: 0,
  recentSuccesses: 0,
  recentFailures: 0,
  needsReview: false,
  lastMissionKey: null,
  streak: 0,
  bottleneckKey: null,
  activityBaselineAt: now,
  lastActionAt: now,
  pauseAfterDays: 7,
  activeWaitUntil: null,
};

describe('AiTrainingV1Policy', () => {
  it('selects a foundation mission for a beginner', () =>
    expect(policy.evaluate(base).actionKey).toBe('AI_BASIC'));
  it('selects a sales mission after foundations are complete', () =>
    expect(
      policy.evaluate({
        ...base,
        completedMissionKeys: [
          'AI_BASIC',
          'CHATGPT_BASIC',
          'PROMPT_BASIC',
          'PROMPT_CONDITION',
          'PROMPT_FORMAT',
        ],
      }).actionKey,
    ).toBe('SALES_EMAIL'));
  it('selects office and manager missions by role', () => {
    const completedMissionKeys = [
      'AI_BASIC',
      'CHATGPT_BASIC',
      'PROMPT_BASIC',
      'PROMPT_CONDITION',
      'PROMPT_FORMAT',
    ];
    expect(
      policy.evaluate({ ...base, role: 'OFFICE', aiLevel: 'INTERMEDIATE', completedMissionKeys })
        .actionKey,
    ).toBe('DOCUMENT_SUMMARY');
    expect(
      policy.evaluate({ ...base, role: 'MANAGER', aiLevel: 'INTERMEDIATE', completedMissionKeys })
        .actionKey,
    ).toBe('MANAGER_PROCESS_REVIEW');
  });
  it('advances through role missions without reassigning completed work', () => {
    const foundation = [
      'AI_BASIC',
      'CHATGPT_BASIC',
      'PROMPT_BASIC',
      'PROMPT_CONDITION',
      'PROMPT_FORMAT',
    ];
    expect(
      policy.evaluate({
        ...base,
        completedMissionKeys: [...foundation, 'SALES_EMAIL'],
      }).actionKey,
    ).toBe('SALES_HEARING');

    const finished = policy.evaluate({
      ...base,
      completedMissionKeys: [
        ...foundation,
        'SALES_EMAIL',
        'SALES_HEARING',
        'SALES_PROPOSAL',
        'SALES_FOLLOW_UP',
      ],
    });
    expect(finished).toMatchObject({ actionKey: 'WAIT', mode: 'WAIT' });
    expect(finished.reevaluateAt).toEqual(new Date('2026-09-22T00:00:00.000Z'));
  });
  it('prioritizes review, recovery and wait deterministically', () => {
    expect(policy.evaluate({ ...base, recentFailures: 2 }).actionKey).toBe('PROMPT_REVIEW');
    expect(
      policy.evaluate({ ...base, lastActionAt: new Date('2026-09-10T00:00:00.000Z') }).actionKey,
    ).toBe('RECOVERY');
    const decision = policy.evaluate({
      ...base,
      activeWaitUntil: new Date('2026-09-22T00:00:00.000Z'),
    });
    expect(decision).toMatchObject({ actionKey: 'WAIT', mode: 'WAIT' });
  });
  it('defines a valid 30-day training program with every policy action', () => {
    const definition = createAiTrainingV1Definition();
    expect(definition.duration).toEqual({ type: 'FIXED_DAYS', days: 30 });
    expect(definition.missions.map((mission) => mission.key)).toContain('SALES_EMAIL');
    expect(definition.missions.map((mission) => mission.key)).toContain('RECOVERY');
  });
});
