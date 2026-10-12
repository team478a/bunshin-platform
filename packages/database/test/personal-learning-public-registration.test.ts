import { describe, expect, it, vi } from 'vitest';
import { admitPaidPersonalLearningRegistration } from '../src/personal-learning-public-registration';

const enrollmentId = '11111111-1111-4111-8111-111111111111';
const settings = {
  moduleKey: 'AI_TRAINING_V1',
  personalLearningPilot: {
    enabled: true,
    enrollmentIds: [],
    participantControl: {
      version: 'PILOT_PARTICIPANT_CAP_V1',
      revision: 4,
      externalParticipantCap: 5,
      internalParticipantCap: 0,
      currentWave: 1,
      currentWaveCap: 5,
    },
  },
  trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
};

const input = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  groupId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  serviceProgramId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  programEnrollmentId: enrollmentId,
  groupMembershipId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  buyerUserId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  purchaseId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  now: new Date('2026-10-12T00:00:00Z'),
};

const transaction = (seats: object[] = []) => ({
  $queryRaw: vi.fn().mockResolvedValue([{ id: input.serviceProgramId }]),
  serviceProgram: {
    findFirst: vi.fn().mockResolvedValue({ settings }),
    update: vi.fn(),
  },
  programEnrollment: { findFirst: vi.fn().mockResolvedValue({ id: enrollmentId }) },
  groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: input.groupMembershipId }) },
  user: { count: vi.fn().mockResolvedValue(1) },
  personalLearningPilotSeat: {
    findMany: vi.fn().mockResolvedValue(seats),
    create: vi.fn(),
  },
  programAuditLog: { create: vi.fn() },
});

describe('ordinary paid Personal Learning registration admission', () => {
  it('creates an EXTERNAL wave seat and synchronizes the runtime allowlist', async () => {
    const tx = transaction();
    await expect(admitPaidPersonalLearningRegistration(tx as never, input)).resolves.toEqual({
      status: 'ADMITTED',
      revision: 5,
    });
    expect(tx.personalLearningPilotSeat.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        programEnrollmentId: enrollmentId,
        kind: 'EXTERNAL',
        cohort: 'WAVE_1',
        seatNumber: 1,
      }),
    });
    expect(tx.serviceProgram.update).toHaveBeenCalledWith({
      where: { id: input.serviceProgramId },
      data: {
        settings: expect.objectContaining({
          personalLearningPilot: expect.objectContaining({
            enrollmentIds: [enrollmentId],
            participantControl: expect.objectContaining({ revision: 5 }),
          }),
        }),
      },
    });
    expect(tx.programAuditLog.create).toHaveBeenCalledOnce();
  });

  it('rejects a mismatched seat projection instead of silently adopting it', async () => {
    const tx = transaction([
      {
        participantHash: 'hash',
        programEnrollmentId: '22222222-2222-4222-8222-222222222222',
        kind: 'EXTERNAL',
        revokedAt: null,
      },
    ]);
    await expect(admitPaidPersonalLearningRegistration(tx as never, input)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'PILOT_SEAT_PROJECTION_MISMATCH',
    });
    expect(tx.personalLearningPilotSeat.create).not.toHaveBeenCalled();
  });
});
