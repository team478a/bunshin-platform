import { describe, expect, it, vi } from 'vitest';
import { PrismaTrainingLifecycleRepository } from '../src';
const now = new Date('2026-09-29T00:00:00Z');
const input = {
  workspaceId: 'w',
  groupId: 'g',
  programEnrollmentId: 'e',
  actorUserId: 'admin',
  action: 'COMPLETE' as const,
  expectedStatus: 'ACTIVE' as const,
  expectedUpdatedAt: now,
  operationId: 'operation',
  reason: 'Training ended',
  now,
};
function fixture() {
  const member = { userId: 'participant', status: 'ACTIVE', user: { status: 'ACTIVE' } };
  const current = {
    status: 'ACTIVE',
    updatedAt: now,
    startsAt: new Date('2026-09-01'),
    endsAt: null as Date | null,
    serviceProgramId: 'program',
  };
  const tx = {
    $queryRaw: vi.fn(),
    groupMembership: {
      findFirst: vi.fn().mockResolvedValueOnce({ id: 'admin' }).mockResolvedValue(member),
    },
    programEnrollment: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({ groupMembershipId: 'membership' })
        .mockResolvedValue(current),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    serviceProgram: { findFirst: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    programAuditLog: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    job: { updateMany: vi.fn() },
    trainingMissionAnswer: { updateMany: vi.fn() },
  };
  const client = {
    $transaction: vi.fn((callback: (value: typeof tx) => unknown) => Promise.resolve(callback(tx))),
  };
  return {
    tx,
    current,
    member,
    repository: new PrismaTrainingLifecycleRepository(client as never),
  };
}
describe('training enrollment lifecycle', () => {
  it('locks, stops pending evaluations and audits without deleting data', async () => {
    const { tx, repository } = fixture();
    expect(await repository.change(input)).toEqual({ outcome: 'APPLIED', status: 'COMPLETED' });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.programEnrollment.updateMany.mock.invocationCallOrder[0]!,
    );
    expect(tx.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'w',
          requestedBy: 'participant',
          payloadReference: { startsWith: 'training-evaluation:g:e:' },
        }),
      }),
    );
    expect(tx.trainingMissionAnswer.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'w',
        groupId: 'g',
        programEnrollmentId: 'e',
        userId: 'participant',
        evaluationStatus: 'PENDING',
      },
      data: { evaluationStatus: 'FAILED' },
    });
    expect(tx.programAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ performedByUserId: 'admin', action: 'TRAINING_COMPLETE' }),
      }),
    );
  });
  it('requires an active scoped manager and rejects participants/editors/foreign managers', async () => {
    const { tx, repository } = fixture();
    tx.groupMembership.findFirst.mockReset().mockResolvedValue(null);
    expect(await repository.change(input)).toEqual({ outcome: 'FORBIDDEN' });
    expect(tx.groupMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'w',
          groupId: 'g',
          serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
        }),
      }),
    );
    expect(tx.programEnrollment.updateMany).not.toHaveBeenCalled();
  });
  it.each(['enrollment', 'member', 'program'])('rejects missing/cross-scope %s', async (kind) => {
    const { tx, repository } = fixture();
    if (kind === 'enrollment') tx.programEnrollment.findFirst.mockReset().mockResolvedValue(null);
    if (kind === 'member')
      tx.groupMembership.findFirst
        .mockReset()
        .mockResolvedValueOnce({ id: 'admin' })
        .mockResolvedValue(null);
    if (kind === 'program') tx.serviceProgram.findFirst.mockResolvedValue(null);
    expect(await repository.change(input)).toEqual({ outcome: 'NOT_FOUND' });
    expect(tx.programEnrollment.updateMany).not.toHaveBeenCalled();
  });
  it('rejects stale confirmation', async () => {
    const { tx, current, repository } = fixture();
    current.updatedAt = new Date(now.getTime() + 1);
    expect(await repository.change(input)).toEqual({ outcome: 'CONFLICT' });
    expect(tx.job.updateMany).not.toHaveBeenCalled();
  });
  it('replays only the same confirmed operation', async () => {
    const { tx, repository } = fixture();
    tx.programAuditLog.findFirst.mockResolvedValue({
      afterData: {
        expectedStatus: 'ACTIVE',
        expectedUpdatedAt: now.toISOString(),
        reason: input.reason,
      },
    });
    expect(await repository.change(input)).toEqual({
      outcome: 'ALREADY_APPLIED',
      status: 'COMPLETED',
    });
    expect(tx.programEnrollment.updateMany).not.toHaveBeenCalled();
    expect(await repository.change({ ...input, reason: 'changed' })).toEqual({
      outcome: 'CONFLICT',
    });
  });
  it('reopens valid ended enrollment without auto-enqueuing or changing contracts', async () => {
    const { tx, current, repository } = fixture();
    current.status = 'COMPLETED';
    expect(
      await repository.change({ ...input, action: 'REOPEN', expectedStatus: 'COMPLETED' }),
    ).toEqual({ outcome: 'APPLIED', status: 'ACTIVE' });
    expect(tx.programEnrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE' } }),
    );
    expect(tx.job.updateMany).not.toHaveBeenCalled();
  });
  it.each(['period', 'membership', 'program', 'account', 'notStarted'])(
    'blocks unavailable reopening: %s',
    async (kind) => {
      const { tx, current, member, repository } = fixture();
      current.status = 'EXPIRED';
      if (kind === 'period') current.endsAt = now;
      if (kind === 'membership') member.status = 'REVOKED';
      if (kind === 'account') member.user.status = 'SUSPENDED';
      if (kind === 'program')
        tx.serviceProgram.findFirst.mockResolvedValue({ status: 'SUSPENDED' });
      if (kind === 'notStarted') current.startsAt = new Date(now.getTime() + 1000);
      expect(
        await repository.change({ ...input, action: 'REOPEN', expectedStatus: 'EXPIRED' }),
      ).toEqual({ outcome: 'REOPEN_UNAVAILABLE' });
      expect(tx.programEnrollment.updateMany).not.toHaveBeenCalled();
    },
  );
  it('propagates transaction failure instead of reporting completion', async () => {
    const { tx, repository } = fixture();
    tx.job.updateMany.mockRejectedValue(new Error('db failure'));
    await expect(repository.change(input)).rejects.toThrow('db failure');
    expect(tx.programAuditLog.create).not.toHaveBeenCalled();
  });
});
