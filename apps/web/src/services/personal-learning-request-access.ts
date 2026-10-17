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
  selectedTopicId?: string | null,
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
  let topicId: string | undefined;
  const multiTopicEnabled =
    dynamic && personalLearningFeatureEnabled(program.settings, 'multiTopic');
  if (multiTopicEnabled) {
    const topics = await db.prisma.personalLearningTopic.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        programEnrollmentId: enrollment.id,
        groupMembershipId: member.id,
        userId,
        status: 'ACTIVE',
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 4,
      select: { id: true },
    });
    if (selectedTopicId !== undefined && selectedTopicId !== null) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedTopicId))
        throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
      const selected = topics.find((topic) => topic.id === selectedTopicId);
      if (!selected) throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
      topicId = selected.id;
    } else if (topics.length === 1) {
      // A single migrated theme keeps the enrollment URL and one-theme experience unchanged.
      topicId = topics[0]!.id;
    }
  } else {
    // multiTopic OFF keeps the original single-theme route bound to its oldest migrated wish.
    // This reads the existing request table only; the D-1 topic table stays untouched while OFF.
    const initial = await db.prisma.personalLearningRequest.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        programEnrollmentId: enrollment.id,
        groupMembershipId: member.id,
        userId,
        topicId: { not: null },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { topicId: true },
    });
    if (initial?.topicId) {
      if (selectedTopicId && selectedTopicId !== initial.topicId)
        throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
      topicId = initial.topicId;
    } else if (selectedTopicId) {
      throw new ApplicationError('NOT_FOUND', 'learning request unavailable');
    }
  }
  return {
    actorUserId: userId,
    ...(topicId ? { topicId } : {}),
    scope: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      programEnrollmentId: enrollment.id,
      groupMembershipId: member.id,
      userId,
    },
  };
}
