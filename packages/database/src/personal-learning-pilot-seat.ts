import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { parsePilotParticipantPolicy } from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';

export const pilotParticipantHash = (programId: string, userId: string) =>
  createHash('sha256').update(`PILOT_SEAT_V1:${programId}:${userId}`).digest('hex');

/** Live seat authorization, never trust the settings allowlist alone. */
export async function requirePersonalLearningPilotSeat(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; groupId: string; programEnrollmentId: string; userId: string },
  required = false,
) {
  const enrollment = await tx.programEnrollment.findFirst({
    where: {
      id: scope.programEnrollmentId,
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
    },
    select: { serviceProgramId: true, groupMembershipId: true },
  });
  if (!enrollment) throw new ApplicationError('NOT_FOUND', 'pilot unavailable');
  const members = await tx.groupMembership.count({
    where: {
      id: enrollment.groupMembershipId,
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      userId: scope.userId,
      status: 'ACTIVE',
      serviceRole: 'PARTICIPANT',
    },
  });
  if (members !== 1) throw new ApplicationError('NOT_FOUND', 'pilot unavailable');
  const program = await tx.serviceProgram.findFirst({
    where: {
      id: enrollment.serviceProgramId,
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
    },
    select: { settings: true },
  });
  const settings = program?.settings as
    | { personalLearningPilot?: { participantControl?: unknown; enrollmentIds?: string[] } }
    | undefined;
  const pilot = settings?.personalLearningPilot;
  if (!pilot || !Object.hasOwn(pilot, 'participantControl')) {
    if (required) throw new ApplicationError('NOT_FOUND', 'pilot seat required');
    return;
  }
  const policy = parsePilotParticipantPolicy(pilot.participantControl);
  if (!policy) throw new ApplicationError('NOT_FOUND', 'pilot policy unavailable');
  const seats = await tx.personalLearningPilotSeat.findMany({
    where: {
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      serviceProgramId: enrollment.serviceProgramId,
    },
  });
  const activeIds = seats.filter((s) => !s.revokedAt).map((s) => s.programEnrollmentId);
  const ids = pilot.enrollmentIds;
  const external = seats.filter((s) => s.kind === 'EXTERNAL').length;
  const internal = seats.filter((s) => s.kind === 'INTERNAL').length;
  if (
    !Array.isArray(ids) ||
    ids.length !== activeIds.length ||
    activeIds.some((id) => !id || !ids.includes(id)) ||
    external > policy.externalParticipantCap ||
    external > policy.currentWaveCap ||
    internal > policy.internalParticipantCap
  )
    throw new ApplicationError('NOT_FOUND', 'pilot seat projection unavailable');
  const seat = seats.find(
    (s) =>
      s.participantHash === pilotParticipantHash(enrollment.serviceProgramId, scope.userId) &&
      s.programEnrollmentId === scope.programEnrollmentId &&
      !s.revokedAt,
  );
  if (!seat) throw new ApplicationError('NOT_FOUND', 'pilot participant unavailable');
  // Synchronize revocation with an in-flight authorized transaction.
  const locked = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM personal_learning_pilot_seats WHERE id=${seat.id}::uuid AND revoked_at IS NULL FOR SHARE`;
  if (locked.length !== 1) throw new ApplicationError('NOT_FOUND', 'pilot participant unavailable');
}
