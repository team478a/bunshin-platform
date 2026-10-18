import {
  AI_TRAINING_V1_MODULE_KEY,
  isPersonalLearningPilotProgram,
  parsePilotParticipantPolicy,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma } from './client';
import { pilotParticipantHash } from './personal-learning-pilot-seat';

type Transaction = Prisma.TransactionClient;

/**
 * A Manaberu invitation is also an explicit request for its invitation-only
 * internal training track. Enrollment and an INTERNAL seat are created in the
 * same transaction as membership acceptance; consent and Pilot execution are
 * deliberately left untouched.
 */
export async function admitManaberuInviteeToInternalTraining(
  tx: Transaction,
  input: {
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    userId: string;
    invitedByUserId: string | null;
    now: Date;
    invitationId: string;
  },
): Promise<Prisma.ProgramEnrollmentGetPayload<object> | null> {
  const service = await tx.serviceConfiguration.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      slug: 'manaberu-style',
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { id: true },
  });
  if (!service) return null;

  const programs = await tx.serviceProgram.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: { not: 'ARCHIVED' },
      settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
    },
    select: { id: true, settings: true },
  });
  const pilotPrograms = programs.filter((program) =>
    isPersonalLearningPilotProgram(program.settings),
  );
  if (pilotPrograms.length !== 1)
    throw new ApplicationError('CONFLICT', 'MANABERU_INVITATION_PROGRAM_NOT_UNIQUE');

  const candidateProgram = pilotPrograms[0]!;
  // Serialize first, then read the settings snapshot. A second invitation may
  // have waited here while the previous acceptance updated enrollmentIds.
  await tx.$queryRaw`SELECT id FROM service_programs WHERE id=${candidateProgram.id}::uuid FOR UPDATE`;
  const program = await tx.serviceProgram.findUniqueOrThrow({
    where: { id: candidateProgram.id },
    select: { id: true, status: true, settings: true },
  });
  if (
    (program.settings as Prisma.JsonObject).moduleKey !== AI_TRAINING_V1_MODULE_KEY ||
    !isPersonalLearningPilotProgram(program.settings)
  )
    throw new ApplicationError('CONFLICT', 'MANABERU_INVITATION_PROGRAM_CHANGED');
  if (program.status !== 'SUSPENDED')
    throw new ApplicationError('CONFLICT', 'MANABERU_INVITATION_PROGRAM_NOT_SUSPENDED');
  const settings = program.settings as Prisma.JsonObject;
  const pilot = settings.personalLearningPilot as Prisma.JsonObject;
  if (pilot.enabled !== false)
    throw new ApplicationError('CONFLICT', 'MANABERU_INVITATION_PILOT_MUST_REMAIN_STOPPED');
  const policy = parsePilotParticipantPolicy(pilot.participantControl);
  if (
    !policy ||
    policy.currentWave !== 0 ||
    policy.currentWaveCap !== 0 ||
    policy.internalParticipantCap < 1 ||
    policy.internalParticipantCap > 3
  )
    throw new ApplicationError('CONFLICT', 'MANABERU_INVITATION_INTERNAL_CAP_NOT_READY');

  const operator = input.invitedByUserId
    ? { id: input.invitedByUserId }
    : await tx.groupMembership
        .findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            serviceRole: 'SERVICE_OWNER',
            status: 'ACTIVE',
          },
          select: { userId: true },
          orderBy: { createdAt: 'asc' },
        })
        .then((membership) => (membership ? { id: membership.userId } : null));
  if (!operator)
    throw new ApplicationError('CONFLICT', 'MANABERU_INVITATION_AUTHORITY_UNAVAILABLE');

  // Serialize invitations for this exact Program, including the cap check and
  // allowlist projection update. The caller's transaction rolls back the
  // invitation consumption and membership if any prerequisite is missing.
  const offerings = await tx.programOffering.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      serviceProgramId: program.id,
      status: 'ACTIVE',
      isFree: true,
      priceReference: null,
      OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
    },
  });
  const eligibleOfferings = offerings.filter((offering) => {
    const terms = offering.termsSnapshot as {
      participation?: unknown;
      supportModes?: unknown;
    };
    return (
      terms.participation === 'INVITATION_ONLY' &&
      Array.isArray(terms.supportModes) &&
      terms.supportModes.includes('GUIDED')
    );
  });
  if (eligibleOfferings.length !== 1)
    throw new ApplicationError('CONFLICT', 'MANABERU_INVITATION_OFFERING_NOT_UNIQUE');
  const offering = eligibleOfferings[0]!;

  const existingEnrollment = await tx.programEnrollment.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      serviceProgramId: program.id,
      groupMembershipId: input.groupMembershipId,
    },
  });
  let enrollment = existingEnrollment;
  if (enrollment) {
    if (enrollment.status !== 'ACTIVE' || enrollment.programOfferingId !== offering.id)
      throw new ApplicationError('CONFLICT', 'MANABERU_INVITATION_EXISTING_ENROLLMENT_UNAVAILABLE');
  } else {
    enrollment = await tx.programEnrollment.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        serviceProgramId: program.id,
        programOfferingId: offering.id,
        status: 'ACTIVE',
        supportMode: 'GUIDED',
        goalSnapshot: { goal: '' },
        offeringSnapshot: {
          version: offering.version,
          isFree: offering.isFree,
          seller: offering.seller,
          apiCostOwner: offering.apiCostOwner,
          supportOwner: offering.supportOwner,
          contentOwner: offering.contentOwner,
          characterOwner: offering.characterOwner,
          terms: offering.termsSnapshot,
        },
        invitedByUserId: operator.id,
        startsAt: input.now,
      },
    });
  }

  const seats = await tx.personalLearningPilotSeat.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      serviceProgramId: program.id,
    },
  });
  const activeEnrollmentIds = seats
    .filter((seat) => !seat.revokedAt && seat.programEnrollmentId !== null)
    .map((seat) => seat.programEnrollmentId!);
  const projectedEnrollmentIds = pilot.enrollmentIds;
  if (
    !Array.isArray(projectedEnrollmentIds) ||
    projectedEnrollmentIds.length !== activeEnrollmentIds.length ||
    new Set(projectedEnrollmentIds).size !== projectedEnrollmentIds.length ||
    activeEnrollmentIds.some((id) => !projectedEnrollmentIds.includes(id)) ||
    seats.some((seat) => seat.kind !== 'INTERNAL')
  )
    throw new ApplicationError('CONFLICT', 'PILOT_SEAT_PROJECTION_MISMATCH');

  const existingSeat = seats.find(
    (seat) => seat.participantHash === pilotParticipantHash(program.id, input.userId),
  );
  if (existingSeat?.revokedAt)
    throw new ApplicationError('CONFLICT', 'MANABERU_INVITATION_SEAT_PREVIOUSLY_REVOKED');
  if (existingSeat) {
    if (existingSeat.programEnrollmentId !== enrollment.id || existingSeat.kind !== 'INTERNAL')
      throw new ApplicationError('CONFLICT', 'MANABERU_INVITATION_SEAT_CONFLICT');
    return enrollment;
  }

  const consumedSeats = seats.length;
  if (consumedSeats >= policy.internalParticipantCap)
    throw new ApplicationError('CONFLICT', 'MANABERU_INTERNAL_TESTER_CAP_REACHED');
  await tx.personalLearningPilotSeat.create({
    data: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      serviceProgramId: program.id,
      participantHash: pilotParticipantHash(program.id, input.userId),
      programEnrollmentId: enrollment.id,
      kind: 'INTERNAL',
      cohort: 'INTERNAL',
      seatNumber: consumedSeats + 1,
      admittedAt: input.now,
    },
  });
  const revision = policy.revision + 1;
  await tx.serviceProgram.update({
    where: { id: program.id },
    data: {
      settings: {
        ...settings,
        personalLearningPilot: {
          ...pilot,
          enabled: false,
          participantControl: { ...policy, revision },
          enrollmentIds: [...activeEnrollmentIds, enrollment.id],
        },
      },
    },
  });
  await tx.programAuditLog.create({
    data: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      resourceType: 'SERVICE_PROGRAM',
      resourceId: program.id,
      action: 'INVITATION_INTERNAL_ADMISSION',
      performedByUserId: operator.id,
      afterData: {
        invitationId: input.invitationId,
        programEnrollmentId: enrollment.id,
        participantHash: pilotParticipantHash(program.id, input.userId),
        kind: 'INTERNAL',
        revision,
        source: 'SERVICE_INVITATION_ACCEPTED',
      },
    },
  });
  return enrollment;
}
