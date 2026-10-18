import 'server-only';
import type { PersonalLearningActor } from '@bunshin/application';
import { personalLearningFeatureEnabled } from '@bunshin/capability-training';

/** Resolve this switch from the server-side enrollment/program, never from client input. */
export async function resolvePersonalLearningExtendedScope(actor: PersonalLearningActor) {
  const db = await import('@bunshin/database');
  const enrollment = await db.prisma.programEnrollment.findFirst({
    where: {
      id: actor.scope.programEnrollmentId,
      workspaceId: actor.scope.workspaceId,
      groupId: actor.scope.groupId,
      groupMembershipId: actor.scope.groupMembershipId,
    },
    select: { serviceProgramId: true },
  });
  const program = enrollment
    ? await db.prisma.serviceProgram.findFirst({
        where: {
          id: enrollment.serviceProgramId,
          workspaceId: actor.scope.workspaceId,
          groupId: actor.scope.groupId,
          settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
        },
        select: { settings: true },
      })
    : null;
  return personalLearningFeatureEnabled(program?.settings, 'extendedScope');
}
