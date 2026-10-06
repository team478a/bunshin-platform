import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import {
  personalLearningPilotAllows,
  isPersonalLearningPilotProgram,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';
import { resolveMemberServiceContext, type PublicServiceContext } from './public-service';

export function personalLearningPilotEnabled() {
  return (
    getServerEnvironment().APP_ENV !== 'production' &&
    process.env['PERSONAL_LEARNING_PILOT'] === 'true'
  );
}
/** Used again at queue/worker execution, not just when a page was opened. */
export function personalLearningPilotExecutionAllowed(settings: unknown, enrollmentId: string) {
  return (
    !isPersonalLearningPilotProgram(settings) ||
    (personalLearningPilotEnabled() && personalLearningPilotAllows(settings, enrollmentId))
  );
}
export async function resolvePersonalLearningPilot(
  serviceSlug: string,
  enrollmentId: string,
  userId: string,
) {
  if (!personalLearningPilotEnabled()) throw new ApplicationError('NOT_FOUND', 'pilot unavailable');
  const service = await resolveMemberServiceContext(serviceSlug, userId);
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId,
      serviceRole: 'PARTICIPANT',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (!membership) throw new ApplicationError('NOT_FOUND', 'pilot unavailable');
  const scope = {
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    programEnrollmentId: z.string().uuid().parse(enrollmentId),
    groupMembershipId: membership.id,
    userId,
  };
  const enrollment = await db.prisma.programEnrollment.findFirst({
    where: {
      id: scope.programEnrollmentId,
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      groupMembershipId: membership.id,
      status: 'ACTIVE',
      AND: [db.trainingEnrollmentPeriodWhere(new Date())],
    },
  });
  const program = enrollment
    ? await db.prisma.serviceProgram.findFirst({
        where: {
          id: enrollment.serviceProgramId,
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          status: 'ACTIVE',
        },
      })
    : null;
  if (!program || !personalLearningPilotAllows(program.settings, enrollmentId))
    throw new ApplicationError('NOT_FOUND', 'pilot unavailable');
  return { scope, actorUserId: userId };
}

/** Existing Answer/Assessment routes remain V1 routes, but a reserved Program cannot bypass the Pilot flag. */
export async function requirePersonalLearningPilotForReservedProgram(
  serviceSlug: string,
  enrollmentId: string,
  userId: string,
  service: Pick<PublicServiceContext, 'workspaceId' | 'serviceId'>,
) {
  const db = await import('@bunshin/database');
  const enrollment = await db.prisma.programEnrollment.findFirst({
    where: {
      id: enrollmentId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
    },
    select: { serviceProgramId: true },
  });
  if (!enrollment) return;
  const program = await db.prisma.serviceProgram.findFirst({
    where: {
      id: enrollment.serviceProgramId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
    },
    select: { settings: true },
  });
  if (program && isPersonalLearningPilotProgram(program.settings))
    await resolvePersonalLearningPilot(serviceSlug, enrollmentId, userId);
}
