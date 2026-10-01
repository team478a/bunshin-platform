import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  expireUnpurchasedTrainingEnrollments,
  previewUnpurchasedTrainingEnrollmentExpiry,
} from '../src';

const now = new Date('2026-09-29T00:00:00Z');
const input = { workspaceId: 'workspace', groupId: 'group', now };
const candidate = {
  id: 'enrollment',
  groupMembershipId: 'membership',
  serviceProgramId: 'program',
  userId: 'participant',
  updatedAt: new Date('2026-09-28'),
  endsAt: now,
};
function fixture() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    programEnrollment: {
      findFirst: vi.fn().mockResolvedValue({ id: candidate.id }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: candidate.groupMembershipId }) },
    serviceProgram: { findFirst: vi.fn().mockResolvedValue({ id: candidate.serviceProgramId }) },
    job: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    trainingMissionAnswer: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    programActionEvent: { create: vi.fn() },
  };
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([candidate]),
    $transaction: vi.fn((callback: (value: typeof tx) => unknown) => Promise.resolve(callback(tx))),
  };
  const expire = () => expireUnpurchasedTrainingEnrollments(db as never, input);
  return { db, tx, expire };
}

describe('unpurchased training expiry', () => {
  it('previews the exact eligible count without starting a write transaction', async () => {
    const { db } = fixture();
    db.$queryRaw.mockResolvedValue([{ eligible: 201 }]);
    expect(await previewUnpurchasedTrainingEnrollmentExpiry(db as never, input)).toEqual({
      eligible: 201,
      batchLimit: 100,
      requiredBatches: 3,
      hasMore: true,
      cutoffAt: now.toISOString(),
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    const sql = db.$queryRaw.mock.calls[0]?.[0] as Prisma.Sql;
    expect(sql.values).toEqual(['workspace', 'group', 'AI_TRAINING_V1', now]);
    expect(sql.text).toContain('COUNT(*)::integer');
    expect(sql.text).toContain('purchase.paid_enrollment_id = e.id');
    expect(sql.text).not.toContain('UPDATE');
  });

  it('returns a zero-count preview when the scoped query has no aggregate row', async () => {
    const { db } = fixture();
    db.$queryRaw.mockResolvedValue([]);
    expect(await previewUnpurchasedTrainingEnrollmentExpiry(db as never, input)).toMatchObject({
      eligible: 0,
      requiredBatches: 0,
      hasMore: false,
    });
  });

  it('limits the initial scan by service, module, ownership, date and purchase boundary', async () => {
    const { db, expire } = fixture();
    await expire();
    const sql = db.$queryRaw.mock.calls[0]?.[0] as Prisma.Sql;
    expect(sql.values).toEqual(['workspace', 'group', 'AI_TRAINING_V1', now, 101]);
    expect(sql.text).toContain('m.workspace_id = e.workspace_id AND m.group_id = e.group_id');
    expect(sql.text).toContain('p.workspace_id = e.workspace_id AND p.group_id = e.group_id');
    expect(sql.text).toContain("m.service_role = 'PARTICIPANT'");
    expect(sql.text).toContain("e.status = 'ACTIVE' AND e.starts_at IS NOT NULL");
    expect(sql.text).toContain('e.starts_at <= e.ends_at AND e.ends_at <=');
    expect(sql.text).toContain('purchase.paid_enrollment_id = e.id');
  });

  it('locks, revalidates scope and CAS, stops only pending evaluations and audits once', async () => {
    const { tx, db, expire } = fixture();
    expect(await expire()).toEqual({
      candidates: 1,
      expired: 1,
      skipped: 0,
      conflicts: 0,
      hasMore: false,
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.programEnrollment.findFirst.mock.invocationCallOrder[0]!,
    );
    const where = {
      workspaceId: 'workspace',
      groupId: 'group',
      id: 'enrollment',
      groupMembershipId: 'membership',
      serviceProgramId: 'program',
      status: 'ACTIVE',
      updatedAt: candidate.updatedAt,
      endsAt: now,
      startsAt: { not: null, lte: now },
      paidPurchase: null,
    };
    expect(tx.programEnrollment.updateMany).toHaveBeenCalledWith({
      where,
      data: { status: 'EXPIRED' },
    });
    expect(tx.groupMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace',
          groupId: 'group',
          id: 'membership',
          userId: 'participant',
          serviceRole: 'PARTICIPANT',
          group: { workspaceId: 'workspace' },
        },
      }),
    );
    expect(tx.serviceProgram.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace',
          groupId: 'group',
          id: 'program',
          settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
        },
      }),
    );
    expect(tx.job.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        requestedBy: 'participant',
        jobType: 'TRAINING_ANSWER_EVALUATE',
        status: { in: ['PENDING', 'LEASED', 'RETRY_SCHEDULED'] },
        payloadReference: { startsWith: 'training-evaluation:group:enrollment:' },
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextRetryAt: null,
      },
    });
    expect(tx.trainingMissionAnswer.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        groupId: 'group',
        programEnrollmentId: 'enrollment',
        userId: 'participant',
        evaluationStatus: 'PENDING',
      },
      data: { evaluationStatus: 'FAILED' },
    });
    expect(tx.programActionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: null,
          eventType: 'TRAINING_ENROLLMENT_EXPIRED',
          metadata: expect.objectContaining({ source: 'SYSTEM', endsAt: now.toISOString() }),
        }),
      }),
    );
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      timeout: 30000,
    });
  });

  it.each(['enrollment', 'member', 'program', 'cas'])(
    'skips changed ownership, period, module, purchase or state: %s',
    async (kind) => {
      const { tx, expire } = fixture();
      if (kind === 'enrollment') tx.programEnrollment.findFirst.mockResolvedValue(null);
      if (kind === 'member') tx.groupMembership.findFirst.mockResolvedValue(null);
      if (kind === 'program') tx.serviceProgram.findFirst.mockResolvedValue(null);
      if (kind === 'cas') tx.programEnrollment.updateMany.mockResolvedValue({ count: 0 });
      expect(await expire()).toMatchObject({ expired: 0, skipped: 1 });
      expect(tx.job.updateMany).not.toHaveBeenCalled();
      expect(tx.programActionEvent.create).not.toHaveBeenCalled();
    },
  );

  it('does nothing for a repeated batch with no remaining ACTIVE candidates', async () => {
    const { db, tx, expire } = fixture();
    await expire();
    db.$queryRaw.mockResolvedValue([]);
    expect(await expire()).toMatchObject({ candidates: 0, expired: 0 });
    expect(tx.programActionEvent.create).toHaveBeenCalledTimes(1);
  });

  it('bounds work at 100 candidates and exposes the sentinel', async () => {
    const { db, expire } = fixture();
    db.$queryRaw.mockResolvedValue(Array.from({ length: 101 }, () => candidate));
    expect(await expire()).toMatchObject({ candidates: 100, expired: 100, hasMore: true });
    expect(db.$transaction).toHaveBeenCalledTimes(100);
  });

  it('rejects future candidates even if a malformed scan returns one', async () => {
    const { db, expire } = fixture();
    db.$queryRaw.mockResolvedValue([{ ...candidate, endsAt: new Date(now.getTime() + 1) }]);
    expect(await expire()).toMatchObject({ expired: 0, skipped: 1 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(['P2034', 'P2010'])(
    'reports serialization conflicts without claiming expiry: %s',
    async (code) => {
      const { tx, expire } = fixture();
      tx.$queryRaw.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code,
          clientVersion: 'test',
          meta: { code: '40001' },
        }),
      );
      expect(await expire()).toMatchObject({ expired: 0, conflicts: 1 });
      expect(tx.programActionEvent.create).not.toHaveBeenCalled();
    },
  );

  it.each(['scan', 'stop', 'audit'])(
    'propagates unknown failures without returning success: %s',
    async (kind) => {
      const { db, tx, expire } = fixture();
      if (kind === 'scan') db.$queryRaw.mockRejectedValue(new Error('db failed'));
      if (kind === 'stop') tx.job.updateMany.mockRejectedValue(new Error('db failed'));
      if (kind === 'audit') tx.programActionEvent.create.mockRejectedValue(new Error('db failed'));
      await expect(expire()).rejects.toThrow('db failed');
    },
  );

  it('rejects an invalid cutoff before any query', async () => {
    const { db } = fixture();
    await expect(
      expireUnpurchasedTrainingEnrollments(db as never, { ...input, now: new Date('invalid') }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects an invalid preview cutoff before any query', async () => {
    const { db } = fixture();
    await expect(
      previewUnpurchasedTrainingEnrollmentExpiry(db as never, {
        ...input,
        now: new Date('invalid'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
