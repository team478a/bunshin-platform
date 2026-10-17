import { createHash } from 'node:crypto';
import {
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_EXPORT_MAX_ROWS,
  personalLearningDynamicContentDeletionDue,
  personalLearningDynamicSummaryDeletionDue,
  personalLearningMode,
  trainingAnswerRetentionCutoff,
  trainingEndRetentionEligibility,
  trainingRetentionEndDate,
  type TrainingRetentionExecutionScope,
} from '@bunshin/capability-training';
import type { Prisma } from '@prisma/client';
import { TRAINING_ENROLLMENT_EXPIRED_EVENT } from './training-audit-events';

export async function trainingRetentionOwner(
  tx: Prisma.TransactionClient,
  input: TrainingRetentionExecutionScope,
) {
  const admin = await tx.platformAdmin.findFirst({
    where: {
      userId: input.operatorUserId,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      user: { status: 'ACTIVE' },
    },
    select: { id: true },
  });
  if (!admin) return { outcome: 'FORBIDDEN' } as const;
  const scope = { workspaceId: input.workspaceId, groupId: input.groupId };
  const enrollment = await tx.programEnrollment.findFirst({
    where: { ...scope, id: input.programEnrollmentId },
    select: {
      id: true,
      groupMembershipId: true,
      serviceProgramId: true,
      status: true,
      endsAt: true,
      updatedAt: true,
    },
  });
  if (!enrollment) return { outcome: 'NOT_FOUND' } as const;
  const [membership, program] = await Promise.all([
    tx.groupMembership.findFirst({
      where: { ...scope, id: enrollment.groupMembershipId, serviceRole: 'PARTICIPANT' },
      select: { id: true, userId: true },
    }),
    tx.serviceProgram.findFirst({
      where: {
        ...scope,
        id: enrollment.serviceProgramId,
        settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
      },
      select: { id: true, settings: true },
    }),
  ]);
  if (!membership || !program) return { outcome: 'NOT_FOUND' } as const;
  return { outcome: 'OWNED', enrollment, membership, program } as const;
}

export async function trainingRetentionSnapshot(
  tx: Prisma.TransactionClient,
  input: TrainingRetentionExecutionScope,
  owned: Extract<Awaited<ReturnType<typeof trainingRetentionOwner>>, { outcome: 'OWNED' }>,
) {
  const scope = {
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    programEnrollmentId: input.programEnrollmentId,
  };
  const personal = { ...scope, userId: owned.membership.userId };
  const state = await tx.trainingDataRetentionState.findFirst({
    where: scope,
    select: { endedAt: true, workRedactedAt: true, progressPurgedAt: true, updatedAt: true },
  });
  if (personalLearningMode(owned.program.settings) === 'DYNAMIC_V1') {
    return dynamicTrainingRetentionSnapshot(tx, input, owned, state);
  }
  const endedAt = trainingRetentionEndDate({
    ...owned.enrollment,
    recordedEnd: state?.endedAt ?? null,
  });
  const eligibility = trainingEndRetentionEligibility(endedAt, input.now);
  const work = eligibility.workInformationDue && !state?.workRedactedAt;
  const progress = eligibility.progressAndScoresDue && !state?.progressPurgedAt;
  const select = { id: true, updatedAt: true } as const;
  const options = { select, orderBy: { id: 'asc' as const }, take: TRAINING_EXPORT_MAX_ROWS + 1 };
  const answers = await tx.trainingMissionAnswer.findMany({
    where: { ...personal, createdAt: { lte: trainingAnswerRetentionCutoff(input.now) } },
    ...options,
    select: { ...select, missionAssignmentId: true },
  });
  const [profiles, assignments, snapshots, goals, preferences, activities, retainedToolkit] =
    await Promise.all([
      work || progress
        ? tx.trainingParticipantProfile.findMany({
            ...options,
            where: { ...personal, groupMembershipId: owned.membership.id },
          })
        : [],
      work || progress ? tx.programMissionAssignment.findMany({ ...options, where: scope }) : [],
      progress ? tx.programProgressSnapshot.findMany({ ...options, where: scope }) : [],
      work || progress
        ? tx.programMemberGoal.findMany({
            ...options,
            where: { ...scope, groupMembershipId: owned.membership.id },
          })
        : [],
      work || progress
        ? tx.programMemberPreference.findMany({
            ...options,
            where: { ...scope, groupMembershipId: owned.membership.id },
          })
        : [],
      tx.programActionEvent.findMany({
        where:
          work || progress
            ? { ...scope, eventType: { not: TRAINING_ENROLLMENT_EXPIRED_EVENT } }
            : {
                ...scope,
                sourceResourceType: 'TRAINING_MISSION_ANSWER',
                sourceResourceId: { in: answers.map(({ id }) => id) },
              },
        select: { id: true, createdAt: true },
        orderBy: { id: 'asc' },
        take: TRAINING_EXPORT_MAX_ROWS + 1,
      }),
      tx.trainingToolkitItem.count({ where: personal }),
    ]);
  const learningRequests =
    work || progress
      ? await tx.personalLearningRequest.findMany({
          ...options,
          where: { ...personal, groupMembershipId: owned.membership.id },
        })
      : [];
  const rows = {
    answers,
    profiles,
    assignments,
    snapshots,
    goals,
    preferences,
    activities,
    learningRequests,
  };
  if (Object.values(rows).some((list) => list.length > TRAINING_EXPORT_MAX_ROWS))
    return { outcome: 'TOO_LARGE' } as const;
  const counts = {
    answers: answers.length,
    workProfiles: work && !progress ? profiles.length : 0,
    progressProfiles: progress ? profiles.length : 0,
    progressSnapshots: snapshots.length,
    assignmentSnapshots: work && !progress ? assignments.length : 0,
    assignments: progress ? assignments.length : 0,
    activities: activities.length,
    goals: goals.length,
    preferences: preferences.length,
    retainedToolkit,
    ...(learningRequests.length > 0 ? { learningRequests: learningRequests.length } : {}),
  };
  const revision = createHash('sha256')
    .update(
      JSON.stringify({
        scope,
        operator: input.operatorUserId,
        membership: owned.membership,
        enrollment: owned.enrollment,
        state,
        work,
        progress,
        rows,
        retainedToolkit,
      }),
    )
    .digest('hex');
  return {
    outcome: 'PREVIEW',
    dynamic: false as const,
    rows,
    scope,
    personal,
    state,
    endedAt,
    work,
    progress,
    preview: {
      revision,
      counts,
      endDateUnresolved:
        ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(owned.enrollment.status) &&
        !eligibility.endDateKnown,
    },
  } as const;
}

const DYNAMIC_LEARNER_ACTION_EVENTS = [
  'PERSONAL_LEARNING_CONVERSATION_MESSAGE',
  'PERSONAL_LEARNING_CONVERSATION_SHARE',
  'PERSONAL_LEARNING_SUPPORT_REQUEST',
  'PERSONAL_LEARNING_PRACTICE_NOTE',
  'PERSONAL_LEARNING_PRACTICE_STARTED',
  'PERSONAL_LEARNING_CAPABILITY_INTERACTION',
  'PERSONAL_LEARNING_PRACTICE_COMPLETED',
  'PERSONAL_LEARNING_FIRST_SUCCESS',
  'PERSONAL_LEARNING_NEXT_TASK_STARTED',
  'ANSWER_SUBMITTED',
] as const;
const DYNAMIC_CONTENT_EVENTS = [
  ...DYNAMIC_LEARNER_ACTION_EVENTS,
  'PERSONAL_LEARNING_CONVERSATION_RESPONSE',
  'PERSONAL_LEARNING_SUPPORT_RESPONSE',
] as const;

const DYNAMIC_CONTENT_EVENT_TYPES = [
  ...DYNAMIC_CONTENT_EVENTS,
  'PERSONAL_LEARNING_NEXT_TASK_PROPOSED',
] as const;

async function dynamicTrainingRetentionSnapshot(
  tx: Prisma.TransactionClient,
  input: TrainingRetentionExecutionScope,
  owned: Extract<Awaited<ReturnType<typeof trainingRetentionOwner>>, { outcome: 'OWNED' }>,
  state: {
    endedAt: Date | null;
    workRedactedAt: Date | null;
    progressPurgedAt: Date | null;
    updatedAt: Date;
  } | null,
) {
  const scope = {
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    programEnrollmentId: input.programEnrollmentId,
  };
  const personal = { ...scope, userId: owned.membership.userId };
  const endedAt = trainingRetentionEndDate({
    ...owned.enrollment,
    recordedEnd: state?.endedAt ?? null,
  });
  const [learnerEvents, requests, answerDates, dueImages] = await Promise.all([
    tx.programActionEvent.findMany({
      where: {
        ...scope,
        actorUserId: owned.membership.userId,
        eventType: { in: [...DYNAMIC_LEARNER_ACTION_EVENTS] },
      },
      select: { id: true, occurredAt: true },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: TRAINING_EXPORT_MAX_ROWS + 1,
    }),
    tx.personalLearningRequest.findMany({
      where: { ...personal, groupMembershipId: owned.membership.id },
      select: { id: true, createdAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
      take: TRAINING_EXPORT_MAX_ROWS + 1,
    }),
    tx.trainingMissionAnswer.findMany({
      where: personal,
      select: { id: true, missionAssignmentId: true, createdAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
      take: TRAINING_EXPORT_MAX_ROWS + 1,
    }),
    tx.personalLearningPracticeSupportImage.findMany({
      where: {
        ...scope,
        userId: owned.membership.userId,
        createdAt: { lte: new Date(input.now.getTime() - 90 * 86_400_000) },
      },
      select: { id: true, requestEventId: true, createdAt: true },
      orderBy: { id: 'asc' },
      take: TRAINING_EXPORT_MAX_ROWS + 1,
    }),
  ]);
  if (
    [learnerEvents, requests, answerDates, dueImages].some(
      (rows) => rows.length > TRAINING_EXPORT_MAX_ROWS,
    )
  )
    return { outcome: 'TOO_LARGE' } as const;
  const lastLearnerUseAt = [
    ...learnerEvents.map(({ occurredAt }) => occurredAt),
    ...requests.map(({ createdAt }) => createdAt),
    ...answerDates.map(({ createdAt }) => createdAt),
  ].reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null);
  const contentDue = personalLearningDynamicContentDeletionDue({
    endedAt,
    lastLearnerUseAt,
    now: input.now,
  });
  const summaryDue = personalLearningDynamicSummaryDeletionDue({
    endedAt,
    lastLearnerUseAt,
    now: input.now,
  });
  const selectedAnswers = contentDue ? answerDates : [];
  const selectedRequests = contentDue ? requests : [];
  const contentEvents = contentDue
    ? await tx.programActionEvent.findMany({
        where: {
          ...scope,
          OR: [
            {
              actorUserId: owned.membership.userId,
              eventType: { in: [...DYNAMIC_CONTENT_EVENT_TYPES] },
            },
            {
              sourceResourceType: 'TRAINING_MISSION_ANSWER',
              sourceResourceId: { in: selectedAnswers.map(({ id }) => id) },
            },
          ],
        },
        select: { id: true, eventType: true, createdAt: true },
        orderBy: { id: 'asc' },
        take: TRAINING_EXPORT_MAX_ROWS + 1,
      })
    : [];
  const [profiles, assignments, snapshots, goals, preferences, toolkit] = summaryDue
    ? await Promise.all([
        tx.trainingParticipantProfile.findMany({
          where: { ...personal, groupMembershipId: owned.membership.id },
          select: { id: true, updatedAt: true },
          orderBy: { id: 'asc' },
          take: TRAINING_EXPORT_MAX_ROWS + 1,
        }),
        tx.programMissionAssignment.findMany({
          where: scope,
          select: { id: true, updatedAt: true },
          orderBy: { id: 'asc' },
          take: TRAINING_EXPORT_MAX_ROWS + 1,
        }),
        tx.programProgressSnapshot.findMany({
          where: scope,
          select: { id: true, updatedAt: true },
          orderBy: { id: 'asc' },
          take: TRAINING_EXPORT_MAX_ROWS + 1,
        }),
        tx.programMemberGoal.findMany({
          where: { ...scope, groupMembershipId: owned.membership.id },
          select: { id: true, updatedAt: true },
          orderBy: { id: 'asc' },
          take: TRAINING_EXPORT_MAX_ROWS + 1,
        }),
        tx.programMemberPreference.findMany({
          where: { ...scope, groupMembershipId: owned.membership.id },
          select: { id: true, updatedAt: true },
          orderBy: { id: 'asc' },
          take: TRAINING_EXPORT_MAX_ROWS + 1,
        }),
        tx.trainingToolkitItem.findMany({
          where: personal,
          select: { id: true, updatedAt: true },
          orderBy: { id: 'asc' },
          take: TRAINING_EXPORT_MAX_ROWS + 1,
        }),
      ])
    : [[], [], [], [], [], []];
  const rows = {
    answers: selectedAnswers,
    profiles,
    assignments,
    snapshots,
    goals,
    preferences,
    activities: contentEvents,
    learningRequests: selectedRequests,
    practiceSupportImages: dueImages,
    toolkit,
  };
  if (Object.values(rows).some((list) => list.length > TRAINING_EXPORT_MAX_ROWS))
    return { outcome: 'TOO_LARGE' } as const;
  const counts = {
    answers: selectedAnswers.length,
    workProfiles: contentDue && !summaryDue ? profiles.length : 0,
    progressProfiles: summaryDue ? profiles.length : 0,
    progressSnapshots: snapshots.length,
    assignmentSnapshots: contentDue && !summaryDue ? assignments.length : 0,
    assignments: summaryDue ? assignments.length : 0,
    activities: contentEvents.length,
    goals: goals.length,
    preferences: preferences.length,
    retainedToolkit: 0,
    toolkitDue: toolkit.length,
    learningRequests: selectedRequests.length,
    conversationEvents: contentEvents.filter(({ eventType }) =>
      eventType.startsWith('PERSONAL_LEARNING_CONVERSATION_'),
    ).length,
    practiceSupportImages: dueImages.length,
  };
  const revision = createHash('sha256')
    .update(
      JSON.stringify({
        scope,
        operator: input.operatorUserId,
        state,
        endedAt,
        lastLearnerUseAt,
        rows,
      }),
    )
    .digest('hex');
  return {
    outcome: 'PREVIEW' as const,
    dynamic: true as const,
    rows,
    scope,
    personal,
    state,
    endedAt,
    work: contentDue,
    progress: summaryDue,
    preview: {
      revision,
      counts,
      endDateUnresolved:
        ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(owned.enrollment.status) && !endedAt,
    },
  };
}
