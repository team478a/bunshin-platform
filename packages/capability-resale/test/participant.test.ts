/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import {
  AiResaleParticipantService,
  AiResaleV1Policy,
  renderAiResaleFallback,
  type AiResaleParticipantAction,
  type AiResaleParticipantRepository,
  type AiResaleParticipantState,
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
    progressRevision: 1,
    daySevenClassified: false,
    items: [],
    eventTypes: [],
    ...overrides,
  };
}

function action(actionKey: 'ITEM_FIND' | 'PHOTO' | 'WAIT'): AiResaleParticipantAction {
  const decision = {
    actionKey,
    mode: actionKey === 'WAIT' ? ('WAIT' as const) : ('WORK' as const),
    reasonCode: 'TEST',
    target:
      actionKey === 'PHOTO' ? { resourceType: 'RESALE_ITEM' as const, resourceId: 'item-a' } : null,
    ruleVersion: 'AI_RESALE_V1_RULES_1',
    reevaluateAt: actionKey === 'WAIT' ? new Date('2026-09-19T00:00:00.000Z') : null,
  };
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sequence: 1,
    actionKey,
    mode: decision.mode,
    status: 'PRESENTED',
    display: renderAiResaleFallback(decision),
    targetResourceId: decision.target?.resourceId ?? null,
    presentedAt: now,
    reevaluateAt: decision.reevaluateAt,
  };
}

function state(currentAction: AiResaleParticipantAction | null): AiResaleParticipantState {
  return {
    enrollmentId: 'enrollment-a',
    programName: 'AI物販7日体験',
    enrollmentStatus: 'ACTIVE',
    policyKey: 'FREE_7D',
    programDay: 2,
    startsAt: new Date('2026-09-17T00:00:00.000Z'),
    endsAt: null,
    classification: null,
    action: currentAction,
  };
}

function runtimeStore(value: AiResaleRuntimeCandidate): AiResaleRuntimeRepository {
  return {
    expireEndedPaidParticipants: vi.fn(),
    enrollEligibleFreeParticipants: vi.fn(),
    listDueCandidates: vi.fn(),
    findCandidate: vi.fn().mockResolvedValue(value),
    persistDecision: vi.fn().mockResolvedValue('APPLIED'),
    persistDaySevenClassification: vi.fn().mockResolvedValue('APPLIED'),
  };
}

function participantStore(states: AiResaleParticipantState[]): AiResaleParticipantRepository {
  return {
    findState: vi.fn().mockImplementation(() => Promise.resolve(states.shift() ?? null)),
    findAction: vi.fn(),
    applyResult: vi.fn().mockResolvedValue('APPLIED'),
  };
}

const scope = {
  workspaceId: 'workspace-a',
  groupId: 'group-a',
  actorUserId: 'user-a',
  programEnrollmentId: 'enrollment-a',
};

describe('AI resale participant service', () => {
  it('creates the current action immediately when an active enrollment has none', async () => {
    const expected = state(action('ITEM_FIND'));
    const participant = participantStore([state(null), expected]);
    const runtime = runtimeStore(candidate());

    await expect(
      new AiResaleParticipantService(participant, runtime, new AiResaleV1Policy()).current({
        ...scope,
        now,
      }),
    ).resolves.toEqual(expected);
    expect(runtime.findCandidate).toHaveBeenCalledWith({ ...scope, now });
    expect(runtime.persistDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({ actionKey: 'ITEM_FIND' }),
      }),
    );
  });

  it('records a completed action and immediately presents the next action', async () => {
    const current = action('ITEM_FIND');
    const next = state(action('PHOTO'));
    const participant = participantStore([state(null), next]);
    participant.findAction = vi.fn().mockResolvedValue(current);
    const runtime = runtimeStore(
      candidate({
        items: [
          {
            id: 'item-a',
            status: 'FOUND',
            reactionState: 'UNKNOWN',
            foundAt: now,
            listedAt: null,
            reactionObservedAt: null,
            lastImprovedAt: null,
            soldAt: null,
            shippedAt: null,
            reevaluateAt: null,
          },
        ],
      }),
    );
    const service = new AiResaleParticipantService(participant, runtime, new AiResaleV1Policy());

    await expect(
      service.submit({
        ...scope,
        assignmentId: current.id,
        resultStatus: 'DONE',
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
        itemTitle: '  使っていないバッグ  ',
        reactionState: null,
        improvementType: null,
        soldPriceYen: null,
        note: null,
        occurredAt: now,
      }),
    ).resolves.toEqual({ result: 'APPLIED', state: next });
    expect(participant.applyResult).toHaveBeenCalledWith(
      expect.objectContaining({ itemTitle: '使っていないバッグ' }),
    );
    expect(runtime.persistDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: expect.objectContaining({ actionKey: 'PHOTO' }) }),
    );
  });

  it('does not accept a completion result for WAIT', async () => {
    const participant = participantStore([]);
    participant.findAction = vi.fn().mockResolvedValue(action('WAIT'));
    const service = new AiResaleParticipantService(
      participant,
      runtimeStore(candidate()),
      new AiResaleV1Policy(),
    );

    await expect(
      service.submit({
        ...scope,
        assignmentId: '11111111-1111-4111-8111-111111111111',
        resultStatus: 'DONE',
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
        itemTitle: null,
        reactionState: null,
        improvementType: null,
        soldPriceYen: null,
        note: null,
        occurredAt: now,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(participant.applyResult).not.toHaveBeenCalled();
  });

  it('completes the free trial with a DAY7 classification instead of another action', async () => {
    const current = action('ITEM_FIND');
    const completed = {
      ...state(null),
      enrollmentStatus: 'COMPLETED' as const,
      classification: 'PARTIAL' as const,
    };
    const participant = participantStore([state(null), completed]);
    participant.findAction = vi.fn().mockResolvedValue(current);
    const runtime = runtimeStore(
      candidate({ programDay: 8, eventTypes: ['ACTION_NOT_COMPLETED'] }),
    );

    await new AiResaleParticipantService(participant, runtime, new AiResaleV1Policy()).submit({
      ...scope,
      assignmentId: current.id,
      resultStatus: 'NOT_DONE',
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      itemTitle: null,
      reactionState: null,
      improvementType: null,
      soldPriceYen: null,
      note: null,
      occurredAt: now,
    });

    expect(runtime.persistDaySevenClassification).toHaveBeenCalledWith(
      expect.objectContaining({ classification: 'PARTIAL' }),
    );
    expect(runtime.persistDecision).not.toHaveBeenCalled();
  });

  it('returns the already-created next action on an idempotent retry', async () => {
    const previous = action('ITEM_FIND');
    const next = state(action('PHOTO'));
    const participant = participantStore([next]);
    participant.findAction = vi.fn().mockResolvedValue(previous);
    participant.applyResult = vi.fn().mockResolvedValue('ALREADY_APPLIED');
    const runtime = runtimeStore(candidate());

    await expect(
      new AiResaleParticipantService(participant, runtime, new AiResaleV1Policy()).submit({
        ...scope,
        assignmentId: previous.id,
        resultStatus: 'DONE',
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
        itemTitle: 'バッグ',
        reactionState: null,
        improvementType: null,
        soldPriceYen: null,
        note: null,
        occurredAt: now,
      }),
    ).resolves.toEqual({ result: 'ALREADY_APPLIED', state: next });
    expect(runtime.findCandidate).not.toHaveBeenCalled();
    expect(runtime.persistDecision).not.toHaveBeenCalled();
  });
});
