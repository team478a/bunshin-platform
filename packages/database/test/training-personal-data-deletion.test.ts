import { describe, expect, it, vi } from 'vitest';
import { PrismaTrainingPersonalDataDeletionRepository } from '../src';

const now = new Date('2026-09-28T00:00:00Z');
const scope = {
  workspaceId: 'workspace-a',
  groupId: 'group-a',
  actorUserId: 'user-a',
  programEnrollmentId: 'enrollment-a',
};
const all = { ...scope, target: { kind: 'ALL' as const } };
function fixture() {
  const rows = [
    {
      id: 'answer-a',
      missionAssignmentId: 'assignment-a',
      updatedAt: now,
      createdAt: now,
      evaluationStatus: 'READY',
    },
  ];
  const table = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  });
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    personalLearningPilotSeat: { ...table(), findFirst: vi.fn().mockResolvedValue(null) },
    groupMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'membership-a', serviceRole: 'PARTICIPANT' }),
    },
    programEnrollment: {
      findFirst: vi.fn().mockResolvedValue({
        id: scope.programEnrollmentId,
        serviceProgramId: 'program-a',
        updatedAt: now,
      }),
      updateMany: vi.fn(),
    },
    serviceProgram: { findFirst: vi.fn().mockResolvedValue({ id: 'program-a' }) },
    trainingMissionAnswer: { ...table(), findMany: vi.fn().mockResolvedValue(rows) },
    trainingToolkitItem: {
      ...table(),
      findMany: vi.fn().mockResolvedValue([{ id: 'toolkit-a', createdAt: now }]),
    },
    trainingParticipantProfile: table(),
    programProgressSnapshot: table(),
    programMissionAssignment: table(),
    programActionEvent: table(),
    programMemberGoal: table(),
    programMemberPreference: table(),
    job: { updateMany: vi.fn() },
    programAuditLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  };
  const client = {
    $transaction: vi.fn((callback: (value: typeof tx) => unknown) => Promise.resolve(callback(tx))),
  };
  return {
    tx,
    client,
    repository: new PrismaTrainingPersonalDataDeletionRepository(client as never),
  };
}
describe('personal training data deletion', () => {
  it('requires INTERNAL owner history for both preview and confirmed deletion', async () => {
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
    expect(await repository.preview(all)).toEqual({ outcome: 'NOT_FOUND' });
    expect(await repository.delete({ ...all, revision: 'a'.repeat(64), now })).toEqual({
      outcome: 'NOT_FOUND',
    });
    expect(tx.trainingMissionAnswer.findMany).not.toHaveBeenCalled();
    expect(tx.trainingMissionAnswer.deleteMany).not.toHaveBeenCalled();
    tx.personalLearningPilotSeat.findFirst.mockResolvedValue({
      programEnrollmentId: scope.programEnrollmentId,
      revokedAt: now,
    });
    const preview = await repository.preview(all);
    if (preview.outcome !== 'PREVIEW') throw new Error('owner preview expected');
    // Removal between preview and confirm is revalidated before physical deletion.
    tx.personalLearningPilotSeat.findFirst.mockResolvedValue(null);
    expect(await repository.delete({ ...all, revision: preview.preview.revision, now })).toEqual({
      outcome: 'NOT_FOUND',
    });
    expect(tx.trainingMissionAnswer.deleteMany).not.toHaveBeenCalled();
  });
  it('previews only identifiers/counts, scopes every table, and never mutates on preview', async () => {
    const { tx, repository, client } = fixture();
    const result = await repository.preview(all);
    expect(result).toMatchObject({
      outcome: 'PREVIEW',
      preview: { counts: { answers: 1, toolkit: 1 } },
    });
    expect(JSON.stringify(result)).not.toContain('answerBody');
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(tx.trainingMissionAnswer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          userId: scope.actorUserId,
          programEnrollmentId: scope.programEnrollmentId,
        },
        select: expect.not.objectContaining({ answer: true, evaluation: true }),
      }),
    );
    expect(tx.trainingMissionAnswer.deleteMany).not.toHaveBeenCalled();
    expect(tx.programAuditLog.create).not.toHaveBeenCalled();
  });
  it('deletes all confirmed learning records, clears copied goals and cancels only scoped evaluations', async () => {
    const { tx, repository } = fixture();
    const preview = await repository.preview(all);
    if (preview.outcome !== 'PREVIEW') throw new Error('preview expected');
    expect(
      await repository.delete({ ...all, revision: preview.preview.revision, now }),
    ).toMatchObject({ outcome: 'DELETED' });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.personalLearningPilotSeat.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: scope.programEnrollmentId,
      },
      data: { programEnrollmentId: null, revokedAt: expect.any(Date) },
    });
    expect(tx.personalLearningPilotSeat.deleteMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.programAuditLog.findFirst.mock.invocationCallOrder[0]!,
    );
    for (const name of [
      'trainingParticipantProfile',
      'programProgressSnapshot',
      'programMissionAssignment',
      'programMemberGoal',
      'programMemberPreference',
    ] as const)
      expect(tx[name].deleteMany).toHaveBeenCalledOnce();
    expect(tx.programEnrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { goalSnapshot: {} } }),
    );
    expect(tx.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: scope.workspaceId,
          requestedBy: scope.actorUserId,
          jobType: 'TRAINING_ANSWER_EVALUATE',
          payloadReference: {
            startsWith: 'training-evaluation:group-a:enrollment-a:',
            endsWith: ':user-a',
          },
        }),
        data: expect.objectContaining({ status: 'CANCELLED', leaseOwner: null }),
      }),
    );
    expect(tx.programAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'TRAINING_PERSONAL_DATA_DELETED',
          afterData: expect.objectContaining({ revision: preview.preview.revision }),
        }),
      }),
    );
  });
  it('rejects a changed preview before any write', async () => {
    const { tx, repository } = fixture();
    const p = await repository.preview(all);
    if (p.outcome !== 'PREVIEW') throw new Error('preview expected');
    tx.trainingMissionAnswer.findMany.mockResolvedValue([
      {
        id: 'answer-a',
        missionAssignmentId: 'assignment-a',
        createdAt: now,
        updatedAt: new Date(now.getTime() + 1),
        evaluationStatus: 'READY',
      },
    ]);
    expect(await repository.delete({ ...all, revision: p.preview.revision, now })).toEqual({
      outcome: 'CONFLICT',
    });
    expect(tx.job.updateMany).not.toHaveBeenCalled();
    expect(tx.trainingMissionAnswer.deleteMany).not.toHaveBeenCalled();
  });
  it('scopes individual answer copies and preserves profile/aggregate scores', async () => {
    const { tx, repository } = fixture();
    const input = { ...scope, target: { kind: 'ANSWER' as const, answerId: 'answer-a' } };
    const p = await repository.preview(input);
    if (p.outcome !== 'PREVIEW') throw new Error('preview expected');
    expect(await repository.delete({ ...input, revision: p.preview.revision, now })).toMatchObject({
      outcome: 'DELETED',
    });
    expect(tx.trainingToolkitItem.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        userId: scope.actorUserId,
        programEnrollmentId: scope.programEnrollmentId,
        trainingMissionAnswerId: { in: ['answer-a'] },
      },
    });
    expect(tx.trainingParticipantProfile.deleteMany).not.toHaveBeenCalled();
    expect(tx.programMissionAssignment.deleteMany).not.toHaveBeenCalled();
    expect(tx.programActionEvent.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        actorUserId: scope.actorUserId,
        OR: expect.any(Array),
        eventType: { not: 'TRAINING_ENROLLMENT_EXPIRED' },
      }),
    });
  });
  it('rejects missing owners/enrollments/modules and oversize data without writes', async () => {
    for (const name of ['groupMembership', 'programEnrollment', 'serviceProgram'] as const) {
      const { tx, repository } = fixture();
      tx[name].findFirst.mockResolvedValue(null);
      expect(await repository.preview(all)).toEqual({ outcome: 'NOT_FOUND' });
      expect(await repository.delete({ ...all, revision: 'a'.repeat(64), now })).toEqual({
        outcome: 'NOT_FOUND',
      });
      expect(tx.trainingMissionAnswer.deleteMany).not.toHaveBeenCalled();
    }
    const { tx, repository } = fixture();
    tx.trainingMissionAnswer.findMany.mockResolvedValue(
      Array.from({ length: 2001 }, (_, index) => ({
        id: String(index),
        missionAssignmentId: 'a',
        createdAt: now,
        updatedAt: now,
        evaluationStatus: 'READY',
      })),
    );
    expect(await repository.preview(all)).toEqual({ outcome: 'TOO_LARGE' });
    expect(await repository.delete({ ...all, revision: 'a'.repeat(64), now })).toEqual({
      outcome: 'TOO_LARGE',
    });
    expect(tx.trainingMissionAnswer.deleteMany).not.toHaveBeenCalled();
  });
  it('handles a confirmed retry without erasing fresh data and propagates database failures', async () => {
    const { tx, repository } = fixture();
    tx.programAuditLog.findFirst.mockResolvedValue({ id: 'audit-a' });
    expect(await repository.delete({ ...all, revision: 'a'.repeat(64), now })).toMatchObject({
      outcome: 'ALREADY_DELETED',
    });
    expect(tx.trainingMissionAnswer.findMany).not.toHaveBeenCalled();
    tx.$queryRaw.mockRejectedValue(new Error('database offline'));
    await expect(repository.delete({ ...all, revision: 'a'.repeat(64), now })).rejects.toThrow(
      'database offline',
    );
  });
});
