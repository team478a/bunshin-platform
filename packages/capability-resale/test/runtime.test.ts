/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import {
  AiResaleRuntimeConfigurationError,
  AiResaleV1Policy,
  RunAiResaleRuntimeBatch,
  isDaySevenClassificationDue,
  parseAiResaleRuntimeSettings,
  renderAiResaleFallback,
  type AiResaleRuntimeCandidate,
  type AiResaleRuntimeRepository,
} from '../src/index';

const now = new Date('2026-09-18T00:00:00.000Z');

function candidate(overrides: Partial<AiResaleRuntimeCandidate> = {}): AiResaleRuntimeCandidate {
  return {
    workspaceId: 'workspace-a',
    groupId: 'group-a',
    programEnrollmentId: 'enrollment-a',
    programTemplateVersionId: 'version-a',
    participantUserId: 'user-a',
    startsAt: new Date('2026-09-17T00:00:00.000Z'),
    programDay: 2,
    settings: {
      moduleKey: 'AI_RESALE_V1',
      policyKey: 'FREE_7D',
      automaticEnrollment: true,
      supportMode: 'GUIDED',
      timeZone: 'Asia/Tokyo',
      pauseAfterDays: 3,
      defaultWaitHours: 24,
      routeKey: 'STANDARD',
      phaseKey: 'FREE_TRIAL',
    },
    programState: 'ACTIVE',
    activityBaselineAt: new Date('2026-09-17T00:00:00.000Z'),
    lastUserActionAt: null,
    completedMissionCount: 0,
    progressRevision: null,
    daySevenClassified: false,
    items: [],
    eventTypes: [],
    ...overrides,
  };
}

function repository(
  due: AiResaleRuntimeCandidate[],
  result: Awaited<ReturnType<AiResaleRuntimeRepository['persistDecision']>> = 'APPLIED',
): AiResaleRuntimeRepository {
  return {
    enrollEligibleFreeParticipants: vi.fn().mockResolvedValue({
      scanned: 1,
      enrolled: 1,
      skipped: 0,
      failures: 0,
      truncated: false,
    }),
    listDueCandidates: vi.fn().mockResolvedValue({ candidates: due, truncated: false }),
    persistDecision: vi.fn().mockResolvedValue(result),
    persistDaySevenClassification: vi.fn().mockResolvedValue(result),
  };
}

describe('AI resale runtime settings', () => {
  it('keeps tenant program configuration outside the resale policy', () => {
    expect(
      parseAiResaleRuntimeSettings({
        moduleKey: 'AI_RESALE_V1',
        policyKey: 'FREE_7D',
        automaticEnrollment: true,
        supportMode: 'GUIDED',
        timeZone: 'Asia/Tokyo',
        pauseAfterDays: 3,
        defaultWaitHours: 24,
        routeKey: 'STANDARD',
        phaseKey: 'FREE_TRIAL',
      }),
    ).toMatchObject({ policyKey: 'FREE_7D', automaticEnrollment: true });
    expect(parseAiResaleRuntimeSettings({ moduleKey: 'ANOTHER_PROGRAM' })).toBeNull();
  });

  it('rejects automatic enrollment for a paid program', () => {
    expect(() =>
      parseAiResaleRuntimeSettings({
        moduleKey: 'AI_RESALE_V1',
        policyKey: 'PAID_90D',
        automaticEnrollment: true,
        supportMode: 'GUIDED',
        timeZone: 'Asia/Tokyo',
        pauseAfterDays: 3,
        defaultWaitHours: 24,
        routeKey: 'STANDARD',
        phaseKey: 'PAID_PROGRAM',
      }),
    ).toThrow(AiResaleRuntimeConfigurationError);
  });
});

describe('AI resale runtime batch', () => {
  it('auto-enrolls and persists one initial action with fixed fallback copy', async () => {
    const store = repository([candidate()]);
    const summary = await new RunAiResaleRuntimeBatch(
      store,
      new AiResaleV1Policy(),
      () => now,
      10,
    ).execute();

    expect(store.enrollEligibleFreeParticipants).toHaveBeenCalledWith({ now, limit: 10 });
    expect(store.persistDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({ actionKey: 'ITEM_FIND', mode: 'WORK' }),
        displaySnapshot: expect.objectContaining({
          title: '家にある不要品を1つ探しましょう',
          renderer: 'FIXED_FALLBACK',
        }),
      }),
    );
    expect(summary).toMatchObject({ actions: 1, waits: 0, daySevenClassified: 0 });
  });

  it('classifies after seven elapsed registration days even without user action', async () => {
    const value = candidate({ programDay: 8 });
    const store = repository([value]);
    const summary = await new RunAiResaleRuntimeBatch(
      store,
      new AiResaleV1Policy(),
      () => now,
    ).execute();

    expect(isDaySevenClassificationDue(value)).toBe(true);
    expect(store.persistDaySevenClassification).toHaveBeenCalledWith({
      candidate: value,
      classification: 'NOT_STARTED',
      evaluatedAt: now,
    });
    expect(store.persistDecision).not.toHaveBeenCalled();
    expect(summary.daySevenClassified).toBe(1);
  });

  it('classifies listing evidence ahead of generic action events', async () => {
    const value = candidate({
      programDay: 8,
      eventTypes: ['ACTION_COMPLETED', 'FIRST_LISTING'],
    });
    const store = repository([value]);
    await new RunAiResaleRuntimeBatch(store, new AiResaleV1Policy(), () => now).execute();
    expect(store.persistDaySevenClassification).toHaveBeenCalledWith(
      expect.objectContaining({ classification: 'LISTED' }),
    );
  });

  it('reports stale writes without presenting a second action', async () => {
    const store = repository([candidate()], 'STALE');
    const summary = await new RunAiResaleRuntimeBatch(
      store,
      new AiResaleV1Policy(),
      () => now,
    ).execute();
    expect(summary).toMatchObject({ actions: 0, stale: 1, failures: 0 });
  });

  it('renders WAIT without a completion step', () => {
    expect(
      renderAiResaleFallback({
        actionKey: 'WAIT',
        mode: 'WAIT',
        reasonCode: 'LISTING_OBSERVATION_WINDOW',
        target: null,
        ruleVersion: 'AI_RESALE_V1_RULES_1',
        reevaluateAt: new Date('2026-09-19T00:00:00.000Z'),
      }),
    ).toMatchObject({ title: '今日は何もしなくてOKです', steps: [], estimatedMinutes: null });
  });
});
