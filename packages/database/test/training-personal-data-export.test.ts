import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRAINING_EXPORT_MAX_ROWS } from '@bunshin/capability-training';
import { PrismaTrainingPersonalDataExportRepository } from '../src';

const input = {
  workspaceId: 'workspace-a',
  groupId: 'service-a',
  actorUserId: 'user-a',
  programEnrollmentId: 'enrollment-a',
};
const now = new Date('2026-09-28T12:00:00Z');
function fixture() {
  const tx = {
    personalLearningPilotSeat: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    personalLearningTopic: { findMany: vi.fn().mockResolvedValue([]) },
    personalLearningPersonaItem: { findMany: vi.fn().mockResolvedValue([]) },
    personalLearningPersonaSuppression: { findMany: vi.fn().mockResolvedValue([]) },
    personalLearningSavedExample: { findMany: vi.fn().mockResolvedValue([]) },
    personalLearningPersonaProfile: { findMany: vi.fn().mockResolvedValue([]) },
    personalLearningGoalConfirmation: { findMany: vi.fn().mockResolvedValue([]) },
    personalLearningRequest: { findMany: vi.fn().mockResolvedValue([]) },
    personalLearningPlanRevision: { findMany: vi.fn().mockResolvedValue([]) },
    personalLearningLineInbox: { findMany: vi.fn().mockResolvedValue([]) },
    personalLearningLinePush: { findMany: vi.fn().mockResolvedValue([]) },
    personalLearningNudgePreference: { findFirst: vi.fn().mockResolvedValue(null) },
    groupMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'membership-a', serviceRole: 'PARTICIPANT' }),
    },
    programEnrollment: {
      findFirst: vi.fn().mockResolvedValue({
        id: input.programEnrollmentId,
        serviceProgramId: 'program-a',
        status: 'COMPLETED',
        supportMode: 'GUIDED',
        startsAt: now,
        endsAt: now,
        createdAt: now,
      }),
    },
    serviceProgram: { findFirst: vi.fn().mockResolvedValue({ id: 'program-a' }) },
    trainingParticipantProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    programProgressSnapshot: { findFirst: vi.fn().mockResolvedValue(null) },
    programMissionAssignment: { findMany: vi.fn().mockResolvedValue([]) },
    trainingMissionAnswer: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'answer-a',
          answer: '本人の回答',
          evaluation: { result: 'PASS' },
          evaluatedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    },
    trainingToolkitItem: { findMany: vi.fn().mockResolvedValue([]) },
    programActionEvent: { findMany: vi.fn().mockResolvedValue([]) },
    programMemberGoal: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const client = {
    $transaction: vi.fn((callback: (value: typeof tx) => unknown) => Promise.resolve(callback(tx))),
  };
  return {
    tx,
    client,
    repository: new PrismaTrainingPersonalDataExportRepository(client as never),
  };
}

describe('training personal data export isolation', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses a repeatable read and scopes all personal tables to the authenticated enrollment', async () => {
    const { tx, client, repository } = fixture();
    const result = await repository.read(input);
    expect(result.outcome).toBe('FOUND');
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(tx.programEnrollment.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      id: input.programEnrollmentId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      groupMembershipId: 'membership-a',
      status: { in: ['ACTIVE', 'COMPLETED', 'EXPIRED'] },
    });
    for (const query of [tx.trainingMissionAnswer.findMany, tx.trainingToolkitItem.findMany]) {
      expect(query.mock.calls[0]?.[0]).toMatchObject({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: input.programEnrollmentId,
          userId: input.actorUserId,
        },
        take: TRAINING_EXPORT_MAX_ROWS + 1,
      });
    }
    expect(tx.programActionEvent.findMany.mock.calls[0]?.[0].where.actorUserId).toBe(
      input.actorUserId,
    );
    expect(tx.programActionEvent.findMany.mock.calls[0]?.[0].select).not.toHaveProperty('metadata');
    expect(tx.programActionEvent.findMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: input.programEnrollmentId,
        actorUserId: input.actorUserId,
        eventType: 'PERSONAL_LEARNING_PRACTICE_NOTE',
      },
      select: { metadata: true },
      take: TRAINING_EXPORT_MAX_ROWS + 1,
    });
    expect(tx.trainingParticipantProfile.findFirst.mock.calls[0]?.[0].select).not.toHaveProperty(
      'updatedByUserId',
    );
    expect(tx.programActionEvent.findMany.mock.calls[2]?.[0]).toMatchObject({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: input.programEnrollmentId,
        actorUserId: input.actorUserId,
        eventType: {
          in: ['PERSONAL_LEARNING_SUPPORT_REQUEST', 'PERSONAL_LEARNING_SUPPORT_RESPONSE'],
        },
      },
      select: { metadata: true },
      take: TRAINING_EXPORT_MAX_ROWS + 1,
    });
    expect(tx.serviceProgram.findFirst.mock.calls[0]?.[0].where).not.toHaveProperty('status');
    expect(tx.personalLearningPilotSeat.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        serviceProgramId: 'program-a',
        participantHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      select: { kind: true, cohort: true, seatNumber: true, admittedAt: true, revokedAt: true },
      take: TRAINING_EXPORT_MAX_ROWS + 1,
    });
  });

  it('includes side hustle hearing, proposal, selection, roadmap, start, checkin and stage events in the owner export', async () => {
    const { tx, repository } = fixture();
    tx.programActionEvent.findMany.mockImplementation(((args: {
      where?: { eventType?: { in?: string[] } };
    }) => {
      const types = args.where?.eventType?.in ?? [];
      if (!types.includes('SIDE_HUSTLE_HEARING_SAVED')) return Promise.resolve([]);
      return Promise.resolve([
        {
          eventType: 'SIDE_HUSTLE_HEARING_SAVED',
          occurredAt: now,
          metadata: { hearing: { freeText: { goal: '回答' } } },
        },
        {
          eventType: 'SIDE_HUSTLE_PROPOSAL_SAVED',
          occurredAt: now,
          metadata: { proposal: { reason: '提案' } },
        },
        {
          eventType: 'SIDE_HUSTLE_SELECTED',
          occurredAt: now,
          metadata: { candidate: { name: '候補' } },
        },
        {
          eventType: 'SIDE_HUSTLE_ROADMAP_PROPOSED',
          occurredAt: now,
          metadata: { roadmap: { milestones: [] } },
        },
        {
          eventType: 'SIDE_HUSTLE_STARTED',
          occurredAt: now,
          metadata: { topicId: 'topic', requestId: 'request' },
        },
        {
          eventType: 'SIDE_HUSTLE_CHECKIN_SAVED',
          occurredAt: now,
          metadata: { topicId: 'topic', checkin: { note: '振り返り' } },
        },
        {
          eventType: 'SIDE_HUSTLE_STAGE_ADVANCED',
          occurredAt: now,
          metadata: { topicId: 'topic', fromPeriod: 'MONTH_1', toPeriod: 'MONTH_2' },
        },
      ]);
    }) as never);
    const result = await repository.read(input);
    expect(result.outcome).toBe('FOUND');
    if (result.outcome !== 'FOUND') throw new Error('export not found');
    const personalLearning = result.data.personalLearning as unknown as readonly {
      kind: string;
      metadata: unknown;
    }[];
    expect(personalLearning.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        'SIDE_HUSTLE_HEARING_SAVED',
        'SIDE_HUSTLE_PROPOSAL_SAVED',
        'SIDE_HUSTLE_SELECTED',
        'SIDE_HUSTLE_ROADMAP_PROPOSED',
        'SIDE_HUSTLE_STARTED',
        'SIDE_HUSTLE_CHECKIN_SAVED',
        'SIDE_HUSTLE_STAGE_ADVANCED',
      ]),
    );
  });
  it('stops before reading answers for a foreign/inactive user, foreign enrollment or other module', async () => {
    for (const blocked of ['groupMembership', 'programEnrollment', 'serviceProgram'] as const) {
      const { tx, repository } = fixture();
      tx[blocked].findFirst.mockResolvedValue(null);
      expect(await repository.read(input)).toEqual({ outcome: 'NOT_FOUND' });
      expect(tx.trainingMissionAnswer.findMany).not.toHaveBeenCalled();
    }
  });
  it('does not return a partial snapshot on overflow', async () => {
    const { tx, repository } = fixture();
    tx.trainingToolkitItem.findMany.mockResolvedValue(
      Array.from({ length: TRAINING_EXPORT_MAX_ROWS + 1 }, () => ({})),
    );
    expect(await repository.read(input)).toEqual({ outcome: 'TOO_LARGE' });
  });
  it('serializes dates but never writes or starts generation', async () => {
    const { repository } = fixture();
    const result = await repository.read(input);
    if (result.outcome !== 'FOUND') throw new Error('expected snapshot');
    expect(result.data.answers[0]?.['createdAt']).toBe(now.toISOString());
    expect(result.data.answers[0]?.['answer']).toBe('本人の回答');
    expect(result.data.profile).toBeNull();
  });
  it('requires INTERNAL owner history before reading any learning data', async () => {
    const { tx, repository } = fixture();
    tx.groupMembership.findFirst.mockResolvedValue({
      id: 'membership-a',
      serviceRole: 'SERVICE_OWNER',
    });
    tx.serviceProgram.findFirst.mockResolvedValue({
      id: 'program-a',
      settings: {
        moduleKey: 'AI_TRAINING_V1',
        personalLearningPilot: { enabled: false },
      },
    });
    expect(await repository.read(input)).toEqual({ outcome: 'NOT_FOUND' });
    expect(tx.trainingMissionAnswer.findMany).not.toHaveBeenCalled();
    tx.personalLearningPilotSeat.findFirst.mockResolvedValue({
      programEnrollmentId: input.programEnrollmentId,
      revokedAt: now,
    });
    expect((await repository.read(input)).outcome).toBe('FOUND');
  });
  it('exports only explicitly scoped practice note content, not generic activity metadata', async () => {
    const { tx, repository } = fixture();
    tx.programActionEvent.findMany.mockResolvedValueOnce([]);
    tx.programActionEvent.findMany.mockResolvedValueOnce([
      {
        id: 'note',
        missionAssignmentId: 'assignment',
        occurredAt: now,
        metadata: { text: '本人の作業記録', evidenceLevel: 'SELF_REPORT', revision: 1 },
      },
    ]);
    const result = await repository.read(input);
    if (result.outcome !== 'FOUND') throw new Error('snapshot required');
    expect(result.data.activities).toEqual([]);
    expect(result.data.personalLearning?.[0]).toMatchObject({
      kind: 'PRACTICE_NOTE',
      metadata: { text: '本人の作業記録', evidenceLevel: 'SELF_REPORT' },
      occurredAt: now.toISOString(),
    });
  });
});
