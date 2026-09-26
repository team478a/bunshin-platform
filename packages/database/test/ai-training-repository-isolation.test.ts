import { describe, expect, it, vi } from 'vitest';
import {
  PrismaAiTrainingRuntimeRepository,
  PrismaTrainingAnswerRepository,
  PrismaTrainingParticipantProfileRepository,
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
      select: { id: true },
    });
    expect(client.programActionEvent.findUnique).not.toHaveBeenCalled();
    expect(client.$transaction).not.toHaveBeenCalled();
  });
});
