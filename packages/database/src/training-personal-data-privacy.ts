import {
  isPersonalLearningPilotProgram,
  type TrainingPersonalDataScope,
} from '@bunshin/capability-training';
import type { Prisma } from '@prisma/client';
import { pilotParticipantHash } from './personal-learning-pilot-seat';

/** Privacy access is not permission to resume learning or call a Provider. */
export async function trainingPersonalDataRoleAllows(
  tx: Prisma.TransactionClient,
  input: TrainingPersonalDataScope,
  serviceRole: string,
  program: { id: string; settings: Prisma.JsonValue },
): Promise<boolean> {
  if (serviceRole === 'PARTICIPANT') return true;
  if (serviceRole !== 'SERVICE_OWNER' || !isPersonalLearningPilotProgram(program.settings))
    return false;
  // The caller has already verified the actor's active membership and own Enrollment.
  // A trusted INTERNAL history remains evidence after STOP/revocation; live flags do not apply.
  const seat = await tx.personalLearningPilotSeat.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      serviceProgramId: program.id,
      participantHash: pilotParticipantHash(program.id, input.actorUserId),
      kind: 'INTERNAL',
      cohort: 'INTERNAL',
    },
    select: { programEnrollmentId: true, revokedAt: true },
  });
  if (!seat) return false;
  if (seat.programEnrollmentId === input.programEnrollmentId) return true;
  if (seat.programEnrollmentId !== null || seat.revokedAt === null) return false;
  // ALL deletion detaches the seat. Require exact own deletion evidence, never authorize
  // another/new Enrollment merely because the user once had an INTERNAL seat.
  const deletion = await tx.programAuditLog.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      resourceType: 'PROGRAM_ENROLLMENT',
      resourceId: input.programEnrollmentId,
      action: 'TRAINING_PERSONAL_DATA_DELETED',
      performedByUserId: input.actorUserId,
      afterData: { path: ['kind'], equals: 'ALL' },
    },
    select: { id: true },
  });
  return deletion !== null;
}
