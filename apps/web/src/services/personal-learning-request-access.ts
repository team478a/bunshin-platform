import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import type { PersonalLearningActor } from '@bunshin/application';
import { resolveMemberServiceContext } from './public-service';
import { requireAiTrainingUsageConsent } from './ai-training-consent';

/** Incomplete lesson flow must not be exposed in production. No learner allowlist. */
export function personalLearningRequestEnabled() {
  return (
    process.env['PERSONAL_LEARNING_REQUEST_INTAKE'] === 'true' &&
    ['development', 'staging'].includes(getServerEnvironment().APP_ENV)
  );
}
export async function resolvePersonalLearningRequestActor(
  slug: string,
  enrollmentId: string,
  userId: string,
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
      serviceRole: 'PARTICIPANT',
    },
    select: { id: true },
  });
  if (!member) throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
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
      programEnrollmentId: enrollmentId,
      groupMembershipId: member.id,
      userId,
    },
  };
}
