import { describe, expect, it, vi } from 'vitest';
import { PrismaProgramCoreRepository, PrismaProgramRuntimeRepository } from '../src';

const scope = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  actorUserId: '00000000-0000-4000-8000-000000000003',
  programEnrollmentId: '00000000-0000-4000-8000-000000000004',
};

const enrollment = {
  id: scope.programEnrollmentId,
  workspaceId: scope.workspaceId,
  groupId: scope.groupId,
  groupMembershipId: '00000000-0000-4000-8000-000000000005',
  serviceProgramId: '00000000-0000-4000-8000-000000000006',
  status: 'ACTIVE',
};

const participant = {
  id: enrollment.groupMembershipId,
  serviceRole: 'PARTICIPANT',
};

const manager = {
  id: '00000000-0000-4000-8000-000000000007',
  serviceRole: 'SERVICE_ADMIN',
};

function runtimeClient(options?: {
  enrollment?: unknown;
  actor?: unknown;
  existingEvent?: unknown;
  assignment?: unknown;
}) {
  const tx = {
    programMissionAssignment: {
      findFirst: vi.fn().mockResolvedValue(options?.assignment ?? null),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    programActionEvent: { create: vi.fn() },
  };
  const client = {
    programEnrollment: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options && Object.hasOwn(options, 'enrollment') ? options.enrollment : enrollment,
        ),
    },
    groupMembership: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options && Object.hasOwn(options, 'actor') ? options.actor : participant,
        ),
    },
    serviceProgram: { findFirst: vi.fn() },
    programMissionAssignment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    programActionEvent: {
      findUnique: vi.fn().mockResolvedValue(options?.existingEvent ?? null),
      create: vi.fn(),
    },
    programProgressSnapshot: { findFirst: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  return { client, tx };
}

describe('program runtime repository isolation', () => {
  it('rejects a participant reading another enrollment before querying progress', async () => {
    const { client } = runtimeClient({
      enrollment: { ...enrollment, groupMembershipId: 'another-membership' },
    });

    await expect(
      new PrismaProgramRuntimeRepository(client as never).findProgress(scope),
    ).resolves.toBeNull();
    expect(client.programProgressSnapshot.findFirst).not.toHaveBeenCalled();
    expect(client.programEnrollment.findFirst).toHaveBeenCalledWith({
      where: {
        id: scope.programEnrollmentId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        status: { in: ['ACTIVE', 'COMPLETED', 'EXPIRED'] },
      },
    });
  });

  it('allows a service manager to read another member enrollment in the exact scope', async () => {
    const { client } = runtimeClient({ actor: manager });
    const progress = { id: 'progress-id' };
    client.programProgressSnapshot.findFirst.mockResolvedValue(progress);

    await expect(
      new PrismaProgramRuntimeRepository(client as never).findProgress(scope),
    ).resolves.toBe(progress);
    expect(client.programProgressSnapshot.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: enrollment.id,
      },
    });
  });

  it('does not mutate an assignment from outside the enrollment scope', async () => {
    const { client, tx } = runtimeClient({ assignment: null });

    await expect(
      new PrismaProgramRuntimeRepository(client as never).transitionAssignment({
        ...scope,
        assignmentId: 'foreign-assignment',
        transition: 'START',
        idempotencyKey: 'transition-key',
        metadata: {},
        occurredAt: new Date('2026-09-26T00:00:00.000Z'),
      }),
    ).resolves.toBeNull();
    expect(tx.programMissionAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-assignment',
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: enrollment.id,
      },
    });
    expect(tx.programMissionAssignment.updateMany).not.toHaveBeenCalled();
    expect(tx.programActionEvent.create).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key already used by another enrollment', async () => {
    const { client } = runtimeClient({
      existingEvent: {
        id: 'event-id',
        programEnrollmentId: 'another-enrollment',
        missionAssignmentId: null,
        eventType: 'RESULT_RECORDED',
        sourceResourceType: null,
        sourceResourceId: null,
        schemaVersion: 1,
        actorUserId: scope.actorUserId,
      },
    });

    await expect(
      new PrismaProgramRuntimeRepository(client as never).appendEvent({
        ...scope,
        missionAssignmentId: null,
        eventType: 'RESULT_RECORDED',
        sourceResourceType: null,
        sourceResourceId: null,
        idempotencyKey: 'shared-key',
        schemaVersion: 1,
        metadata: {},
        occurredAt: new Date('2026-09-26T00:00:00.000Z'),
      }),
    ).resolves.toBeNull();
    expect(client.programActionEvent.create).not.toHaveBeenCalled();
  });

  it('fails closed for a system event when the exact enrollment scope is absent', async () => {
    const { client } = runtimeClient({ enrollment: null });

    await expect(
      new PrismaProgramRuntimeRepository(client as never).appendEvent({
        ...scope,
        actorUserId: null,
        missionAssignmentId: null,
        eventType: 'MISSION_ASSIGNED',
        sourceResourceType: null,
        sourceResourceId: null,
        idempotencyKey: 'system-key',
        schemaVersion: 1,
        metadata: {},
        occurredAt: new Date('2026-09-26T00:00:00.000Z'),
      }),
    ).resolves.toBeNull();
    expect(client.programEnrollment.findFirst).toHaveBeenCalledWith({
      where: {
        id: scope.programEnrollmentId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        status: 'ACTIVE',
      },
    });
    expect(client.programActionEvent.create).not.toHaveBeenCalled();
  });
});

describe('program core repository isolation', () => {
  it('rejects a participant reading another membership enrollment', async () => {
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue(participant) },
      programEnrollment: { findFirst: vi.fn() },
    };

    await expect(
      new PrismaProgramCoreRepository(client as never).findEnrollment({
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        actorUserId: scope.actorUserId,
        groupMembershipId: 'another-membership',
        serviceProgramId: enrollment.serviceProgramId,
      }),
    ).resolves.toBeNull();
    expect(client.programEnrollment.findFirst).not.toHaveBeenCalled();
  });

  it('allows a service manager to read another membership only in the requested scope', async () => {
    const result = { id: enrollment.id };
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue(manager) },
      programEnrollment: { findFirst: vi.fn().mockResolvedValue(result) },
    };

    await expect(
      new PrismaProgramCoreRepository(client as never).findEnrollment({
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        actorUserId: scope.actorUserId,
        groupMembershipId: enrollment.groupMembershipId,
        serviceProgramId: enrollment.serviceProgramId,
      }),
    ).resolves.toBe(result);
    expect(client.programEnrollment.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        groupMembershipId: enrollment.groupMembershipId,
        serviceProgramId: enrollment.serviceProgramId,
      },
    });
  });

  it('does not enroll a member missing from the exact workspace and service scope', async () => {
    const tx = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      serviceProgram: { findFirst: vi.fn().mockResolvedValue({ id: enrollment.serviceProgramId }) },
      programOffering: { findFirst: vi.fn().mockResolvedValue({ id: 'offering-id' }) },
      programEnrollment: { create: vi.fn() },
      programAuditLog: { create: vi.fn() },
    };
    const client = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue(manager) },
      $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };

    await expect(
      new PrismaProgramCoreRepository(client as never).enroll({
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        actorUserId: scope.actorUserId,
        groupMembershipId: enrollment.groupMembershipId,
        serviceProgramId: enrollment.serviceProgramId,
        programOfferingId: 'offering-id',
        supportMode: 'GUIDED',
        goalSnapshot: {},
        startsAt: new Date('2026-09-26T00:00:00.000Z'),
        endsAt: null,
      }),
    ).resolves.toBeNull();
    expect(tx.groupMembership.findFirst).toHaveBeenCalledWith({
      where: {
        id: enrollment.groupMembershipId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        status: 'ACTIVE',
      },
    });
    expect(tx.programEnrollment.create).not.toHaveBeenCalled();
    expect(tx.programAuditLog.create).not.toHaveBeenCalled();
  });
});
