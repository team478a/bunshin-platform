import { describe, expect, it, vi } from 'vitest';
import { PrismaTrainingRetentionExecutionRepository } from '../src';

const now = new Date('2026-09-28T00:00:00Z');
const input = {
  workspaceId: 'workspace',
  groupId: 'group',
  programEnrollmentId: 'enrollment',
  operatorUserId: 'admin',
  now,
};
function fixture() {
  const table = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  });
  const enrollment = {
    id: 'enrollment',
    groupMembershipId: 'membership',
    serviceProgramId: 'program',
    status: 'EXPIRED',
    endsAt: new Date('2026-06-20'),
    updatedAt: now,
  };
  const tx = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    platformAdmin: { findFirst: vi.fn().mockResolvedValue({ id: 'admin' }) },
    programEnrollment: { findFirst: vi.fn().mockResolvedValue(enrollment), updateMany: vi.fn() },
    groupMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'membership', userId: 'participant' }),
    },
    serviceProgram: { findFirst: vi.fn().mockResolvedValue({ id: 'program' }) },
    trainingDataRetentionState: { findFirst: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    trainingMissionAnswer: {
      ...table(),
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'answer', missionAssignmentId: 'assignment', updatedAt: now }]),
    },
    trainingToolkitItem: { count: vi.fn().mockResolvedValue(1) },
    trainingParticipantProfile: {
      ...table(),
      findMany: vi.fn().mockResolvedValue([{ id: 'profile', updatedAt: now }]),
    },
    programMissionAssignment: {
      ...table(),
      findMany: vi.fn().mockResolvedValue([{ id: 'assignment', updatedAt: now }]),
    },
    programProgressSnapshot: table(),
    programMemberGoal: table(),
    programMemberPreference: table(),
    programActionEvent: table(),
    job: { updateMany: vi.fn() },
    programAuditLog: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
  };
  const client = {
    $transaction: vi.fn((callback: (value: typeof tx) => unknown) => Promise.resolve(callback(tx))),
  };
  return {
    tx,
    enrollment,
    repository: new PrismaTrainingRetentionExecutionRepository(client as never),
  };
}
async function revision(repository: PrismaTrainingRetentionExecutionRepository) {
  const preview = await repository.preview(input);
  if (preview.outcome !== 'PREVIEW') throw new Error('preview required');
  return preview.preview.revision;
}
describe('training retention execution', () => {
  it('rejects oversized snapshots before any mutation', async () => {
    const { tx, repository } = fixture();
    tx.trainingMissionAnswer.findMany.mockResolvedValue(
      Array.from({ length: 2001 }, (_, index) => ({
        id: `answer-${index}`,
        missionAssignmentId: 'assignment',
        updatedAt: now,
      })),
    );
    expect(await repository.execute({ ...input, revision: 'a'.repeat(64) })).toEqual({
      outcome: 'TOO_LARGE',
    });
    expect(tx.trainingMissionAnswer.deleteMany).not.toHaveBeenCalled();
  });
  it('rejects enrollment ownership revoked while waiting for the lock', async () => {
    const { tx, repository } = fixture();
    tx.groupMembership.findFirst
      .mockResolvedValueOnce({ id: 'membership', userId: 'participant' })
      .mockResolvedValueOnce(null);
    expect(await repository.execute({ ...input, revision: 'a'.repeat(64) })).toEqual({
      outcome: 'NOT_FOUND',
    });
    expect(tx.trainingMissionAnswer.deleteMany).not.toHaveBeenCalled();
  });
  it('previews without returning text or performing writes', async () => {
    const { tx, repository } = fixture();
    expect(await repository.preview(input)).toMatchObject({
      outcome: 'PREVIEW',
      preview: { counts: { answers: 1, workProfiles: 1, retainedToolkit: 1 } },
    });
    expect(tx.trainingMissionAnswer.deleteMany).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('erases expired answers and work copies while retaining Toolkit and scores', async () => {
    const { tx, repository } = fixture();
    expect(
      await repository.execute({ ...input, revision: await revision(repository) }),
    ).toMatchObject({ outcome: 'APPLIED' });
    expect(tx.trainingMissionAnswer.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        groupId: 'group',
        programEnrollmentId: 'enrollment',
        userId: 'participant',
        id: { in: ['answer'] },
      },
    });
    expect(tx.trainingParticipantProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          role: 'OTHER',
          workContext: {},
          aiUseCases: [],
          workChallenges: [],
          preferredTopics: [],
          learningGoalKey: null,
        },
      }),
    );
    expect(tx.trainingParticipantProfile.deleteMany).not.toHaveBeenCalled();
    expect(tx.programProgressSnapshot.deleteMany).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          requestedBy: 'participant',
          payloadReference: { in: ['training-evaluation:group:enrollment:answer:participant'] },
        }),
      }),
    );
    expect(tx.trainingDataRetentionState.upsert).toHaveBeenCalled();
    expect(tx.programAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ performedByUserId: 'admin' }) }),
    );
  });
  it('purges expired year-old progress but never calls a Toolkit delete', async () => {
    const { tx, repository, enrollment } = fixture();
    enrollment.endsAt = new Date('2025-09-28');
    await repository.execute({ ...input, revision: await revision(repository) });
    expect(tx.trainingParticipantProfile.deleteMany).toHaveBeenCalled();
    expect(tx.programProgressSnapshot.deleteMany).toHaveBeenCalled();
    expect(tx.programMissionAssignment.deleteMany).toHaveBeenCalled();
    expect(tx.trainingDataRetentionState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { workRedactedAt: now, progressPurgedAt: now } }),
    );
  });
  it('refuses changed confirmation snapshots without writes', async () => {
    const { tx, repository } = fixture();
    expect(await repository.execute({ ...input, revision: 'a'.repeat(64) })).toEqual({
      outcome: 'CONFLICT',
    });
    expect(tx.job.updateMany).not.toHaveBeenCalled();
    expect(tx.trainingMissionAnswer.deleteMany).not.toHaveBeenCalled();
  });
  it('recognizes retries before inspecting new targets', async () => {
    const { tx, repository } = fixture();
    tx.programAuditLog.findFirst.mockResolvedValue({ id: 'existing' });
    expect(await repository.execute({ ...input, revision: 'a'.repeat(64) })).toMatchObject({
      outcome: 'ALREADY_APPLIED',
      counts: { answers: 0, retainedToolkit: 1 },
    });
    expect(tx.trainingMissionAnswer.findMany).not.toHaveBeenCalled();
    expect(tx.trainingMissionAnswer.deleteMany).not.toHaveBeenCalled();
  });
  it('verifies the operator is an active platform administrator', async () => {
    const { tx, repository } = fixture();
    tx.platformAdmin.findFirst.mockResolvedValue(null);
    expect(await repository.execute({ ...input, revision: 'a'.repeat(64) })).toEqual({
      outcome: 'FORBIDDEN',
    });
    expect(tx.groupMembership.findFirst).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('does not guess old completed end dates', async () => {
    const { repository, enrollment } = fixture();
    enrollment.status = 'COMPLETED';
    expect(await repository.preview(input)).toMatchObject({
      outcome: 'PREVIEW',
      preview: { endDateUnresolved: true, counts: { workProfiles: 0, progressProfiles: 0 } },
    });
  });
  it('propagates errors so the transaction rolls back rather than reporting success', async () => {
    const { tx, repository } = fixture();
    const confirmed = await revision(repository);
    tx.trainingMissionAnswer.deleteMany.mockRejectedValue(new Error('database failure'));
    await expect(repository.execute({ ...input, revision: confirmed })).rejects.toThrow(
      'database failure',
    );
    expect(tx.programAuditLog.create).not.toHaveBeenCalled();
  });
});
