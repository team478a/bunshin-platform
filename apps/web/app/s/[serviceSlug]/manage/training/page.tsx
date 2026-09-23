import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  AI_TRAINING_HELP_RESOLVED_EVENT,
  AI_TRAINING_V1_MODULE_KEY,
} from '@bunshin/capability-training';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { buildAiTrainingAdminDashboard } from '../../../../../src/services/ai-training-admin-dashboard';
import { buildAiTrainingPilotAnalytics } from '../../../../../src/services/ai-training-pilot-analytics';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { TrainingAdminDashboard } from './training-admin-dashboard';

export const dynamic = 'force-dynamic';

const formText = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
};

async function updateTrainingOperations(formData: FormData) {
  'use server';
  const serviceSlug = formText(formData, 'serviceSlug');
  const programId = formText(formData, 'programId');
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor || !serviceSlug || !programId) return;
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) return;
  const db = await import('@bunshin/database');
  const program = await db.prisma.serviceProgram.findFirst({
    where: {
      id: programId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
    },
    select: { id: true, settings: true },
  });
  if (!program || typeof program.settings !== 'object' || program.settings === null) return;
  const hour = Number(formText(formData, 'notificationHour'));
  const reminderHours = Number(formText(formData, 'postponedReminderHours'));
  await db.prisma.serviceProgram.update({
    where: { id: program.id },
    data: {
      settings: {
        ...(program.settings as Record<string, unknown>),
        trainingOperations: {
          notificationsEnabled: formData.get('notificationsEnabled') === 'on',
          notificationHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 9,
          postponedReminderEnabled: formData.get('postponedReminderEnabled') === 'on',
          postponedReminderHours:
            Number.isInteger(reminderHours) && reminderHours >= 1 && reminderHours <= 168
              ? reminderHours
              : 24,
          helpQueueEnabled: formData.get('helpQueueEnabled') === 'on',
        },
      },
    },
  });
  revalidatePath(`/s/${serviceSlug}/manage/training`);
}

async function resolveTrainingHelp(formData: FormData) {
  'use server';
  const serviceSlug = formText(formData, 'serviceSlug');
  const helpEventId = formText(formData, 'helpEventId');
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor || !serviceSlug || !helpEventId) return;
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) return;
  const db = await import('@bunshin/database');
  const help = await db.prisma.programActionEvent.findFirst({
    where: {
      id: helpEventId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      eventType: 'HELP_REQUESTED',
    },
  });
  if (!help) return;
  await db.prisma.programActionEvent.upsert({
    where: {
      workspaceId_groupId_idempotencyKey: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        idempotencyKey: `training-help-resolved:${help.id}`,
      },
    },
    update: {},
    create: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      programEnrollmentId: help.programEnrollmentId,
      missionAssignmentId: help.missionAssignmentId,
      eventType: AI_TRAINING_HELP_RESOLVED_EVENT,
      sourceResourceType: 'PROGRAM_ACTION_EVENT',
      sourceResourceId: help.id,
      idempotencyKey: `training-help-resolved:${help.id}`,
      schemaVersion: 1,
      metadata: { helpRequestEventId: help.id },
      actorUserId: actor.userId,
      occurredAt: new Date(),
    },
  });
  revalidatePath(`/s/${serviceSlug}/manage/training`);
}

export default async function AiTrainingAdminPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/training`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const programs = await db.prisma.serviceProgram.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      status: { in: ['ACTIVE', 'SUSPENDED'] },
      settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
    },
    select: { id: true, displayName: true, settings: true },
    orderBy: { createdAt: 'desc' },
  });
  const programIds = programs.map(({ id }) => id);
  const enrollments =
    programIds.length === 0
      ? []
      : await db.prisma.programEnrollment.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            serviceProgramId: { in: programIds },
            status: { in: ['INVITED', 'ACTIVE', 'COMPLETED', 'EXPIRED'] },
          },
          select: {
            id: true,
            serviceProgramId: true,
            groupMembershipId: true,
            status: true,
          },
          orderBy: { updatedAt: 'desc' },
        });
  const enrollmentIds = enrollments.map(({ id }) => id);
  const membershipIds = enrollments.map(({ groupMembershipId }) => groupMembershipId);
  const [memberships, profiles, snapshots, assignments, answers, toolkitItems] =
    enrollmentIds.length === 0
      ? [[], [], [], [], [], []]
      : await Promise.all([
          db.prisma.groupMembership.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              id: { in: membershipIds },
              serviceRole: 'PARTICIPANT',
              status: { in: ['ACTIVE', 'SUSPENDED'] },
            },
            select: {
              id: true,
              user: { select: { displayName: true, email: true } },
            },
          }),
          db.prisma.trainingParticipantProfile.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              programEnrollmentId: { in: enrollmentIds },
            },
            select: {
              programEnrollmentId: true,
              role: true,
              aiLevel: true,
              currentTopic: true,
              needsReview: true,
              recentFailures: true,
              learningGoalKey: true,
              updatedAt: true,
            },
          }),
          db.prisma.programProgressSnapshot.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              programEnrollmentId: { in: enrollmentIds },
            },
            select: {
              programEnrollmentId: true,
              phaseKey: true,
              stateKey: true,
              bottleneckKey: true,
              completedMissionCount: true,
              lastActionAt: true,
            },
          }),
          db.prisma.programMissionAssignment.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              programEnrollmentId: { in: enrollmentIds },
            },
            select: {
              programEnrollmentId: true,
              missionDefinitionKey: true,
              displaySnapshot: true,
            },
            orderBy: [{ programEnrollmentId: 'asc' }, { sequence: 'desc' }],
          }),
          db.prisma.trainingMissionAnswer.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              programEnrollmentId: { in: enrollmentIds },
              evaluationStatus: 'READY',
            },
            select: {
              programEnrollmentId: true,
              evaluation: true,
              evaluatedAt: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
          }),
          db.prisma.trainingToolkitItem.findMany({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              programEnrollmentId: { in: enrollmentIds },
            },
            select: { programEnrollmentId: true },
          }),
        ]);
  const programById = new Map(programs.map((item) => [item.id, item]));
  const membershipById = new Map(memberships.map((item) => [item.id, item]));
  const profileByEnrollment = new Map(profiles.map((item) => [item.programEnrollmentId, item]));
  const snapshotByEnrollment = new Map(snapshots.map((item) => [item.programEnrollmentId, item]));
  const assignmentByEnrollment = new Map<string, (typeof assignments)[number]>();
  for (const assignment of assignments) {
    if (!assignmentByEnrollment.has(assignment.programEnrollmentId))
      assignmentByEnrollment.set(assignment.programEnrollmentId, assignment);
  }
  const answerByEnrollment = new Map<string, (typeof answers)[number]>();
  for (const answer of answers) {
    if (!answerByEnrollment.has(answer.programEnrollmentId))
      answerByEnrollment.set(answer.programEnrollmentId, answer);
  }
  const dashboard = buildAiTrainingAdminDashboard(
    enrollments.flatMap((enrollment) => {
      const member = membershipById.get(enrollment.groupMembershipId);
      const program = programById.get(enrollment.serviceProgramId);
      if (!member || !program) return [];
      const profile = profileByEnrollment.get(enrollment.id) ?? null;
      const answer = answerByEnrollment.get(enrollment.id) ?? null;
      return [
        {
          enrollmentId: enrollment.id,
          enrollmentStatus: enrollment.status,
          programName: program.displayName,
          participantName: member.user.displayName || member.user.email || '参加者',
          participantEmail: member.user.email,
          profile,
          progress: snapshotByEnrollment.get(enrollment.id) ?? null,
          assignment: assignmentByEnrollment.get(enrollment.id) ?? null,
          latestEvaluation: answer?.evaluation ?? null,
          evaluationUpdatedAt: answer?.updatedAt ?? null,
          profileUpdatedAt: profile?.updatedAt ?? null,
        },
      ];
    }),
    new Date(),
  );
  const analytics = buildAiTrainingPilotAnalytics({
    enrollmentIds,
    assessedEnrollmentIds: profiles.map(({ programEnrollmentId }) => programEnrollmentId),
    goalEnrollmentIds: profiles.flatMap(({ programEnrollmentId, learningGoalKey }) =>
      learningGoalKey ? [programEnrollmentId] : [],
    ),
    presentedEnrollmentIds: assignments.map(({ programEnrollmentId }) => programEnrollmentId),
    answers: answers.map(({ programEnrollmentId, evaluation, evaluatedAt }) => ({
      programEnrollmentId,
      evaluation,
      evaluatedAt,
    })),
    toolkitEnrollmentIds: toolkitItems.map(({ programEnrollmentId }) => programEnrollmentId),
  });
  const helpEvents =
    enrollmentIds.length === 0
      ? []
      : await db.prisma.programActionEvent.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            programEnrollmentId: { in: enrollmentIds },
            eventType: { in: ['HELP_REQUESTED', AI_TRAINING_HELP_RESOLVED_EVENT] },
          },
          orderBy: { occurredAt: 'desc' },
        });
  const resolvedHelpIds = new Set(
    helpEvents.flatMap((event) =>
      event.eventType === AI_TRAINING_HELP_RESOLVED_EVENT &&
      typeof event.metadata === 'object' &&
      event.metadata !== null &&
      !Array.isArray(event.metadata) &&
      typeof (event.metadata as Record<string, unknown>)['helpRequestEventId'] === 'string'
        ? [(event.metadata as Record<string, unknown>)['helpRequestEventId'] as string]
        : [],
    ),
  );
  const enrollmentById = new Map(enrollments.map((item) => [item.id, item]));
  const unresolvedHelp = helpEvents.filter(
    (event) => event.eventType === 'HELP_REQUESTED' && !resolvedHelpIds.has(event.id),
  );

  const helpRequests = unresolvedHelp.map((event) => {
    const enrollment = enrollmentById.get(event.programEnrollmentId);
    const membership = enrollment ? membershipById.get(enrollment.groupMembershipId) : null;
    return {
      id: event.id,
      participantName: membership?.user.displayName || membership?.user.email || '参加者',
      occurredAt: event.occurredAt,
    };
  });

  return (
    <TrainingAdminDashboard
      serviceSlug={serviceSlug}
      programs={programs}
      dashboard={dashboard}
      analytics={analytics}
      helpRequests={helpRequests}
      updateTrainingOperations={updateTrainingOperations}
      resolveTrainingHelp={resolveTrainingHelp}
    />
  );
}
