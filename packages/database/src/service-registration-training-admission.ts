import {
  AI_TRAINING_V1_MODULE_KEY,
  isPersonalLearningPilotProgram,
  parsePilotParticipantPolicy,
  personalLearningOfferPolicy,
  personalLearningPilotAllows,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma } from './client';
import { pilotParticipantHash } from './personal-learning-pilot-seat';

type Transaction = Prisma.TransactionClient;

const POLICY_VERSION = 'SERVICE_TRAINING_AUTO_ADMISSION_V1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TrainingAutoAdmissionPolicy = Readonly<{
  version: typeof POLICY_VERSION;
  enabled: boolean;
  serviceProgramId: string;
  programOfferingId: string;
}>;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readTrainingAutoAdmissionPolicy(
  onboardingConfig: unknown,
): TrainingAutoAdmissionPolicy | null {
  const onboarding = object(onboardingConfig);
  if (!onboarding || !Object.hasOwn(onboarding, 'trainingAutoAdmission')) return null;
  const value = object(onboarding.trainingAutoAdmission);
  const keys = value ? Object.keys(value).sort() : [];
  if (
    !value ||
    keys.join(':') !==
      ['enabled', 'programOfferingId', 'serviceProgramId', 'version'].sort().join(':') ||
    value.version !== POLICY_VERSION ||
    typeof value.enabled !== 'boolean' ||
    typeof value.serviceProgramId !== 'string' ||
    !UUID.test(value.serviceProgramId) ||
    typeof value.programOfferingId !== 'string' ||
    !UUID.test(value.programOfferingId)
  ) {
    throw new ApplicationError('CONFIGURATION_ERROR', 'training auto admission policy is invalid');
  }
  return {
    version: POLICY_VERSION,
    enabled: value.enabled,
    serviceProgramId: value.serviceProgramId,
    programOfferingId: value.programOfferingId,
  };
}

/**
 * Prepares the configured training enrollment and INTERNAL seat in the same
 * transaction as public service registration. AI usage consent remains an
 * explicit learner action and is deliberately not created here.
 */
export async function admitServiceRegistrantToConfiguredTraining(
  tx: Transaction,
  input: {
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    userId: string;
    onboardingConfig: unknown;
    now: Date;
  },
): Promise<Prisma.ProgramEnrollmentGetPayload<object> | null> {
  const policy = readTrainingAutoAdmissionPolicy(input.onboardingConfig);
  if (!policy?.enabled) return null;

  await tx.$queryRaw`
    SELECT id FROM service_programs
    WHERE id=${policy.serviceProgramId}::uuid
      AND workspace_id=${input.workspaceId}::uuid
      AND group_id=${input.groupId}::uuid
    FOR UPDATE
  `;
  const [program, offering, membership] = await Promise.all([
    tx.serviceProgram.findFirst({
      where: {
        id: policy.serviceProgramId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
      },
      select: { id: true, settings: true },
    }),
    tx.programOffering.findFirst({
      where: {
        id: policy.programOfferingId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        serviceProgramId: policy.serviceProgramId,
        status: 'ACTIVE',
        isFree: true,
        priceReference: null,
        OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
      },
    }),
    tx.groupMembership.findFirst({
      where: {
        id: input.groupMembershipId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.userId,
        serviceRole: 'PARTICIPANT',
        status: 'ACTIVE',
      },
      select: { id: true },
    }),
  ]);
  if (!program || !offering || !membership)
    throw new ApplicationError('CONFIGURATION_ERROR', 'training auto admission target unavailable');
  if (
    !isPersonalLearningPilotProgram(program.settings) ||
    personalLearningOfferPolicy(program.settings) === null
  )
    throw new ApplicationError('CONFIGURATION_ERROR', 'training auto admission program is invalid');
  const settings = program.settings as Prisma.JsonObject;
  const pilot = settings.personalLearningPilot as Prisma.JsonObject;
  const participantPolicy = parsePilotParticipantPolicy(pilot.participantControl);
  if (pilot.enabled !== true || !participantPolicy || participantPolicy.internalParticipantCap < 1)
    throw new ApplicationError(
      'CONFIGURATION_ERROR',
      'training auto admission capacity is not ready',
    );
  const terms = offering.termsSnapshot as { participation?: unknown; supportModes?: unknown };
  if (
    terms.participation !== 'INVITATION_ONLY' ||
    !Array.isArray(terms.supportModes) ||
    !terms.supportModes.includes('GUIDED')
  )
    throw new ApplicationError(
      'CONFIGURATION_ERROR',
      'training auto admission offering is invalid',
    );

  const operator = await tx.groupMembership.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      serviceRole: 'SERVICE_OWNER',
      status: 'ACTIVE',
    },
    select: { userId: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!operator)
    throw new ApplicationError('CONFIGURATION_ERROR', 'training auto admission owner unavailable');

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
      throw new ApplicationError('CONFLICT', 'training auto admission enrollment conflicts');
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
        invitedByUserId: operator.userId,
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

  const participantHash = pilotParticipantHash(program.id, input.userId);
  const existingSeat = seats.find((seat) => seat.participantHash === participantHash);
  if (existingSeat?.revokedAt)
    throw new ApplicationError('CONFLICT', 'training auto admission seat was revoked');
  if (existingSeat) {
    if (existingSeat.programEnrollmentId !== enrollment.id)
      throw new ApplicationError('CONFLICT', 'training auto admission seat conflicts');
    return enrollment;
  }
  if (seats.length >= participantPolicy.internalParticipantCap)
    throw new ApplicationError('FORBIDDEN', 'この研修は定員に達しました');

  const revision = participantPolicy.revision + 1;
  const nextSettings = {
    ...settings,
    personalLearningPilot: {
      ...pilot,
      participantControl: { ...participantPolicy, revision },
      enrollmentIds: [...activeEnrollmentIds, enrollment.id],
    },
  };
  if (!personalLearningPilotAllows(nextSettings, enrollment.id))
    throw new ApplicationError(
      'CONFIGURATION_ERROR',
      'training auto admission runtime is not ready',
    );
  await tx.personalLearningPilotSeat.create({
    data: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      serviceProgramId: program.id,
      participantHash,
      programEnrollmentId: enrollment.id,
      kind: 'INTERNAL',
      cohort: 'INTERNAL',
      seatNumber: seats.length + 1,
      admittedAt: input.now,
    },
  });
  await tx.serviceProgram.update({
    where: { id: program.id },
    data: { settings: nextSettings },
  });
  await tx.programAuditLog.create({
    data: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      resourceType: 'SERVICE_PROGRAM',
      resourceId: program.id,
      action: 'SERVICE_REGISTRATION_AUTO_ADMISSION',
      performedByUserId: operator.userId,
      afterData: {
        programEnrollmentId: enrollment.id,
        participantHash,
        kind: 'INTERNAL',
        revision,
        source: 'PUBLIC_SERVICE_REGISTRATION',
      },
    },
  });
  return enrollment;
}
