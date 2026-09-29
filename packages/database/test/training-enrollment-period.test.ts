import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/index', () => ({ prisma: {} }));
import { trainingEnrollmentPeriodWhere } from '../src/training-enrollment-period';
import { PrismaTrainingParticipantProfileRepository } from '../src/training-profile';
import { PrismaTrainingBarrierRepository } from '../src/training-barrier';
import { PrismaTrainingInteractionRepository } from '../src/training-interaction';
import { PrismaTrainingWorkResultRepository } from '../src/training-work-result';
import { PrismaTrainingAnswerRepository } from '../src/training-answer';
import { resolveScope } from '../src/training-runtime-shared';

const now = new Date('2026-09-29T01:00:00Z');
const scope = {
  workspaceId: 'workspace',
  groupId: 'group',
  actorUserId: 'user',
  programEnrollmentId: 'enrollment',
};
function fixture() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership' }) },
    programEnrollment: { findFirst: vi.fn().mockResolvedValue(null) },
    serviceProgram: { findFirst: vi.fn().mockResolvedValue({ id: 'program' }) },
    programActionEvent: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    programMissionAssignment: { findFirst: vi.fn(), update: vi.fn() },
    trainingParticipantProfile: { upsert: vi.fn() },
    trainingMissionAnswer: { create: vi.fn() },
  };
  const client = {
    ...tx,
    $transaction: vi.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
  };
  return { tx, client };
}
describe('AI training period enforcement', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  it('uses inclusive start, exclusive end and permits an open end', () => {
    expect(trainingEnrollmentPeriodWhere(now)).toEqual({
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    });
  });
  it.each(['profile', 'barrier', 'interaction', 'work'] as const)(
    'checks %s writes after locking using wall clock rather than event time',
    async (kind) => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      try {
        const { tx, client } = fixture();
        const input = {
          ...scope,
          occurredAt: new Date('2020-01-01'),
          idempotencyKey: 'operation',
          role: 'OFFICE',
        };
        const result =
          kind === 'profile'
            ? await new PrismaTrainingParticipantProfileRepository(client as never).save(
                input as never,
              )
            : kind === 'barrier'
              ? await new PrismaTrainingBarrierRepository(client as never).record(input as never)
              : kind === 'interaction'
                ? await new PrismaTrainingInteractionRepository(client as never).record(
                    input as never,
                  )
                : await new PrismaTrainingWorkResultRepository(client as never).record(
                    input as never,
                  );
        expect(result).toEqual({ outcome: 'NOT_FOUND' });
        expect(tx.programEnrollment.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              workspaceId: scope.workspaceId,
              groupId: scope.groupId,
              id: scope.programEnrollmentId,
              status: 'ACTIVE',
              groupMembershipId: 'membership',
              AND: [trainingEnrollmentPeriodWhere(now)],
            }),
          }),
        );
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
          tx.programEnrollment.findFirst.mock.invocationCallOrder[0]!,
        );
        expect(tx.programMissionAssignment.findFirst).not.toHaveBeenCalled();
        expect(tx.trainingParticipantProfile.upsert).not.toHaveBeenCalled();
        expect(tx.programActionEvent.create).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it('rechecks submission after a lock wait and does not create an answer when the enrollment expired', async () => {
    const { tx, client } = fixture();
    client.programEnrollment = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'enrollment',
        groupMembershipId: 'membership',
        serviceProgramId: 'program',
      }),
    };
    const result = await new PrismaTrainingAnswerRepository(client as never).submit({
      ...scope,
      occurredAt: now,
      idempotencyKey: 'operation',
      missionAssignmentId: 'assignment',
      answer: 'answer',
    });
    expect(result).toEqual({ outcome: 'NOT_FOUND' });
    expect(tx.programEnrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'enrollment',
          groupMembershipId: 'membership',
          AND: [trainingEnrollmentPeriodWhere(expect.any(Date))],
        }),
      }),
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.programEnrollment.findFirst.mock.invocationCallOrder[0]!,
    );
    expect(tx.trainingMissionAnswer.create).not.toHaveBeenCalled();
  });
  it('scopes runtime period filtering without removing ended-state read access', async () => {
    const { tx } = fixture();
    expect(
      await resolveScope(tx as never, scope, ['ACTIVE', 'COMPLETED', 'EXPIRED'], now),
    ).toBeNull();
    expect(tx.programEnrollment.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'enrollment',
        workspaceId: 'workspace',
        groupId: 'group',
        status: { in: ['ACTIVE', 'COMPLETED', 'EXPIRED'] },
        startsAt: { not: null },
        AND: [{ OR: [{ status: { not: 'ACTIVE' } }, trainingEnrollmentPeriodWhere(now)] }],
      },
    });
    expect(tx.groupMembership.findFirst).not.toHaveBeenCalled();
  });
});
