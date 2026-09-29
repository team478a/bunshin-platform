import { describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('../src/training-runtime-shared', () => ({
  resolveScope: state.resolve,
  sameDecision: vi.fn(),
  StaleTrainingRuntimeWrite: class extends Error {},
}));
import { PrismaAiTrainingRuntimeDecisionRepository } from '../src/training-runtime-decision-repository';
describe('training runtime deletion generation', () => {
  it('locks first and rejects candidates from a deleted or updated profile before creating records', async () => {
    const now = new Date('2026-09-28T00:00:00Z');
    for (const profile of [null, { updatedAt: new Date(now.getTime() + 1) }]) {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        trainingParticipantProfile: { findFirst: vi.fn().mockResolvedValue(profile) },
        programMissionAssignment: { create: vi.fn() },
        programProgressSnapshot: { create: vi.fn() },
      };
      state.resolve.mockResolvedValue({
        enrollment: { id: 'enrollment-a' },
        program: { programTemplateVersionId: 'version-a' },
        membership: { id: 'membership-a' },
        missions: [],
      });
      const client = {
        $transaction: vi.fn((callback: (value: typeof tx) => unknown) =>
          Promise.resolve(callback(tx)),
        ),
      };
      const result = await new PrismaAiTrainingRuntimeDecisionRepository(
        client as never,
      ).persistDecision({
        candidate: {
          workspaceId: 'workspace-a',
          groupId: 'group-a',
          programEnrollmentId: 'enrollment-a',
          programTemplateVersionId: 'version-a',
          participantUserId: 'user-a',
          profileId: 'old-profile',
          profileUpdatedAt: now,
        },
        decision: { actionKey: 'AI_BASIC' },
      } as never);
      expect(result).toBe('STALE');
      expect(tx.trainingParticipantProfile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'old-profile',
            userId: 'user-a',
            groupMembershipId: 'membership-a',
          }),
        }),
      );
      expect(tx.programMissionAssignment.create).not.toHaveBeenCalled();
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.trainingParticipantProfile.findFirst.mock.invocationCallOrder[0]!,
      );
    }
  });
});
