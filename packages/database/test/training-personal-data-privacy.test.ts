import { describe, expect, it, vi } from 'vitest';
import { trainingPersonalDataRoleAllows } from '../src/training-personal-data-privacy';
import { pilotParticipantHash } from '../src/personal-learning-pilot-seat';

const scope = {
  workspaceId: 'workspace-a',
  groupId: 'group-a',
  programEnrollmentId: 'enrollment-a',
  actorUserId: 'user-a',
};
const program = {
  id: 'program-a',
  settings: { moduleKey: 'AI_TRAINING_V1', personalLearningPilot: { enabled: false } },
};
function fixture() {
  const tx = {
    personalLearningPilotSeat: {
      findFirst: vi.fn().mockResolvedValue({
        programEnrollmentId: scope.programEnrollmentId,
        revokedAt: new Date('2026-10-09T00:00:00Z'),
      }),
    },
    programAuditLog: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const allows = (role = 'SERVICE_OWNER', selectedProgram = program) =>
    trainingPersonalDataRoleAllows(tx as never, scope, role, selectedProgram);
  return { tx, allows };
}
describe('limited INTERNAL owner privacy authorization, not runtime permission', () => {
  it('preserves participant access without requiring pilot history', async () => {
    const { tx, allows } = fixture();
    expect(await allows('PARTICIPANT')).toBe(true);
    expect(tx.personalLearningPilotSeat.findFirst).not.toHaveBeenCalled();
  });
  it('allows the own INTERNAL history after Pilot OFF and revocation with scoped server queries', async () => {
    const { tx, allows } = fixture();
    expect(await allows()).toBe(true);
    expect(tx.personalLearningPilotSeat.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        serviceProgramId: program.id,
        participantHash: pilotParticipantHash(program.id, scope.actorUserId),
        kind: 'INTERNAL',
        cohort: 'INTERNAL',
      },
      select: { programEnrollmentId: true, revokedAt: true },
    });
    expect(tx.programAuditLog.findFirst).not.toHaveBeenCalled();
  });
  it.each(['SERVICE_ADMIN', 'CONTENT_EDITOR', 'UNKNOWN'])(
    'does not grant %s general privacy power',
    async (role) => {
      const { tx, allows } = fixture();
      expect(await allows(role)).toBe(false);
      expect(tx.personalLearningPilotSeat.findFirst).not.toHaveBeenCalled();
    },
  );
  it('rejects legacy V1, missing INTERNAL history, another Enrollment and unrevoked detached seats', async () => {
    const { tx, allows } = fixture();
    expect(
      await allows('SERVICE_OWNER', {
        ...program,
        settings: { moduleKey: 'AI_TRAINING_V1' },
      } as typeof program),
    ).toBe(false);
    tx.personalLearningPilotSeat.findFirst.mockResolvedValueOnce(null);
    expect(await allows()).toBe(false);
    tx.personalLearningPilotSeat.findFirst.mockResolvedValueOnce({
      programEnrollmentId: 'other',
      revokedAt: new Date(),
    });
    expect(await allows()).toBe(false);
    tx.personalLearningPilotSeat.findFirst.mockResolvedValueOnce({
      programEnrollmentId: null,
      revokedAt: null,
    });
    expect(await allows()).toBe(false);
  });
  it('requires exact own ALL deletion evidence after seat detachment, not a generic participation history', async () => {
    const { tx, allows } = fixture();
    tx.personalLearningPilotSeat.findFirst.mockResolvedValue({
      programEnrollmentId: null,
      revokedAt: new Date(),
    });
    expect(await allows()).toBe(false);
    tx.programAuditLog.findFirst.mockResolvedValue({ id: 'own-all-deletion' });
    expect(await allows()).toBe(true);
    expect(tx.programAuditLog.findFirst).toHaveBeenLastCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        resourceType: 'PROGRAM_ENROLLMENT',
        resourceId: scope.programEnrollmentId,
        action: 'TRAINING_PERSONAL_DATA_DELETED',
        performedByUserId: scope.actorUserId,
        afterData: { path: ['kind'], equals: 'ALL' },
      },
      select: { id: true },
    });
  });
  it('propagates database failures rather than treating missing evidence as allowed', async () => {
    const { tx, allows } = fixture();
    tx.personalLearningPilotSeat.findFirst.mockRejectedValue(new Error('database unavailable'));
    await expect(allows()).rejects.toThrow('database unavailable');
  });
});
