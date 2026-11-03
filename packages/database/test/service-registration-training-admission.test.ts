import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import {
  admitServiceRegistrantToConfiguredTraining,
  readTrainingAutoAdmissionPolicy,
} from '../src/service-registration-training-admission';
import { pilotParticipantHash } from '../src/personal-learning-pilot-seat';

const ids = {
  workspace: '00000000-0000-4000-8000-000000000001',
  group: '00000000-0000-4000-8000-000000000002',
  membership: '00000000-0000-4000-8000-000000000003',
  user: '00000000-0000-4000-8000-000000000004',
  program: '00000000-0000-4000-8000-000000000005',
  offering: '00000000-0000-4000-8000-000000000006',
  enrollment: '00000000-0000-4000-8000-000000000007',
  owner: '00000000-0000-4000-8000-000000000008',
  otherEnrollment: '00000000-0000-4000-8000-000000000009',
} as const;

const onboardingConfig = {
  trainingAutoAdmission: {
    version: 'SERVICE_TRAINING_AUTO_ADMISSION_V1',
    enabled: true,
    serviceProgramId: ids.program,
    programOfferingId: ids.offering,
  },
};

function fixture() {
  const programSettings = {
    moduleKey: 'AI_TRAINING_V1',
    learningOfferPolicy: 'AI_SKILL_V1',
    trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
    personalLearningPilot: {
      enabled: true,
      enrollmentIds: [] as string[],
      participantControl: {
        version: 'PILOT_PARTICIPANT_CAP_V1',
        revision: 1,
        externalParticipantCap: 0,
        internalParticipantCap: 20,
        currentWave: 0,
        currentWaveCap: 0,
      },
    },
  };
  const enrollment = {
    id: ids.enrollment,
    workspaceId: ids.workspace,
    groupId: ids.group,
    groupMembershipId: ids.membership,
    serviceProgramId: ids.program,
    programOfferingId: ids.offering,
    status: 'ACTIVE',
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    serviceProgram: {
      findFirst: vi.fn().mockResolvedValue({ id: ids.program, settings: programSettings }),
      update: vi.fn().mockResolvedValue({}),
    },
    programOffering: {
      findFirst: vi.fn().mockResolvedValue({
        id: ids.offering,
        version: 1,
        isFree: true,
        seller: 'SERVICE',
        apiCostOwner: 'SERVICE',
        supportOwner: 'SERVICE',
        contentOwner: 'SERVICE',
        characterOwner: 'SERVICE',
        termsSnapshot: { participation: 'INVITATION_ONLY', supportModes: ['GUIDED'] },
      }),
    },
    groupMembership: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({ id: ids.membership })
        .mockResolvedValueOnce({ userId: ids.owner }),
    },
    programEnrollment: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(enrollment),
    },
    personalLearningPilotSeat: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    programAuditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return { tx, enrollment, programSettings };
}

describe('service registration training admission', () => {
  it('reads only the explicit versioned service policy', () => {
    expect(readTrainingAutoAdmissionPolicy({})).toBeNull();
    expect(readTrainingAutoAdmissionPolicy(onboardingConfig)).toEqual(
      onboardingConfig.trainingAutoAdmission,
    );
    expect(() =>
      readTrainingAutoAdmissionPolicy({
        trainingAutoAdmission: { ...onboardingConfig.trainingAutoAdmission, unknown: true },
      }),
    ).toThrow(ApplicationError);
  });

  it('creates an enrollment and bounded internal seat without AI consent', async () => {
    const { tx, enrollment } = fixture();
    await expect(
      admitServiceRegistrantToConfiguredTraining(tx as never, {
        workspaceId: ids.workspace,
        groupId: ids.group,
        groupMembershipId: ids.membership,
        userId: ids.user,
        onboardingConfig,
        now: new Date('2026-11-03T00:00:00.000Z'),
      }),
    ).resolves.toEqual(enrollment);

    expect(tx.programEnrollment.create).toHaveBeenCalledOnce();
    expect(tx.personalLearningPilotSeat.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: ids.workspace,
        groupId: ids.group,
        serviceProgramId: ids.program,
        programEnrollmentId: ids.enrollment,
        kind: 'INTERNAL',
        cohort: 'INTERNAL',
        seatNumber: 1,
      }),
    });
    expect(tx.serviceProgram.update).toHaveBeenCalledWith({
      where: { id: ids.program },
      data: {
        settings: expect.objectContaining({
          personalLearningPilot: expect.objectContaining({
            enrollmentIds: [ids.enrollment],
            participantControl: expect.objectContaining({ revision: 2 }),
          }),
        }),
      },
    });
  });

  it('is idempotent when the matching enrollment and seat already exist', async () => {
    const { tx, enrollment } = fixture();
    tx.programEnrollment.findFirst.mockResolvedValue(enrollment);
    tx.personalLearningPilotSeat.findMany.mockResolvedValue([
      {
        participantHash: pilotParticipantHash(ids.program, ids.user),
        programEnrollmentId: ids.enrollment,
        kind: 'INTERNAL',
        revokedAt: null,
      },
    ]);
    tx.serviceProgram.findFirst.mockResolvedValue({
      id: ids.program,
      settings: {
        moduleKey: 'AI_TRAINING_V1',
        learningOfferPolicy: 'AI_SKILL_V1',
        trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
        personalLearningPilot: {
          enabled: true,
          enrollmentIds: [ids.enrollment],
          participantControl: {
            version: 'PILOT_PARTICIPANT_CAP_V1',
            revision: 2,
            externalParticipantCap: 0,
            internalParticipantCap: 20,
            currentWave: 0,
            currentWaveCap: 0,
          },
        },
      },
    });

    await admitServiceRegistrantToConfiguredTraining(tx as never, {
      workspaceId: ids.workspace,
      groupId: ids.group,
      groupMembershipId: ids.membership,
      userId: ids.user,
      onboardingConfig,
      now: new Date('2026-11-03T00:00:00.000Z'),
    });

    expect(tx.programEnrollment.create).not.toHaveBeenCalled();
    expect(tx.personalLearningPilotSeat.create).not.toHaveBeenCalled();
    expect(tx.serviceProgram.update).not.toHaveBeenCalled();
  });

  it('does nothing when the service setting is absent or disabled', async () => {
    const { tx } = fixture();
    await expect(
      admitServiceRegistrantToConfiguredTraining(tx as never, {
        workspaceId: ids.workspace,
        groupId: ids.group,
        groupMembershipId: ids.membership,
        userId: ids.user,
        onboardingConfig: {},
        now: new Date(),
      }),
    ).resolves.toBeNull();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects registration when the configured internal capacity is exhausted', async () => {
    const { tx, programSettings } = fixture();
    programSettings.personalLearningPilot.enrollmentIds.push(ids.otherEnrollment);
    programSettings.personalLearningPilot.participantControl.internalParticipantCap = 1;
    tx.personalLearningPilotSeat.findMany.mockResolvedValue([
      {
        participantHash: 'a'.repeat(64),
        programEnrollmentId: ids.otherEnrollment,
        kind: 'INTERNAL',
        revokedAt: null,
      },
    ]);

    await expect(
      admitServiceRegistrantToConfiguredTraining(tx as never, {
        workspaceId: ids.workspace,
        groupId: ids.group,
        groupMembershipId: ids.membership,
        userId: ids.user,
        onboardingConfig,
        now: new Date('2026-11-03T00:00:00.000Z'),
      }),
    ).rejects.toThrow('この研修は定員に達しました');
    expect(tx.personalLearningPilotSeat.create).not.toHaveBeenCalled();
    expect(tx.serviceProgram.update).not.toHaveBeenCalled();
  });
});
