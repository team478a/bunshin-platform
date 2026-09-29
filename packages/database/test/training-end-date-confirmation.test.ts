import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaTrainingEndDateRepository } from '../src';

const input = {
  workspaceId: 'w',
  groupId: 'g',
  programEnrollmentId: 'e',
  actorUserId: 'admin',
  endedAt: new Date('2025-08-01T00:00:00Z'),
  reason: 'Reviewed end notice',
  now: new Date('2026-09-29T00:00:00Z'),
};
function fixture() {
  const enrollment = {
    groupMembershipId: 'm',
    status: 'COMPLETED',
    startsAt: new Date('2025-01-01'),
    endsAt: null as Date | null,
    updatedAt: new Date('2025-08-02'),
    serviceProgramId: 'p',
  };
  const state = {
    endedAt: null as Date | null,
    workRedactedAt: null as Date | null,
    progressPurgedAt: null as Date | null,
    updatedAt: new Date('2025-08-02'),
  };
  const tx = {
    $queryRaw: vi.fn(),
    groupMembership: {
      findFirst: vi
        .fn()
        .mockImplementation((arg: { where: { userId?: string } }) =>
          Promise.resolve(arg.where.userId ? { id: 'admin' } : { userId: 'participant' }),
        ),
    },
    programEnrollment: {
      findFirst: vi.fn().mockResolvedValue(enrollment),
      findMany: vi.fn().mockResolvedValue([{ ...enrollment, id: 'e' }]),
    },
    serviceProgram: {
      findFirst: vi.fn().mockResolvedValue({ id: 'p' }),
      findMany: vi.fn().mockResolvedValue([{ id: 'p', displayName: 'Archived training' }]),
    },
    trainingDataRetentionState: {
      findFirst: vi.fn().mockResolvedValue(state),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    programAuditLog: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
  };
  const client = {
    $transaction: vi.fn((callback: (value: typeof tx) => unknown) => Promise.resolve(callback(tx))),
  };
  const repo = new PrismaTrainingEndDateRepository(client as never);
  async function confirmation() {
    const result = await repo.preview(input);
    if (result.outcome !== 'PREVIEW') throw new Error('preview expected');
    return { ...input, revision: result.preview.revision, operationId: 'operation' };
  }
  return { tx, client, enrollment, state, repo, confirmation };
}
describe('individual training end date confirmation', () => {
  it('lists unresolved owned historical enrollments without learning data or email', async () => {
    const f = fixture();
    f.tx.groupMembership.findFirst.mockImplementation((arg) =>
      Promise.resolve(
        arg.where.userId ? { id: 'admin' } : { user: { displayName: 'Participant' } },
      ),
    );
    expect(await f.repo.listUnresolved(input)).toMatchObject({
      outcome: 'ROWS',
      rows: [
        { enrollmentId: 'e', participantLabel: 'Participant', programLabel: 'Archived training' },
      ],
    });
    expect(f.tx.serviceProgram.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'w',
          groupId: 'g',
          settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
        },
      }),
    );
    expect(f.tx.groupMembership.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'w', groupId: 'g', id: 'm', serviceRole: 'PARTICIPANT' },
      select: { user: { select: { displayName: true } } },
    });
    expect(f.tx.trainingDataRetentionState.updateMany).not.toHaveBeenCalled();
  });
  it('omits broken ownership without declaring it repaired', async () => {
    const f = fixture();
    f.tx.groupMembership.findFirst.mockImplementation((arg) =>
      Promise.resolve(arg.where.userId ? { id: 'admin' } : null),
    );
    expect(await f.repo.listUnresolved(input)).toEqual({ outcome: 'ROWS', rows: [] });
  });
  it.each(['enrollments', 'programs'])(
    'rejects oversized %s without partial list',
    async (kind) => {
      const f = fixture();
      if (kind === 'enrollments')
        f.tx.programEnrollment.findMany.mockResolvedValue(
          Array.from({ length: 101 }, () => ({ ...f.enrollment, id: 'e' })),
        );
      else
        f.tx.serviceProgram.findMany.mockResolvedValue(
          Array.from({ length: 1001 }, () => ({ id: 'p', displayName: 'Program' })),
        );
      expect(await f.repo.listUnresolved(input)).toEqual({ outcome: 'TOO_LARGE' });
    },
  );
  it('previews only metadata and due flags without writing or reading learning data', async () => {
    const { repo, tx, client } = fixture();
    expect(await repo.preview(input)).toMatchObject({
      outcome: 'PREVIEW',
      preview: {
        status: 'COMPLETED',
        endedAt: input.endedAt.toISOString(),
        workInformationDue: true,
        progressAndScoresDue: true,
      },
    });
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(tx.trainingDataRetentionState.updateMany).not.toHaveBeenCalled();
    expect(tx.programAuditLog.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.programEnrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'w', groupId: 'g', id: 'e' }),
        select: expect.objectContaining({ status: true, updatedAt: true }),
      }),
    );
  });
  it('locks and CAS updates only the unresolved end date and creates minimal audit', async () => {
    const { tx, repo, confirmation } = fixture();
    expect(await repo.confirm(await confirmation())).toEqual({
      outcome: 'APPLIED',
      endedAt: input.endedAt.toISOString(),
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.trainingDataRetentionState.updateMany.mock.invocationCallOrder[0]!,
    );
    expect(tx.trainingDataRetentionState.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'w',
        groupId: 'g',
        programEnrollmentId: 'e',
        endedAt: null,
        workRedactedAt: null,
        progressPurgedAt: null,
        updatedAt: new Date('2025-08-02'),
      },
      data: { endedAt: input.endedAt },
    });
    expect(tx.programAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'w',
          groupId: 'g',
          resourceId: 'e',
          performedByUserId: 'admin',
          action: 'TRAINING_END_DATE_CONFIRMED',
          beforeData: { endedAt: null },
          afterData: expect.objectContaining({
            reason: input.reason,
            endedAt: input.endedAt.toISOString(),
          }),
        }),
      }),
    );
  });
  it('creates missing retention state only after confirmation', async () => {
    const f = fixture();
    f.tx.trainingDataRetentionState.findFirst.mockResolvedValue(null);
    const confirm = await f.confirmation();
    expect(f.tx.trainingDataRetentionState.create).not.toHaveBeenCalled();
    expect((await f.repo.confirm(confirm)).outcome).toBe('APPLIED');
    expect(f.tx.trainingDataRetentionState.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'w',
        groupId: 'g',
        programEnrollmentId: 'e',
      },
    });
  });
  it('requires active service owner/admin in the same workspace and group', async () => {
    const f = fixture();
    f.tx.groupMembership.findFirst.mockResolvedValue(null);
    expect(await f.repo.preview(input)).toEqual({ outcome: 'FORBIDDEN' });
    expect(await f.repo.confirm({ ...input, revision: 'x', operationId: 'o' })).toEqual({
      outcome: 'FORBIDDEN',
    });
    expect(f.tx.groupMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'w',
          groupId: 'g',
          userId: 'admin',
          status: 'ACTIVE',
          serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
          user: { status: 'ACTIVE' },
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
        },
      }),
    );
    expect(f.tx.trainingDataRetentionState.updateMany).not.toHaveBeenCalled();
  });
  it.each(['enrollment', 'member', 'module'])('rejects missing/foreign %s', async (kind) => {
    const f = fixture();
    if (kind === 'enrollment') f.tx.programEnrollment.findFirst.mockResolvedValue(null);
    if (kind === 'member')
      f.tx.groupMembership.findFirst.mockImplementation((arg) =>
        Promise.resolve(arg.where.userId ? { id: 'admin' } : null),
      );
    if (kind === 'module') f.tx.serviceProgram.findFirst.mockResolvedValue(null);
    expect(await f.repo.preview(input)).toEqual({ outcome: 'NOT_FOUND' });
    expect(f.tx.trainingDataRetentionState.updateMany).not.toHaveBeenCalled();
  });
  it.each(['ACTIVE', 'INVITED', 'knownEnd', 'knownExpiry', 'workProcessed', 'progressProcessed'])(
    'refuses noneligible or already established dates: %s',
    async (kind) => {
      const f = fixture();
      if (kind === 'ACTIVE' || kind === 'INVITED') f.enrollment.status = kind;
      if (kind === 'knownEnd') f.state.endedAt = input.endedAt;
      if (kind === 'knownExpiry') {
        f.enrollment.status = 'EXPIRED';
        f.enrollment.endsAt = input.endedAt;
      }
      if (kind === 'workProcessed') f.state.workRedactedAt = input.now;
      if (kind === 'progressProcessed') f.state.progressPurgedAt = input.now;
      expect(await f.repo.preview(input)).toEqual({ outcome: 'CONFLICT' });
    },
  );
  it.each([new Date('invalid'), new Date('2026-10-01'), new Date('2024-12-31')])(
    'rejects invalid, future and before-start dates: %s',
    async (endedAt) => {
      const f = fixture();
      expect(await f.repo.preview({ ...input, endedAt })).toEqual({ outcome: 'INVALID_DATE' });
    },
  );
  it.each(['reason', 'date', 'actor', 'enrollmentRevision', 'stateRevision', 'reopened'])(
    'rejects stale or altered confirmation: %s',
    async (kind) => {
      const f = fixture();
      const confirm = await f.confirmation();
      if (kind === 'reason') confirm.reason = 'Different evidence';
      if (kind === 'date') confirm.endedAt = new Date('2025-08-03');
      if (kind === 'actor') confirm.actorUserId = 'other-admin';
      if (kind === 'enrollmentRevision') f.enrollment.updatedAt = input.now;
      if (kind === 'stateRevision') f.state.updatedAt = input.now;
      if (kind === 'reopened') f.enrollment.status = 'ACTIVE';
      expect(await f.repo.confirm(confirm)).toEqual({ outcome: 'CONFLICT' });
      expect(f.tx.trainingDataRetentionState.updateMany).not.toHaveBeenCalled();
    },
  );
  it('replays exactly the same operation, but never after reopening or parameter changes', async () => {
    const f = fixture();
    const confirm = await f.confirmation();
    await f.repo.confirm(confirm);
    const audit = f.tx.programAuditLog.create.mock.calls[0]![0];
    f.tx.programAuditLog.findFirst.mockResolvedValue({ afterData: audit.data.afterData });
    f.state.endedAt = input.endedAt;
    f.tx.trainingDataRetentionState.updateMany.mockClear();
    expect((await f.repo.confirm(confirm)).outcome).toBe('ALREADY_APPLIED');
    expect((await f.repo.confirm({ ...confirm, reason: 'changed' })).outcome).toBe('CONFLICT');
    f.enrollment.status = 'ACTIVE';
    f.state.endedAt = null;
    expect((await f.repo.confirm(confirm)).outcome).toBe('CONFLICT');
    expect(f.tx.trainingDataRetentionState.updateMany).not.toHaveBeenCalled();
  });
  it('rolls back CAS failure and exposes serialization conflicts, but propagates DB failures', async () => {
    const f = fixture();
    const confirm = await f.confirmation();
    f.tx.trainingDataRetentionState.updateMany.mockResolvedValue({ count: 0 });
    expect((await f.repo.confirm(confirm)).outcome).toBe('CONFLICT');
    expect(f.tx.programAuditLog.create).not.toHaveBeenCalled();
    f.tx.trainingDataRetentionState.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('retry', { code: 'P2034', clientVersion: 'test' }),
    );
    expect((await f.repo.confirm(confirm)).outcome).toBe('CONFLICT');
    f.tx.trainingDataRetentionState.updateMany.mockRejectedValue(new Error('db down'));
    await expect(f.repo.confirm(confirm)).rejects.toThrow('db down');
  });
});
