import 'server-only';
import { createHash } from 'node:crypto';
import {
  AI_TRAINING_V1_MODULE_KEY,
  isPersonalLearningPilotProgram,
  personalLearningMode,
  personalLearningOfferPolicy,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import {
  AI_TRAINING_AI_CONSENT_TEXT,
  AI_TRAINING_AI_CONSENT_VERSION,
  resolveAiTrainingParticipationState,
  aiTrainingConsentPolicy,
} from './ai-training-consent-policy';
import { resolveMemberServiceContext } from './public-service';

export {
  AI_TRAINING_AI_CONSENT_TEXT,
  AI_TRAINING_AI_CONSENT_VERSION,
} from './ai-training-consent-policy';

export const aiTrainingConsentTextDigest = (text: string) =>
  createHash('sha256').update(text).digest('hex');

// Keep the existing AI_SKILL_V1 identity explicit while participation matching below resolves
// the applicable identity from each Program's offer policy.
const consentTextDigest = aiTrainingConsentTextDigest(AI_TRAINING_AI_CONSENT_TEXT);
const aiSkillV1ConsentIdentity = {
  consentVersion: AI_TRAINING_AI_CONSENT_VERSION,
  textDigest: consentTextDigest,
} as const;

function aiTrainingConsentIdentity(offerPolicy: Parameters<typeof aiTrainingConsentPolicy>[0]) {
  const policy = aiTrainingConsentPolicy(offerPolicy);
  if (offerPolicy === 'AI_SKILL_V1') return aiSkillV1ConsentIdentity;
  return {
    consentVersion: policy.version,
    textDigest: aiTrainingConsentTextDigest(policy.text),
  };
}

export async function readAiTrainingParticipation(serviceSlug: string, userId: string) {
  const service = await resolveMemberServiceContext(serviceSlug, userId);
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId,
      status: 'ACTIVE',
      serviceRole: { in: ['PARTICIPANT', 'SERVICE_OWNER'] },
    },
    select: { id: true },
  });
  if (!membership) throw new ApplicationError('NOT_FOUND', 'training participation unavailable');

  const programs = await db.prisma.serviceProgram.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      status: { not: 'ARCHIVED' },
      settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
    },
    select: { id: true, displayName: true, status: true, settings: true },
    orderBy: { createdAt: 'asc' },
  });
  // This confirmation page is specifically for the manually seated closed Pilot. Legacy
  // AI-training programs keep their existing UX and authorization boundary.
  const pilotPrograms = programs.filter(
    ({ settings }) =>
      isPersonalLearningPilotProgram(settings) && personalLearningOfferPolicy(settings) !== null,
  );
  const enrollments = pilotPrograms.length
    ? await db.prisma.programEnrollment.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          groupMembershipId: membership.id,
          serviceProgramId: { in: pilotPrograms.map(({ id }) => id) },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          serviceProgramId: true,
          startsAt: true,
          endsAt: true,
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const enrollmentIds = enrollments.map(({ id }) => id);
  const [seats, consents] = enrollmentIds.length
    ? await Promise.all([
        db.prisma.personalLearningPilotSeat.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            serviceProgramId: { in: pilotPrograms.map(({ id }) => id) },
            programEnrollmentId: { in: enrollmentIds },
            kind: 'INTERNAL',
            cohort: 'INTERNAL',
            revokedAt: null,
          },
          select: { serviceProgramId: true, programEnrollmentId: true },
        }),
        db.prisma.aiTrainingUsageConsent.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            userId,
            programEnrollmentId: { in: enrollmentIds },
          },
          select: {
            programEnrollmentId: true,
            consentVersion: true,
            textDigest: true,
            consentedAt: true,
          },
        }),
      ])
    : [[], []];

  const now = new Date();
  const availableEnrollments = enrollments.filter(
    ({ startsAt, endsAt }) => (!startsAt || startsAt <= now) && (!endsAt || endsAt > now),
  );
  const rows = availableEnrollments.map((enrollment) => {
    const program = pilotPrograms.find(({ id }) => id === enrollment.serviceProgramId)!;
    const offerPolicy = personalLearningOfferPolicy(program.settings)!;
    const consentPolicy = aiTrainingConsentPolicy(offerPolicy);
    const consentIdentity = aiTrainingConsentIdentity(offerPolicy);
    const hasInternalSeat = seats.some(
      (seat) => seat.serviceProgramId === program.id && seat.programEnrollmentId === enrollment.id,
    );
    const consent = consents.find(
      ({ programEnrollmentId, consentVersion, textDigest }) =>
        programEnrollmentId === enrollment.id &&
        consentVersion === consentIdentity.consentVersion &&
        textDigest === consentIdentity.textDigest,
    );
    const state = resolveAiTrainingParticipationState({
      hasProgram: true,
      hasEnrollment: true,
      hasInternalSeat,
      hasCurrentConsent: Boolean(consent),
    });
    return {
      enrollmentId: enrollment.id,
      programName: program.displayName,
      offerPolicy,
      isDynamicLearning: personalLearningMode(program.settings) === 'DYNAMIC_V1',
      state,
      consentedAt: state === 'READY' ? (consent?.consentedAt.toISOString() ?? null) : null,
      consentText: state === 'CONSENT_REQUIRED' ? consentPolicy.text : null,
    };
  });

  const state = resolveAiTrainingParticipationState({
    hasProgram: pilotPrograms.length > 0,
    hasEnrollment: availableEnrollments.length > 0,
    hasInternalSeat: rows.some(({ state: enrollmentState }) =>
      ['CONSENT_REQUIRED', 'READY'].includes(enrollmentState),
    ),
    hasCurrentConsent: rows.some(({ state: enrollmentState }) => enrollmentState === 'READY'),
  });
  return {
    serviceName: service.configuration.displayName,
    isDynamicLearning: rows.some((row) => row.isDynamicLearning),
    state,
    enrollments: rows,
  };
}

export async function recordAiTrainingUsageConsent(input: {
  serviceSlug: string;
  userId: string;
  enrollmentId: string;
}) {
  const service = await resolveMemberServiceContext(input.serviceSlug, input.userId);
  const db = await import('@bunshin/database');
  const now = new Date();
  return db.prisma.$transaction(async (tx) => {
    const membership = await tx.groupMembership.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: input.userId,
        status: 'ACTIVE',
        serviceRole: { in: ['PARTICIPANT', 'SERVICE_OWNER'] },
      },
      select: { id: true },
    });
    if (!membership) throw new ApplicationError('NOT_FOUND', 'training participation unavailable');
    const enrollment = await tx.programEnrollment.findFirst({
      where: {
        id: input.enrollmentId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        groupMembershipId: membership.id,
        status: 'ACTIVE',
        AND: [db.trainingEnrollmentPeriodWhere(now)],
      },
      select: { id: true, serviceProgramId: true },
    });
    if (!enrollment) throw new ApplicationError('NOT_FOUND', 'training participation unavailable');
    const program = await tx.serviceProgram.findFirst({
      where: {
        id: enrollment.serviceProgramId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: { not: 'ARCHIVED' },
        settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
      },
      select: { settings: true },
    });
    if (!program || !isPersonalLearningPilotProgram(program.settings))
      throw new ApplicationError('NOT_FOUND', 'training participation unavailable');
    const offerPolicy = personalLearningOfferPolicy(program.settings);
    if (!offerPolicy) throw new ApplicationError('NOT_FOUND', 'training participation unavailable');
    const consentPolicy = aiTrainingConsentPolicy(offerPolicy);
    const seat = await tx.personalLearningPilotSeat.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        serviceProgramId: enrollment.serviceProgramId,
        programEnrollmentId: enrollment.id,
        kind: 'INTERNAL',
        cohort: 'INTERNAL',
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!seat) throw new ApplicationError('CONFLICT', 'internal training seat required');
    return tx.aiTrainingUsageConsent.upsert({
      where: {
        workspaceId_groupId_programEnrollmentId_consentVersion: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          programEnrollmentId: enrollment.id,
          consentVersion: consentPolicy.version,
        },
      },
      create: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        programEnrollmentId: enrollment.id,
        groupMembershipId: membership.id,
        userId: input.userId,
        consentVersion: consentPolicy.version,
        textDigest: aiTrainingConsentTextDigest(consentPolicy.text),
        consentedAt: now,
      },
      update: {},
      select: { consentedAt: true, consentVersion: true },
    });
  });
}

/** Rechecked in HTTP/worker paths so UI state or queued work cannot authorize a Provider call. */
export async function requireAiTrainingUsageConsent(input: {
  workspaceId: string;
  groupId: string;
  enrollmentId: string;
  userId: string;
}) {
  const db = await import('@bunshin/database');
  const enrollment = await db.prisma.programEnrollment.findFirst({
    where: {
      id: input.enrollmentId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: 'ACTIVE',
      AND: [db.trainingEnrollmentPeriodWhere(new Date())],
    },
    select: { serviceProgramId: true, groupMembershipId: true },
  });
  if (!enrollment) throw new ApplicationError('NOT_FOUND', 'AI training consent required');
  const [membership, program] = await Promise.all([
    db.prisma.groupMembership.findFirst({
      where: {
        id: enrollment.groupMembershipId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.userId,
        status: 'ACTIVE',
      },
      select: { id: true },
    }),
    db.prisma.serviceProgram.findFirst({
      where: {
        id: enrollment.serviceProgramId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
      },
      select: { settings: true },
    }),
  ]);
  if (!membership || !program || !isPersonalLearningPilotProgram(program.settings))
    throw new ApplicationError('NOT_FOUND', 'AI training consent required');
  const offerPolicy = personalLearningOfferPolicy(program.settings);
  if (!offerPolicy) throw new ApplicationError('NOT_FOUND', 'AI training consent required');
  const consentPolicy = aiTrainingConsentPolicy(offerPolicy);
  const seat = await db.prisma.personalLearningPilotSeat.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      serviceProgramId: enrollment.serviceProgramId,
      programEnrollmentId: input.enrollmentId,
      kind: 'INTERNAL',
      cohort: 'INTERNAL',
      revokedAt: null,
    },
    select: { id: true },
  });
  if (!seat) throw new ApplicationError('NOT_FOUND', 'AI training consent required');
  const consent = await db.prisma.aiTrainingUsageConsent.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programEnrollmentId: input.enrollmentId,
      groupMembershipId: membership.id,
      userId: input.userId,
      consentVersion: consentPolicy.version,
      textDigest: aiTrainingConsentTextDigest(consentPolicy.text),
    },
    select: { id: true },
  });
  if (!consent) throw new ApplicationError('NOT_FOUND', 'AI training consent required');
}
