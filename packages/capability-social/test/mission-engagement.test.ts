import type {
  BunshinCapabilityAssignment,
  BunshinCapabilityAssignmentRepository,
} from '@bunshin/application';
import { describe, expect, it } from 'vitest';
import {
  DecideMission,
  GetMissionProgress,
  RecordMissionActivity,
  normalizeMissionActivityMetadata,
  type DailyMissionRepository,
  type MissionActivity,
  type MissionDecision,
  type MissionEngagementRepository,
} from '../src';

const now = new Date('2026-08-20T00:00:00Z');
const decision: MissionDecision = {
  id: 'decision-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  dailyMissionId: 'mission-1',
  decision: 'PENDING',
  rejectionReason: null,
  rejectionDetail: null,
  decidedAt: null,
  createdAt: now,
  updatedAt: now,
};
const activity: MissionActivity = {
  id: 'activity-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  dailyMissionId: 'mission-1',
  actorUserId: 'user-1',
  type: 'VIEWED',
  occurredAt: now,
  idempotencyKey: 'key-1',
  metadata: null,
  createdAt: now,
};
class Assignments implements BunshinCapabilityAssignmentRepository {
  constructor(private readonly status: 'MISSING' | 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {}
  assign() {
    return Promise.resolve(null);
  }
  list() {
    return Promise.resolve([]);
  }
  setStatus() {
    return Promise.resolve(null);
  }
  find(): Promise<BunshinCapabilityAssignment | null> {
    return Promise.resolve(
      this.status === 'MISSING'
        ? null
        : {
            id: 'assignment-1',
            workspaceId: 'workspace-1',
            bunshinId: 'bunshin-1',
            capabilityType: 'SOCIAL',
            status: this.status,
            config: {},
            assignedByUserId: 'user-1',
            activatedAt: now,
            createdAt: now,
            updatedAt: now,
          },
    );
  }
}
const missions = {} as DailyMissionRepository;
class Engagement implements MissionEngagementRepository {
  lastDecision: Parameters<MissionEngagementRepository['decide']>[0] | null = null;
  lastActivity: Parameters<MissionEngagementRepository['appendActivity']>[0] | null = null;
  getDecision() {
    return Promise.resolve(decision);
  }
  decide(input: Parameters<MissionEngagementRepository['decide']>[0]) {
    this.lastDecision = input;
    return Promise.resolve({
      decision: { ...decision, decision: input.decision },
      activity: { ...activity, type: input.decision },
    });
  }
  listActivities() {
    return Promise.resolve([activity]);
  }
  appendActivity(input: Parameters<MissionEngagementRepository['appendActivity']>[0]) {
    this.lastActivity = input;
    return Promise.resolve({ ...activity, type: input.type, metadata: input.metadata });
  }
  listProgressDays(input: Parameters<MissionEngagementRepository['listProgressDays']>[0]) {
    const days = [
      {
        dailyMissionId: 'mission-1',
        missionDate: '2026-08-17',
        activities: [{ ...activity, type: 'CONFIRMED' as const }],
      },
      {
        dailyMissionId: 'mission-2',
        missionDate: '2026-08-18',
        activities: [{ ...activity, dailyMissionId: 'mission-2', type: 'COPIED_TEXT' as const }],
      },
      {
        dailyMissionId: 'mission-3',
        missionDate: '2026-08-19',
        activities: [{ ...activity, dailyMissionId: 'mission-3', type: 'POSTED' as const }],
      },
      {
        dailyMissionId: 'mission-4',
        missionDate: '2026-08-20',
        activities: [{ ...activity, dailyMissionId: 'mission-4', type: 'RESTED' as const }],
      },
      { dailyMissionId: 'mission-5', missionDate: '2026-08-21', activities: [] },
    ];
    return Promise.resolve(
      days.filter(
        (value) =>
          (input.from === null || value.missionDate >= input.from) && value.missionDate <= input.to,
      ),
    );
  }
}
const scope = {
  workspaceId: 'workspace-1',
  actorUserId: 'user-1',
  bunshinId: 'bunshin-1',
  dailyMissionId: 'mission-1',
};

describe('Mission Decision and Activity core', () => {
  it('accepts without rejection data and emits a decision request', async () => {
    const engagement = new Engagement();
    const value = await new DecideMission(missions, new Assignments(), engagement).execute({
      ...scope,
      decision: 'ACCEPTED',
      idempotencyKey: ' accept-1 ',
    });
    expect(value.decision.decision).toBe('ACCEPTED');
    expect(engagement.lastDecision).toMatchObject({
      rejectionReason: null,
      rejectionDetail: null,
      idempotencyKey: 'accept-1',
    });
  });

  it('requires a rejection reason and restricts detail to OTHER', async () => {
    const useCase = new DecideMission(missions, new Assignments(), new Engagement());
    await expect(
      useCase.execute({ ...scope, decision: 'REJECTED', idempotencyKey: 'reject-1' }),
    ).rejects.toThrow();
    await expect(
      useCase.execute({
        ...scope,
        decision: 'REJECTED',
        rejectionReason: 'WRONG_TOPIC',
        rejectionDetail: 'free text',
        idempotencyKey: 'reject-2',
      }),
    ).rejects.toThrow();
    await expect(
      useCase.execute({
        ...scope,
        decision: 'REJECTED',
        rejectionReason: 'OTHER',
        rejectionDetail: ' 今回は別の理由 ',
        idempotencyKey: 'reject-3',
      }),
    ).resolves.toBeDefined();
  });

  it('strictly validates event metadata and idempotency keys', async () => {
    expect(normalizeMissionActivityMetadata('COPIED_SLIDE', { slideIndex: 2 })).toEqual({
      slideIndex: 2,
    });
    expect(() =>
      normalizeMissionActivityMetadata('COPIED_SLIDE', { slideIndex: 2, content: 'secret' }),
    ).toThrow();
    expect(() => normalizeMissionActivityMetadata('COPIED_TEXT', { body: 'full post' })).toThrow();
    expect(normalizeMissionActivityMetadata('COPIED_IMAGE_INSTRUCTION', null)).toBeNull();
    expect(normalizeMissionActivityMetadata('CONFIRMED', null)).toBeNull();
    expect(normalizeMissionActivityMetadata('RESTED', null)).toBeNull();
    expect(() =>
      normalizeMissionActivityMetadata('COPIED_IMAGE_INSTRUCTION', { prompt: 'secret' }),
    ).toThrow();
    await expect(
      new RecordMissionActivity(missions, new Assignments(), new Engagement()).execute({
        ...scope,
        type: 'VIEWED',
        idempotencyKey: ' ',
      }),
    ).rejects.toThrow();
  });

  it('derives weekly and cumulative progress without treating a rest day as failure', async () => {
    const result = await new GetMissionProgress(new Assignments(), new Engagement()).execute({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
      bunshinId: 'bunshin-1',
      weekStart: '2026-08-17',
      weekEnd: '2026-08-23',
    });
    expect(result.weekly).toMatchObject({
      confirmedDays: 3,
      preparedDays: 2,
      postedDays: 1,
      restedDays: 1,
    });
    expect(result.remainingConfirmations).toBe(0);
    expect(result.cumulative.activeDays).toBe(4);
    expect(result.weekly.days.map((value) => value.status)).toEqual([
      'CONFIRMED',
      'PREPARED',
      'POSTED',
      'RESTED',
      'UNSEEN',
    ]);
  });

  it('rejects invalid progress weeks and suspended SOCIAL assignments', async () => {
    await expect(
      new GetMissionProgress(new Assignments(), new Engagement()).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        bunshinId: 'bunshin-1',
        weekStart: '2026-08-17',
        weekEnd: '2026-08-24',
      }),
    ).rejects.toThrow();
    await expect(
      new GetMissionProgress(new Assignments('SUSPENDED'), new Engagement()).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        bunshinId: 'bunshin-1',
        weekStart: '2026-08-17',
        weekEnd: '2026-08-23',
      }),
    ).rejects.toThrow();
  });

  it('requires ACTIVE SOCIAL for decision and activity mutations', async () => {
    for (const assignments of [new Assignments('MISSING'), new Assignments('SUSPENDED')]) {
      await expect(
        new DecideMission(missions, assignments, new Engagement()).execute({
          ...scope,
          decision: 'ACCEPTED',
          idempotencyKey: 'accept-guard',
        }),
      ).rejects.toThrow();
      await expect(
        new RecordMissionActivity(missions, assignments, new Engagement()).execute({
          ...scope,
          type: 'VIEWED',
          idempotencyKey: 'view-guard',
        }),
      ).rejects.toThrow();
    }
  });
});
