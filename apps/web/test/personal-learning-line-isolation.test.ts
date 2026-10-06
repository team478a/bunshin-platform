import { describe, expect, it, vi } from 'vitest';
import { resolveServiceLineBroadcastRecipientIds } from '../src/jobs/service-line-broadcast-eligibility';
import { scheduleAiTrainingActionLineDeliveries } from '../src/services/ai-training-action-line-scheduler';
const settings = { moduleKey: 'AI_TRAINING_V1', personalLearningPilot: null };
vi.mock('@bunshin/database', () => ({
  prisma: { serviceProgram: { findMany: async () => [{ id: 'program', settings }] } },
  PrismaAiTrainingRuntimeRepository: class {},
}));
describe('Personal Learning never delivers training LINE', () => {
  it('scheduler skips a malformed reserved Program before fetching learner data', async () => {
    const result = await scheduleAiTrainingActionLineDeliveries({ environment: 'PRODUCTION' });
    expect(result).toMatchObject({
      programs: 1,
      skipped: 1,
      candidates: 0,
      broadcasts: 0,
      failures: 0,
    });
  });
  it.each([
    [settings, null, false],
    [{ moduleKey: 'AI_TRAINING_V1' }, 'PERSONAL_LEARNING_PLAN', false],
    [{ moduleKey: 'AI_TRAINING_V1' }, null, true],
  ])(
    'delivery eligibility preserves V1 but refuses reserved/Plan actions',
    async (programSettings, targetResourceType, allowed) => {
      const db = {
        prisma: {
          groupMembership: { findMany: vi.fn().mockResolvedValue([{ id: 'member' }]) },
          programEnrollment: {
            findFirst: vi
              .fn()
              .mockResolvedValue({
                id: 'enrollment',
                groupMembershipId: 'member',
                serviceProgramId: 'program',
              }),
          },
          programProgressSnapshot: { findFirst: vi.fn().mockResolvedValue({ id: 'progress' }) },
          programMissionAssignment: {
            findFirst: vi.fn().mockResolvedValue({ id: 'assignment', targetResourceType }),
          },
          serviceProgram: {
            findFirst: vi.fn().mockResolvedValue({ id: 'program', settings: programSettings }),
          },
          lineConnection: {
            findMany: vi.fn().mockResolvedValue([{ userId: 'user', providerUserId: 'line-user' }]),
          },
        },
      };
      const result = await resolveServiceLineBroadcastRecipientIds({
        db: db as never,
        broadcast: {
          id: 'broadcast',
          workspaceId: 'workspace',
          groupId: 'group',
          message: 'synthetic',
          updatedByUserId: 'operator',
          segmentCriteria: {
            kind: 'AI_TRAINING_ACTION',
            programEnrollmentId: 'enrollment',
            assignmentId: 'assignment',
          },
        },
        configuration: { id: 'config', encryptedAccessToken: 'synthetic' },
        environment: 'PRODUCTION',
        mode: 'SHARED',
        recipients: [
          { id: 'recipient', groupMembershipId: 'member', userId: 'user', message: null },
        ],
      });
      expect(result.size).toBe(allowed ? 1 : 0);
    },
  );
});
