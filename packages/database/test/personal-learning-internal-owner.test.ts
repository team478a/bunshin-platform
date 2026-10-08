import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  pilotParticipantHash,
  requirePersonalLearningPilotSeat,
  requireTrainingLearnerRole,
} from '../src/personal-learning-pilot-seat';

const scope = {
  workspaceId: 'workspace',
  groupId: 'service',
  programEnrollmentId: '00000000-0000-4000-8000-000000000003',
  userId: 'owner',
};
function fixture(role = 'SERVICE_OWNER') {
  const seat = {
    id: 'seat',
    kind: 'INTERNAL',
    cohort: 'INTERNAL',
    programEnrollmentId: scope.programEnrollmentId,
    participantHash: pilotParticipantHash('program', scope.userId),
    revokedAt: null as Date | null,
  };
  const settings = {
    moduleKey: 'AI_TRAINING_V1',
    personalLearningPilot: {
      enabled: false,
      enrollmentIds: [scope.programEnrollmentId],
      participantControl: {
        version: 'PILOT_PARTICIPANT_CAP_V1',
        revision: 1,
        externalParticipantCap: 100,
        internalParticipantCap: 1,
        currentWave: 0,
        currentWaveCap: 0,
      },
    },
    trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
  };
  const tx = {
    programEnrollment: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ serviceProgramId: 'program', groupMembershipId: 'member' }),
    },
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ serviceRole: role }) },
    serviceProgram: { findFirst: vi.fn().mockResolvedValue({ settings }) },
    personalLearningPilotSeat: { findMany: vi.fn().mockResolvedValue([seat]) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'seat' }]),
  };
  return { tx: tx as unknown as Prisma.TransactionClient, mocks: tx, seat, settings };
}
describe('owner learner authority is an explicit INTERNAL seat, not management role', () => {
  it('permits a dedicated owner with a live own INTERNAL seat even during stopped Profile preparation', async () => {
    const f = fixture();
    await expect(requireTrainingLearnerRole(f.tx, scope, 'SERVICE_OWNER')).resolves.toBeUndefined();
    expect(f.mocks.groupMembership.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      userId: scope.userId,
      id: 'member',
      status: 'ACTIVE',
    });
  });
  it('preserves ordinary participant role behavior and rejects other staff roles', async () => {
    const f = fixture();
    await requireTrainingLearnerRole(f.tx, scope, 'PARTICIPANT');
    expect(f.mocks.programEnrollment.findFirst).not.toHaveBeenCalled();
    for (const role of ['SERVICE_ADMIN', 'CONTENT_EDITOR', 'UNKNOWN'])
      await expect(requireTrainingLearnerRole(f.tx, scope, role)).rejects.toThrow();
  });
  it('never gives an owner the old allowlist-only fallback or legacy V1 access', async () => {
    const f = fixture();
    f.mocks.serviceProgram.findFirst.mockResolvedValue({
      settings: { moduleKey: 'AI_TRAINING_V1' },
    });
    await expect(requirePersonalLearningPilotSeat(f.tx, scope)).rejects.toThrow();
    f.mocks.serviceProgram.findFirst.mockResolvedValue({
      settings: {
        ...f.settings,
        personalLearningPilot: { enabled: false, enrollmentIds: [scope.programEnrollmentId] },
      },
    });
    await expect(requirePersonalLearningPilotSeat(f.tx, scope)).rejects.toThrow();
  });
  it.each(['missing', 'revoked', 'external', 'foreign-user', 'foreign-enrollment', 'unlocked'])(
    'denies %s seat evidence',
    async (reason) => {
      const f = fixture();
      if (reason === 'missing') f.mocks.personalLearningPilotSeat.findMany.mockResolvedValue([]);
      if (reason === 'revoked') f.seat.revokedAt = new Date();
      if (reason === 'external') {
        f.seat.kind = 'EXTERNAL';
        f.seat.cohort = 'WAVE_1';
        f.settings.personalLearningPilot.participantControl.currentWave = 1;
        f.settings.personalLearningPilot.participantControl.currentWaveCap = 5;
      }
      if (reason === 'foreign-user')
        f.seat.participantHash = pilotParticipantHash('program', 'other');
      if (reason === 'foreign-enrollment') f.seat.programEnrollmentId = 'other';
      if (reason === 'unlocked') f.mocks.$queryRaw.mockResolvedValue([]);
      await expect(requireTrainingLearnerRole(f.tx, scope, 'SERVICE_OWNER')).rejects.toThrow();
    },
  );
});
