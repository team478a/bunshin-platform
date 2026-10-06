import { describe, expect, it, vi } from 'vitest';
import {
  PrismaAiTrainingRuntimeRepository,
  PrismaTrainingAnswerRepository,
  PrismaTrainingParticipantProfileRepository,
  PrismaTrainingWorkResultRepository,
} from '../src';

const scope = {
  workspaceId: '00000000-0000-4000-8000-000000000101',
  groupId: '00000000-0000-4000-8000-000000000102',
  actorUserId: '00000000-0000-4000-8000-000000000103',
  programEnrollmentId: '00000000-0000-4000-8000-000000000104',
};

const enrollment = {
  id: scope.programEnrollmentId,
  groupMembershipId: '00000000-0000-4000-8000-000000000105',
  serviceProgramId: '00000000-0000-4000-8000-000000000106',
  startsAt: new Date('2026-09-26T00:00:00.000Z'),
};

function answerInput() {
  return {
    ...scope,
    missionAssignmentId: '00000000-0000-4000-8000-000000000107',
    answer: '顧客の状況と目的を含めて回答します。',
    idempotencyKey: 'training-answer-key',
    occurredAt: new Date('2026-09-26T01:00:00.000Z'),
  };
}

describe('AI training repository isolation', () => {
  it('stops state reads when the actor is not the active participant for the enrollment', async () => {
    const client = {
      programEnrollment: { findFirst: vi.fn().mockResolvedValue(enrollment) },
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      serviceProgram: { findFirst: vi.fn().mockResolvedValue({ id: enrollment.serviceProgramId }) },
      programTemplateVersion: { findFirst: vi.fn() },
      trainingParticipantProfile: { findFirst: vi.fn() },
      programProgressSnapshot: { findFirst: vi.fn() },
      programMemberGoal: { findFirst: vi.fn() },
    };

    await expect(
      new PrismaAiTrainingRuntimeRepository(client as never).findState({
        ...scope,
        now: new Date('2026-09-26T00:00:00.000Z'),
      }),
    ).resolves.toBeNull();
    expect(client.groupMembership.findFirst).toHaveBeenCalledWith({
      where: {
        id: enrollment.groupMembershipId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        userId: scope.actorUserId,
        serviceRole: 'PARTICIPANT',
        status: 'ACTIVE',
      },
    });
    expect(client.programTemplateVersion.findFirst).not.toHaveBeenCalled();
    expect(client.trainingParticipantProfile.findFirst).not.toHaveBeenCalled();
    expect(client.programProgressSnapshot.findFirst).not.toHaveBeenCalled();
  });

  it('does not save a profile when the actor has no participant membership in scope', async () => {
    const tx = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      $queryRaw: vi.fn().mockResolvedValue([]),
      programEnrollment: { findFirst: vi.fn() },
      serviceProgram: { findFirst: vi.fn() },
      trainingParticipantProfile: { upsert: vi.fn() },
      programMemberGoal: { updateMany: vi.fn(), create: vi.fn() },
      programActionEvent: { create: vi.fn() },
    };
    const client = {
      programActionEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };

    await expect(
      new PrismaTrainingParticipantProfileRepository(client as never).save({
        ...scope,
        role: 'SALES',
        aiLevel: 'BEGINNER',
        aiUseCases: [],
        workChallenges: [],
        preferredTopics: [],
        dailyMinutes: 5,
        learningGoalKey: 'CREATE_SALES_EMAIL',
        idempotencyKey: 'training-profile-key',
        occurredAt: new Date('2026-09-26T00:00:00.000Z'),
      }),
    ).resolves.toEqual({ outcome: 'NOT_FOUND' });
    expect(tx.programEnrollment.findFirst).not.toHaveBeenCalled();
    expect(tx.trainingParticipantProfile.upsert).not.toHaveBeenCalled();
    expect(tx.programActionEvent.create).not.toHaveBeenCalled();
  });

  it('rejects answer submission by a non-participant before assignment and answer writes', async () => {
    const client = {
      programEnrollment: { findFirst: vi.fn().mockResolvedValue(enrollment) },
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      serviceProgram: { findFirst: vi.fn() },
      programActionEvent: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    };

    await expect(
      new PrismaTrainingAnswerRepository(client as never).submit(answerInput()),
    ).resolves.toEqual({ outcome: 'NOT_FOUND' });
    expect(client.serviceProgram.findFirst).not.toHaveBeenCalled();
    expect(client.programActionEvent.findUnique).not.toHaveBeenCalled();
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('rejects answer submission when the enrollment belongs to another capability', async () => {
    const client = {
      programEnrollment: { findFirst: vi.fn().mockResolvedValue(enrollment) },
      groupMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: enrollment.groupMembershipId }),
      },
      serviceProgram: { findFirst: vi.fn().mockResolvedValue(null) },
      programActionEvent: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    };

    await expect(
      new PrismaTrainingAnswerRepository(client as never).submit(answerInput()),
    ).resolves.toEqual({ outcome: 'NOT_FOUND' });
    expect(client.serviceProgram.findFirst).toHaveBeenCalledWith({
      where: {
        id: enrollment.serviceProgramId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        status: 'ACTIVE',
        settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
      },
      select: { id: true, settings: true },
    });
    expect(client.programActionEvent.findUnique).not.toHaveBeenCalled();
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('does not record a work result for another user enrollment', async () => {
    const tx = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      programEnrollment: { findFirst: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([]),
      serviceProgram: { findFirst: vi.fn() },
      programMissionAssignment: { findFirst: vi.fn() },
      programActionEvent: { create: vi.fn() },
      programProgressSnapshot: { updateMany: vi.fn() },
    };
    const client = {
      programActionEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };

    await expect(
      new PrismaTrainingWorkResultRepository(client as never).record({
        ...scope,
        missionAssignmentId: '00000000-0000-4000-8000-000000000107',
        result: 'USED_AS_IS',
        idempotencyKey: 'training-work-result-key',
        occurredAt: new Date('2026-09-28T01:00:00.000Z'),
      }),
    ).resolves.toEqual({ outcome: 'NOT_FOUND' });
    expect(tx.programEnrollment.findFirst).not.toHaveBeenCalled();
    expect(tx.programActionEvent.create).not.toHaveBeenCalled();
  });

  it('returns the same work result for a repeated idempotency key', async () => {
    const client = {
      programActionEvent: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'event-1',
          actorUserId: scope.actorUserId,
          programEnrollmentId: scope.programEnrollmentId,
          missionAssignmentId: '00000000-0000-4000-8000-000000000107',
          eventType: 'TRAINING_WORK_RESULT_RECORDED',
          metadata: { schemaVersion: 1, result: 'USED_WITH_EDITS' },
        }),
      },
      $transaction: vi.fn(),
    };

    await expect(
      new PrismaTrainingWorkResultRepository(client as never).record({
        ...scope,
        missionAssignmentId: '00000000-0000-4000-8000-000000000107',
        result: 'USED_WITH_EDITS',
        idempotencyKey: 'training-work-result-key',
        occurredAt: new Date('2026-09-28T01:00:00.000Z'),
      }),
    ).resolves.toEqual({ outcome: 'ALREADY_RECORDED', eventId: 'event-1' });
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('records only the scoped work result metadata and advances the progress revision', async () => {
    const assignmentId = '00000000-0000-4000-8000-000000000107';
    const occurredAt = new Date('2026-09-28T01:00:00.000Z');
    const tx = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
      $queryRaw: vi.fn().mockResolvedValue([]),
      programEnrollment: {
        findFirst: vi.fn().mockResolvedValue({
          id: scope.programEnrollmentId,
          serviceProgramId: 'program-1',
        }),
      },
      serviceProgram: { findFirst: vi.fn().mockResolvedValue({ id: 'program-1' }) },
      programMissionAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          id: assignmentId,
          missionDefinitionKey: 'SALES_EMAIL_BASIC',
        }),
      },
      programActionEvent: { create: vi.fn().mockResolvedValue({ id: 'event-1' }) },
      programProgressSnapshot: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const client = {
      programActionEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };

    await expect(
      new PrismaTrainingWorkResultRepository(client as never).record({
        ...scope,
        missionAssignmentId: assignmentId,
        result: 'USED_WITH_EDITS',
        idempotencyKey: 'training-work-result-key',
        occurredAt,
      }),
    ).resolves.toEqual({ outcome: 'RECORDED', eventId: 'event-1' });
    expect(tx.programActionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: scope.programEnrollmentId,
        missionAssignmentId: assignmentId,
        actorUserId: scope.actorUserId,
        eventType: 'TRAINING_WORK_RESULT_RECORDED',
        metadata: {
          schemaVersion: 1,
          assignmentId,
          missionKey: 'SALES_EMAIL_BASIC',
          result: 'USED_WITH_EDITS',
        },
      }),
      select: { id: true },
    });
    expect(tx.programProgressSnapshot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revision: { increment: 1 } }),
      }),
    );
  });
});
