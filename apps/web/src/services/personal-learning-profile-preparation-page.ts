import 'server-only';
import { z } from 'zod';
import type { PublicServiceContext } from './public-service';
import {
  personalLearningPreparationAccess,
  recheckPersonalLearningPreparationAccess,
} from './personal-learning-preparation-access';
import { ApplicationError } from '@bunshin/shared';

/** Read-only page gate. The repository rechecks ownership, seat and stopped Program. */
export async function readPersonalLearningProfilePreparation(
  service: Pick<PublicServiceContext, 'workspaceId' | 'serviceId'>,
  enrollmentId: string,
  actorUserId: string,
) {
  const authority = personalLearningPreparationAccess('PERSONAL_LEARNING_PROFILE_PREPARATION');
  if (
    process.env['PERSONAL_LEARNING_PILOT'] === 'true' ||
    process.env['PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'] === 'true' ||
    !z.uuid().safeParse(enrollmentId).success ||
    (authority &&
      (authority.workspaceId !== service.workspaceId || authority.groupId !== service.serviceId))
  )
    throw new ApplicationError('NOT_FOUND', 'profile preparation unavailable');
  const db = await import('@bunshin/database');
  recheckPersonalLearningPreparationAccess('PERSONAL_LEARNING_PROFILE_PREPARATION', authority);
  const result = await new db.PrismaPersonalLearningPilotProfileRepository(
    db.prisma,
    undefined,
    authority,
  ).read({
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    programEnrollmentId: enrollmentId,
    actorUserId,
  });
  recheckPersonalLearningPreparationAccess('PERSONAL_LEARNING_PROFILE_PREPARATION', authority);
  if (
    process.env['PERSONAL_LEARNING_PILOT'] === 'true' ||
    process.env['PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'] === 'true'
  )
    throw new ApplicationError('NOT_FOUND', 'profile preparation unavailable');
  // Do not expose database IDs or updater identity to the client component.
  if (!result.profile) return null;
  const profile = z
    .object({
      role: z.enum(['SALES', 'OFFICE', 'MANAGER', 'OTHER']),
      aiLevel: z.enum(['BEGINNER', 'INTERMEDIATE']),
      dailyMinutes: z.union([z.literal(5), z.literal(10), z.literal(15)]),
    })
    .safeParse(result.profile);
  if (!profile.success) throw new ApplicationError('NOT_FOUND', 'profile preparation unavailable');
  return profile.data;
}
