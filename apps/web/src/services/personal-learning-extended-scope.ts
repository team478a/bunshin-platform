import 'server-only';
import type { PersonalLearningActor } from '@bunshin/application';
import {
  personalLearningFeatureEnabled,
  personalLearningOfferPolicy,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';

/** Resolve offer policy and switches from the server-side enrollment/program, never client input. */
export async function resolvePersonalLearningOfferContext(actor: PersonalLearningActor) {
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
  const offerPolicy = personalLearningOfferPolicy(program?.settings);
  if (!program || !offerPolicy)
    throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
  return {
    offerPolicy,
    extendedScope: personalLearningFeatureEnabled(program.settings, 'extendedScope'),
  } as const;
}

export async function resolvePersonalLearningExtendedScope(actor: PersonalLearningActor) {
  return (await resolvePersonalLearningOfferContext(actor)).extendedScope;
}
