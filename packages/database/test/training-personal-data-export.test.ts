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
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-a' }) },
    programEnrollment: {
      findFirst: vi
        .fn()
        .mockResolvedValue({
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
      findMany: vi
        .fn()
        .mockResolvedValue([
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
    expect(tx.trainingParticipantProfile.findFirst.mock.calls[0]?.[0].select).not.toHaveProperty(
      'updatedByUserId',
    );
    expect(tx.serviceProgram.findFirst.mock.calls[0]?.[0].where).not.toHaveProperty('status');
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
});
