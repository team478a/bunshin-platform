import { describe, expect, it, vi } from 'vitest';
import { PrismaTrainingRetentionPreviewRepository } from '../src';

const scope = { workspaceId: 'workspace', groupId: 'group', now: new Date('2026-09-28T00:00:00Z') };
function fixture() {
  const enrollment = {
    id: 'enrollment',
    groupMembershipId: 'membership',
    status: 'EXPIRED',
    endsAt: new Date('2025-09-28T00:00:00Z'),
  };
  const tx = {
    trainingDataRetentionState: { findFirst: vi.fn().mockResolvedValue(null) },
    serviceProgram: { findMany: vi.fn().mockResolvedValue([{ id: 'program' }]) },
    programEnrollment: { findMany: vi.fn().mockResolvedValue([enrollment]) },
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ userId: 'user' }) },
    trainingMissionAnswer: { count: vi.fn().mockResolvedValue(2) },
    trainingToolkitItem: { count: vi.fn().mockResolvedValue(1) },
    trainingParticipantProfile: { count: vi.fn().mockResolvedValue(1) },
    programProgressSnapshot: { count: vi.fn().mockResolvedValue(1) },
  };
  const client = {
    $transaction: vi.fn((callback: (value: typeof tx) => unknown) => Promise.resolve(callback(tx))),
  };
  return {
    tx,
    enrollment,
    repository: new PrismaTrainingRetentionPreviewRepository(client as never),
    client,
  };
}
describe('training retention preview', () => {
  it('reads only scoped identifiers and counts, retaining explicitly saved Toolkit', async () => {
    const { repository, tx, client } = fixture();
    expect(await repository.preview(scope)).toEqual({
      outcome: 'PREVIEW',
      summary: {
        mode: 'DRY_RUN',
        policyVersion: 'TRAINING_RETENTION_V1',
        enrollments: 1,
        answersAndEvaluationsDue: 2,
        workProfilesDue: 1,
        scoreProfilesDue: 1,
        progressSnapshotsDue: 1,
        retainedToolkit: 1,
        endDateUnresolved: 0,
        ownershipUnresolved: 0,
      },
    });
    expect(tx.serviceProgram.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace',
          groupId: 'group',
          settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
        },
        select: { id: true },
      }),
    );
    expect(tx.trainingMissionAnswer.count).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        groupId: 'group',
        programEnrollmentId: 'enrollment',
        userId: 'user',
        createdAt: { lte: new Date('2026-06-30T00:00:00Z') },
      },
    });
    expect(tx.trainingParticipantProfile.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user', groupMembershipId: 'membership' }),
      }),
    );
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      timeout: 40_000,
    });
  });
  it.each(['COMPLETED', 'CANCELLED'])(
    'does not mistake a planned endsAt for actual %s completion',
    async (status) => {
      const { repository, tx, enrollment } = fixture();
      enrollment.status = status;
      const result = await repository.preview(scope);
      expect(result).toMatchObject({
        summary: {
          endDateUnresolved: 1,
          workProfilesDue: 0,
          scoreProfilesDue: 0,
          answersAndEvaluationsDue: 2,
        },
      });
      expect(tx.trainingParticipantProfile.count).not.toHaveBeenCalled();
      expect(tx.programProgressSnapshot.count).not.toHaveBeenCalled();
    },
  );
  it('does not expire active work information even after a planned end date', async () => {
    const { repository, enrollment } = fixture();
    enrollment.status = 'ACTIVE';
    expect(await repository.preview(scope)).toMatchObject({
      summary: { endDateUnresolved: 0, workProfilesDue: 0 },
    });
  });
  it('skips inconsistent ownership without reading any personal table', async () => {
    const { repository, tx } = fixture();
    tx.groupMembership.findFirst.mockResolvedValue(null);
    expect(await repository.preview(scope)).toMatchObject({
      summary: { ownershipUnresolved: 1, answersAndEvaluationsDue: 0 },
    });
    expect(tx.trainingMissionAnswer.count).not.toHaveBeenCalled();
    expect(tx.trainingToolkitItem.count).not.toHaveBeenCalled();
  });
  it('refuses oversized enrollment scopes rather than returning partial counts', async () => {
    const { repository, tx, enrollment } = fixture();
    tx.programEnrollment.findMany.mockResolvedValue(Array.from({ length: 101 }, () => enrollment));
    expect(await repository.preview(scope)).toEqual({ outcome: 'TOO_LARGE' });
    expect(tx.groupMembership.findFirst).not.toHaveBeenCalled();
  });
  it('propagates database failures instead of reporting an empty successful preview', async () => {
    const { repository, tx } = fixture();
    tx.trainingMissionAnswer.count.mockRejectedValue(new Error('database unavailable'));
    await expect(repository.preview(scope)).rejects.toThrow('database unavailable');
  });
});
