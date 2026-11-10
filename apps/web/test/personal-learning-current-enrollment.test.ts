import { describe, expect, it, vi } from 'vitest';
import { resolveCurrentPersonalLearningEnrollment } from '../src/services/personal-learning-current-enrollment';

const current = '11111111-1111-4111-8111-111111111111';
const replacement = '22222222-2222-4222-8222-222222222222';
const programId = '33333333-3333-4333-8333-333333333333';
const dynamicSettings = {
  moduleKey: 'AI_TRAINING_V1',
  trainingOperations: {
    notificationsEnabled: false,
    postponedReminderEnabled: false,
  },
  personalLearningPilot: {
    enabled: true,
    enrollmentIds: [replacement],
    participantControl: {
      version: 'PILOT_PARTICIPANT_CAP_V1',
      revision: 1,
      externalParticipantCap: 100,
      internalParticipantCap: 3,
      currentWave: 0,
      currentWaveCap: 0,
    },
    learningMode: 'DYNAMIC_V1',
    learningFeatures: {
      conversation: true,
      multiTopic: true,
      lineLearning: true,
      extendedScope: true,
      learningNudges: true,
      toolUpdates: false,
    },
  },
};

function store(options: { seat?: boolean; settings?: unknown } = {}) {
  const findEnrollments = vi
    .fn()
    .mockResolvedValue([{ id: replacement, serviceProgramId: programId }]);
  const db = {
    serviceProgram: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: programId, settings: options.settings ?? dynamicSettings }]),
    },
    programEnrollment: {
      findMany: findEnrollments,
    },
    personalLearningPilotSeat: {
      findMany: vi
        .fn()
        .mockResolvedValue(options.seat === false ? [] : [{ programEnrollmentId: replacement }]),
    },
  } as unknown as Parameters<typeof resolveCurrentPersonalLearningEnrollment>[0];
  return { db, findEnrollments };
}

describe('current Personal Learning enrollment recovery', () => {
  it('returns a same-scope active dynamic enrollment with an internal seat', async () => {
    const { db, findEnrollments } = store();
    await expect(
      resolveCurrentPersonalLearningEnrollment(db, {
        workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        groupId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        groupMembershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        currentEnrollmentId: current,
        now: new Date('2026-11-10T00:00:00.000Z'),
      }),
    ).resolves.toBe(replacement);
    expect(findEnrollments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupMembershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          id: { not: current },
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('does not redirect without a current internal seat', async () => {
    await expect(
      resolveCurrentPersonalLearningEnrollment(store({ seat: false }).db, {
        workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        groupId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        groupMembershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        currentEnrollmentId: current,
      }),
    ).resolves.toBeNull();
  });

  it('does not redirect to a stopped or non-dynamic Pilot', async () => {
    await expect(
      resolveCurrentPersonalLearningEnrollment(
        store({
          settings: {
            ...dynamicSettings,
            personalLearningPilot: {
              ...dynamicSettings.personalLearningPilot,
              enabled: false,
            },
          },
        }).db,
        {
          workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          groupId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          groupMembershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          currentEnrollmentId: current,
        },
      ),
    ).resolves.toBeNull();
  });
});
