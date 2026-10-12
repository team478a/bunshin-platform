import type { Prisma } from '@prisma/client';
import {
  isPersonalLearningPilotProgram,
  parsePilotParticipantPolicy,
  personalLearningPublicRegistrationCapacity,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import { pilotParticipantHash } from './personal-learning-pilot-seat';

export type PersonalLearningPublicRegistrationResult = Readonly<{
  status: 'NOT_APPLICABLE' | 'ALREADY_ADMITTED' | 'ADMITTED';
  revision?: number;
}>;

/**
 * Connects an ordinary direct paid enrollment to the bounded learning Pilot.
 * The caller must run this in the same serializable transaction that marks the purchase paid.
 */
export async function admitPaidPersonalLearningRegistration(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    groupId: string;
    serviceProgramId: string;
    programEnrollmentId: string;
    groupMembershipId: string;
    buyerUserId: string;
    purchaseId: string;
    now: Date;
  },
): Promise<PersonalLearningPublicRegistrationResult> {
  await tx.$queryRaw`
    SELECT id FROM service_programs
    WHERE id=${input.serviceProgramId}::uuid
      AND workspace_id=${input.workspaceId}::uuid
      AND group_id=${input.groupId}::uuid
    FOR UPDATE
  `;
  const program = await tx.serviceProgram.findFirst({
    where: {
      id: input.serviceProgramId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: 'ACTIVE',
    },
    select: { settings: true },
  });
  if (!program) throw new ApplicationError('NOT_FOUND', 'program product unavailable');
  if (!isPersonalLearningPilotProgram(program.settings)) return { status: 'NOT_APPLICABLE' };

  const capacity = personalLearningPublicRegistrationCapacity(program.settings);
  const settings = program.settings as Prisma.JsonObject;
  const pilot = settings.personalLearningPilot as Prisma.JsonObject | undefined;
  const policy = parsePilotParticipantPolicy(pilot?.participantControl);
  if (capacity === null || !pilot || !policy)
    throw new ApplicationError(
      'CONFIGURATION_ERROR',
      'personal learning public registration is not ready',
    );

  const [enrollment, membership, activeUser] = await Promise.all([
    tx.programEnrollment.findFirst({
      where: {
        id: input.programEnrollmentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        serviceProgramId: input.serviceProgramId,
        status: 'ACTIVE',
      },
      select: { id: true },
    }),
    tx.groupMembership.findFirst({
      where: {
        id: input.groupMembershipId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.buyerUserId,
        serviceRole: 'PARTICIPANT',
        status: 'ACTIVE',
      },
      select: { id: true },
    }),
    tx.user.count({ where: { id: input.buyerUserId, status: 'ACTIVE' } }),
  ]);
  if (!enrollment || !membership || activeUser !== 1)
    throw new ApplicationError('NOT_FOUND', 'pilot participant unavailable');

  const seats = await tx.personalLearningPilotSeat.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      serviceProgramId: input.serviceProgramId,
    },
  });
  const activeIds = seats
    .filter((seat) => !seat.revokedAt && seat.programEnrollmentId !== null)
    .map((seat) => seat.programEnrollmentId as string);
  const projectedIds = pilot.enrollmentIds;
  const externalSeats = seats.filter((seat) => seat.kind === 'EXTERNAL').length;
  const internalSeats = seats.filter((seat) => seat.kind === 'INTERNAL').length;
  if (
    !Array.isArray(projectedIds) ||
    projectedIds.length !== activeIds.length ||
    activeIds.some((id) => !projectedIds.includes(id)) ||
    new Set(projectedIds).size !== projectedIds.length ||
    externalSeats > capacity ||
    internalSeats > policy.internalParticipantCap ||
    seats.some((seat) => !['EXTERNAL', 'INTERNAL'].includes(seat.kind))
  ) {
    throw new ApplicationError('CONFLICT', 'PILOT_SEAT_PROJECTION_MISMATCH');
  }

  const participantHash = pilotParticipantHash(input.serviceProgramId, input.buyerUserId);
  const priorSeat = seats.find((seat) => seat.participantHash === participantHash);
  if (priorSeat?.revokedAt) throw new ApplicationError('CONFLICT', 'PARTICIPANT_REVOKED');
  if (priorSeat) {
    if (
      priorSeat.programEnrollmentId !== input.programEnrollmentId ||
      priorSeat.kind !== 'EXTERNAL'
    )
      throw new ApplicationError('CONFLICT', 'PARTICIPANT_ALREADY_ADMITTED');
    return { status: 'ALREADY_ADMITTED', revision: policy.revision };
  }

  const consumed = externalSeats;
  if (consumed >= capacity)
    throw new ApplicationError(
      'CONFLICT',
      consumed >= 100 ? 'PILOT_CAP_REACHED' : 'WAVE_CAP_REACHED',
    );
  await tx.personalLearningPilotSeat.create({
    data: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      serviceProgramId: input.serviceProgramId,
      participantHash,
      programEnrollmentId: input.programEnrollmentId,
      kind: 'EXTERNAL',
      cohort: `WAVE_${policy.currentWave}`,
      seatNumber: consumed + 1,
      admittedAt: input.now,
    },
  });
  const revision = policy.revision + 1;
  await tx.serviceProgram.update({
    where: { id: input.serviceProgramId },
    data: {
      settings: {
        ...settings,
        personalLearningPilot: {
          ...pilot,
          participantControl: { ...policy, revision },
          enrollmentIds: [...activeIds, input.programEnrollmentId],
        },
      },
    },
  });
  await tx.programAuditLog.create({
    data: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      resourceType: 'SERVICE_PROGRAM',
      resourceId: input.serviceProgramId,
      action: 'PUBLIC_PAID_REGISTRATION_ADMITTED',
      performedByUserId: input.buyerUserId,
      afterData: {
        programEnrollmentId: input.programEnrollmentId,
        purchaseId: input.purchaseId,
        cohort: `WAVE_${policy.currentWave}`,
        revision,
      },
    },
  });
  return { status: 'ADMITTED', revision };
}
