import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import type { PersonalLearningActor } from '@bunshin/application';
import {
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
  type PersonalLearningFeature,
} from '@bunshin/capability-training';
import { resolveMemberServiceContext } from './public-service';
import { requireAiTrainingUsageConsent } from './ai-training-consent';

/** Incomplete lesson flow must not be exposed in production. No learner allowlist. */
export function personalLearningRequestEnabled() {
  return (
    process.env['PERSONAL_LEARNING_REQUEST_INTAKE'] === 'true' &&
    ['development', 'staging', 'production'].includes(getServerEnvironment().APP_ENV)
  );
}
export async function resolvePersonalLearningRequestActor(
  slug: string,
  enrollmentId: string,
  userId: string,
  requiredFeature?: PersonalLearningFeature,
): Promise<PersonalLearningActor> {
  if (
    !personalLearningRequestEnabled() ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(enrollmentId)
  )
    throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
  const service = await resolveMemberServiceContext(slug, userId);
  const db = await import('@bunshin/database');
  const member = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId,
      status: 'ACTIVE',
      serviceRole: { in: ['PARTICIPANT', 'SERVICE_OWNER'] },
    },
    select: { id: true, serviceRole: true },
  });
  if (!member) throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
  const now = new Date();
  const enrollment = await db.prisma.programEnrollment.findFirst({
    where: {
      id: enrollmentId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      groupMembershipId: member.id,
      status: 'ACTIVE',
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: { id: true, serviceProgramId: true },
  });
  const program = enrollment
    ? await db.prisma.serviceProgram.findFirst({
        where: {
          id: enrollment.serviceProgramId,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          status: 'ACTIVE',
          settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
        },
        select: { settings: true },
      })
    : null;
  if (!enrollment || !program)
    throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
  const dynamic = personalLearningDynamicProgramAllows(program.settings, enrollment.id);
  if (getServerEnvironment().APP_ENV === 'production' && !dynamic)
    throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
  if (dynamic) {
    if (requiredFeature && !personalLearningFeatureEnabled(program.settings, requiredFeature))
      throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
    try {
      await db.prisma.$transaction((tx) =>
        db.requirePersonalLearningPilotSeat(
          tx,
          {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            programEnrollmentId: enrollment.id,
            userId,
          },
          true,
        ),
      );
    } catch {
      throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
    }
  }
  await requireAiTrainingUsageConsent({
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    enrollmentId,
    userId,
  });
  return {
    actorUserId: userId,
    scope: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      programEnrollmentId: enrollment.id,
      groupMembershipId: member.id,
      userId,
    },
  };
}
