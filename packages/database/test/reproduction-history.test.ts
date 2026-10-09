import { describe, expect, it, vi } from 'vitest';
import { REPRODUCTION_HISTORY_MAX_EVENTS } from '@bunshin/capability-training';
import { PrismaReproductionHistoryRepository } from '../src';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = {
  workspaceId: id(1),
  groupId: id(2),
  actorUserId: id(3),
  programEnrollmentId: id(4),
  baselineAssignmentId: id(5),
  followUpAssignmentId: id(6),
};
function fixture() {
  const tx = {
    groupMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: id(7), serviceRole: 'PARTICIPANT' }),
    },
    programEnrollment: {
      findFirst: vi.fn().mockResolvedValue({ id: id(4), serviceProgramId: id(8) }),
    },
    serviceProgram: {
      findFirst: vi.fn().mockResolvedValue({
        id: id(8),
        settings: { moduleKey: 'AI_TRAINING_V1', personalLearningPilot: { enabled: false } },
      }),
    },
    personalLearningPilotSeat: { findFirst: vi.fn().mockResolvedValue(null) },
    programAuditLog: { findFirst: vi.fn().mockResolvedValue(null) },
    programMissionAssignment: { findMany: vi.fn().mockResolvedValue([]) },
    trainingMissionAnswer: { findMany: vi.fn().mockResolvedValue([]) },
    programActionEvent: { findMany: vi.fn().mockResolvedValue([]) },
    personalLearningPlanRevision: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const client = {
    $transaction: vi.fn((callback: (value: typeof tx) => unknown) => Promise.resolve(callback(tx))),
  };
  return { tx, client, repository: new PrismaReproductionHistoryRepository(client as never) };
}
describe('EVO-05 R2 owner-only non-mutating Repository', () => {
  it('uses one repeatable snapshot, explicit pair IDs and scope on every query', async () => {
    const { tx, client, repository } = fixture();
    expect(await repository.read(input)).toMatchObject({
      outcome: 'FOUND',
      data: { status: 'UNKNOWN', reason: 'ASSIGNMENT_MISSING' },
    });
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(tx.groupMembership.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      workspaceId: id(1),
      groupId: id(2),
      userId: id(3),
      status: 'ACTIVE',
      user: { status: 'ACTIVE' },
    });
    expect(tx.programEnrollment.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      workspaceId: id(1),
      groupId: id(2),
      id: id(4),
      groupMembershipId: id(7),
    });
    for (const method of [
      tx.programMissionAssignment.findMany,
      tx.trainingMissionAnswer.findMany,
      tx.programActionEvent.findMany,
    ]) {
      expect(method.mock.calls[0]?.[0].where).toMatchObject({
        workspaceId: id(1),
        groupId: id(2),
        programEnrollmentId: id(4),
      });
    }
    expect(tx.programMissionAssignment.findMany.mock.calls[0]?.[0].where.id).toEqual({
      in: [id(5), id(6)],
    });
    expect(tx.trainingMissionAnswer.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: id(3), missionAssignmentId: { in: [id(5), id(6)] } },
    });
    expect(tx.trainingMissionAnswer.findMany.mock.calls[0]?.[0].select).not.toHaveProperty(
      'answer',
    );
    expect(tx.programActionEvent.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { actorUserId: id(3), missionAssignmentId: { in: [id(5), id(6)] } },
      take: REPRODUCTION_HISTORY_MAX_EVENTS + 1,
    });
    expect(tx.serviceProgram.findFirst.mock.calls[0]?.[0].where).not.toHaveProperty('status');
  });
  it.each(['groupMembership', 'programEnrollment', 'serviceProgram'] as const)(
    'denies missing/foreign/inactive %s before history reads',
    async (key) => {
      const { tx, repository } = fixture();
      tx[key].findFirst.mockResolvedValue(null);
      expect(await repository.read(input)).toEqual({ outcome: 'NOT_FOUND' });
      expect(tx.programMissionAssignment.findMany).not.toHaveBeenCalled();
    },
  );
  it('rejects old V1 rather than extending its runtime', async () => {
    const { tx, repository } = fixture();
    tx.serviceProgram.findFirst.mockResolvedValue({
      id: id(8),
      settings: { moduleKey: 'AI_TRAINING_V1' },
    });
    expect(await repository.read(input)).toEqual({ outcome: 'NOT_FOUND' });
    expect(tx.programActionEvent.findMany).not.toHaveBeenCalled();
  });
  it('reuses R0 INTERNAL owner Privacy history even when Pilot is OFF and seat revoked', async () => {
    const { tx, repository } = fixture();
    tx.groupMembership.findFirst.mockResolvedValue({ id: id(7), serviceRole: 'SERVICE_OWNER' });
    expect(await repository.read(input)).toEqual({ outcome: 'NOT_FOUND' });
    expect(tx.programActionEvent.findMany).not.toHaveBeenCalled();
    tx.personalLearningPilotSeat.findFirst.mockResolvedValue({
      programEnrollmentId: id(4),
      revokedAt: new Date(),
    });
    expect((await repository.read(input)).outcome).toBe('FOUND');
    expect(tx.personalLearningPilotSeat.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      workspaceId: id(1),
      groupId: id(2),
      serviceProgramId: id(8),
      kind: 'INTERNAL',
      cohort: 'INTERNAL',
    });
  });
  it('requires own ALL deletion evidence for a detached INTERNAL seat', async () => {
    const { tx, repository } = fixture();
    tx.groupMembership.findFirst.mockResolvedValue({ id: id(7), serviceRole: 'SERVICE_OWNER' });
    tx.personalLearningPilotSeat.findFirst.mockResolvedValue({
      programEnrollmentId: null,
      revokedAt: new Date(),
    });
    expect(await repository.read(input)).toEqual({ outcome: 'NOT_FOUND' });
    tx.programAuditLog.findFirst.mockResolvedValue({ id: id(9) });
    expect(await repository.read(input)).toMatchObject({
      outcome: 'FOUND',
      data: { status: 'UNKNOWN' },
    });
    expect(tx.programAuditLog.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      resourceId: id(4),
      performedByUserId: id(3),
      action: 'TRAINING_PERSONAL_DATA_DELETED',
      afterData: { path: ['kind'], equals: 'ALL' },
    });
  });
  it('returns UNKNOWN rather than a partial result on event overflow', async () => {
    const { tx, repository } = fixture();
    const event = {
      id: id(10),
      workspaceId: id(1),
      groupId: id(2),
      programEnrollmentId: id(4),
      actorUserId: id(3),
      missionAssignmentId: id(5),
      eventType: 'HELP_REQUESTED',
      schemaVersion: 1,
      sourceResourceType: null,
      sourceResourceId: null,
      occurredAt: new Date(),
      metadata: {},
    };
    tx.programActionEvent.findMany.mockResolvedValue(
      Array.from({ length: REPRODUCTION_HISTORY_MAX_EVENTS + 1 }, () => event),
    );
    expect(await repository.read(input)).toMatchObject({
      outcome: 'FOUND',
      data: { reason: 'HISTORY_TRUNCATED', status: 'UNKNOWN' },
    });
  });
  it('looks up the exact historical Plan revision with the actor and membership scope', async () => {
    const { tx, repository } = fixture();
    const assignment = {
      id: id(5),
      workspaceId: id(1),
      groupId: id(2),
      programEnrollmentId: id(4),
      status: 'COMPLETED',
      targetResourceType: 'PERSONAL_LEARNING_PLAN',
      targetResourceId: id(11),
      missionDefinitionKey: 'PROMPT_BASIC',
      presentedAt: new Date(),
      completedAt: new Date(),
      displaySnapshot: { personalLearning: { planId: id(11), planRevision: 1 } },
    };
    tx.programMissionAssignment.findMany.mockResolvedValue([assignment]);
    expect(await repository.read(input)).toMatchObject({
      outcome: 'FOUND',
      data: { reason: 'CHALLENGE_REFERENCE_MISSING' },
    });
    expect(tx.personalLearningPlanRevision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: id(1),
          groupId: id(2),
          programEnrollmentId: id(4),
          groupMembershipId: id(7),
          userId: id(3),
          OR: [{ planId: id(11), revision: 1 }],
        },
      }),
    );
  });
  it('does not query on invalid IDs and does not hide DB failures as UNKNOWN', async () => {
    const { client, repository, tx } = fixture();
    expect(await repository.read({ ...input, actorUserId: 'invalid' })).toEqual({
      outcome: 'NOT_FOUND',
    });
    expect(client.$transaction).not.toHaveBeenCalled();
    tx.trainingMissionAnswer.findMany.mockRejectedValue(new Error('database unavailable'));
    await expect(repository.read(input)).rejects.toThrow('database unavailable');
  });
});
