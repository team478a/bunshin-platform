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
    where: {
      ...scope,
      id: input.programEnrollmentId,
      ...(input.serviceProgramId ? { serviceProgramId: input.serviceProgramId } : {}),
    },
    select: {
      id: true,
      groupMembershipId: true,
      serviceProgramId: true,
      status: true,
      startsAt: true,
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
  // D tables can outlive the feature/mode which created them. Keep their cleanup path
  // reachable after an operator disables DYNAMIC_V1 or multiTopic.
  const [dynamicTopics, personaItems, personaSuppressions, savedExamples, personaProfiles] =
    await Promise.all([
      tx.personalLearningTopic.count({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: input.programEnrollmentId,
          groupMembershipId: owned.membership.id,
          userId: owned.membership.userId,
        },
      }),
      tx.personalLearningPersonaItem.count({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: owned.membership.id,
          userId: owned.membership.userId,
        },
      }),
      tx.personalLearningPersonaSuppression.count({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: owned.membership.id,
          userId: owned.membership.userId,
        },
      }),
      tx.personalLearningSavedExample.count({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: owned.membership.id,
          userId: owned.membership.userId,
        },
      }),
      tx.personalLearningPersonaProfile.count({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: owned.membership.id,
          userId: owned.membership.userId,
        },
      }),
    ]);
  if (dynamicTopics + personaItems + personaSuppressions + savedExamples + personaProfiles > 0) {
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
  const [learnerEvents, latestRequest, latestAnswer, latestLineText, dueImages, dueImageCount] =
    await Promise.all([
      tx.programActionEvent.findMany({
        where: {
          ...scope,
          actorUserId: owned.membership.userId,
          eventType: { in: [...DYNAMIC_LEARNER_ACTION_EVENTS] },
        },
        select: { id: true, occurredAt: true },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 1,
      }),
      tx.personalLearningRequest.findFirst({
        where: { ...personal, groupMembershipId: owned.membership.id },
        select: { createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      tx.trainingMissionAnswer.findFirst({
        where: personal,
        select: { createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      tx.personalLearningLineInbox.findFirst({
        where: { ...personal },
        select: { createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      tx.personalLearningPracticeSupportImage.findMany({
        where: {
          ...scope,
          userId: owned.membership.userId,
          createdAt: { lte: new Date(input.now.getTime() - 90 * 86_400_000) },
        },
        select: { id: true, requestEventId: true, createdAt: true },
        orderBy: { id: 'asc' },
        take: TRAINING_EXPORT_MAX_ROWS,
      }),
      tx.personalLearningPracticeSupportImage.count({
        where: {
          ...scope,
          userId: owned.membership.userId,
          createdAt: { lte: new Date(input.now.getTime() - 90 * 86_400_000) },
        },
      }),
    ]);
  const lastLearnerUseAt =
    [
      ...learnerEvents.map(({ occurredAt }) => occurredAt),
      ...(latestRequest ? [latestRequest.createdAt] : []),
      ...(latestAnswer ? [latestAnswer.createdAt] : []),
      ...(latestLineText ? [latestLineText.createdAt] : []),
    ].reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null) ??
    owned.enrollment.startsAt;
  const [serviceEnrollments, latestDynamicDataUse] = await Promise.all([
    tx.programEnrollment.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: owned.membership.id,
      },
      select: { id: true, status: true, startsAt: true, endsAt: true },
      orderBy: { id: 'asc' },
      take: TRAINING_EXPORT_MAX_ROWS + 1,
    }),
    Promise.all([
      tx.personalLearningSavedExample.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: owned.membership.id,
          userId: owned.membership.userId,
          lastLearnerUseAt: { not: null },
        },
        select: { lastLearnerUseAt: true },
        orderBy: [{ lastLearnerUseAt: 'desc' }, { id: 'desc' }],
      }),
      tx.personalLearningPersonaItem.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: owned.membership.id,
          userId: owned.membership.userId,
          lastLearnerUseAt: { not: null },
        },
        select: { lastLearnerUseAt: true },
        orderBy: [{ lastLearnerUseAt: 'desc' }, { id: 'desc' }],
      }),
      tx.personalLearningTopic.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: owned.membership.id,
          userId: owned.membership.userId,
          lastLearnerUseAt: { not: null },
        },
        select: { lastLearnerUseAt: true },
        orderBy: [{ lastLearnerUseAt: 'desc' }, { id: 'desc' }],
      }),
      tx.personalLearningPersonaProfile.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: owned.membership.id,
          userId: owned.membership.userId,
          lastLearnerUseAt: { not: null },
        },
        select: { lastLearnerUseAt: true },
        orderBy: [{ lastLearnerUseAt: 'desc' }, { id: 'desc' }],
      }),
    ]),
  ]);
  if (serviceEnrollments.length > TRAINING_EXPORT_MAX_ROWS)
    return { outcome: 'TOO_LARGE' } as const;
  const serviceEnrollmentIds = serviceEnrollments.map(({ id }) => id);
  const siblingStates = await tx.trainingDataRetentionState.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programEnrollmentId: { in: serviceEnrollmentIds },
    },
    select: { programEnrollmentId: true, endedAt: true },
  });
  const siblingEndById = new Map(
    siblingStates.map(({ programEnrollmentId, endedAt }) => [programEnrollmentId, endedAt]),
  );
  const serviceHasActiveEnrollment = serviceEnrollments.some(({ status }) => status === 'ACTIVE');
  const serviceEndUnresolved = serviceEnrollments.some(
    (enrollment) =>
      enrollment.status !== 'INVITED' &&
      enrollment.status !== 'ACTIVE' &&
      !trainingRetentionEndDate({
        ...enrollment,
        recordedEnd: siblingEndById.get(enrollment.id) ?? null,
      }),
  );
  const serviceEnds = serviceEnrollments
    .map((enrollment) =>
      trainingRetentionEndDate({
        ...enrollment,
        recordedEnd: siblingEndById.get(enrollment.id) ?? null,
      }),
    )
    .filter((value): value is Date => value instanceof Date);
  const serviceEndedAt = serviceEndUnresolved
    ? null
    : serviceEnds.reduce<Date | null>(
        (latest, date) => (!latest || date > latest ? date : latest),
        null,
      );
  const [latestServiceEvent, latestServiceRequest, latestServiceAnswer, latestServiceLineText] =
    await Promise.all([
      tx.programActionEvent.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: { in: serviceEnrollmentIds },
          actorUserId: owned.membership.userId,
          eventType: { in: [...DYNAMIC_LEARNER_ACTION_EVENTS] },
        },
        select: { occurredAt: true },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      }),
      tx.personalLearningRequest.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: { in: serviceEnrollmentIds },
          userId: owned.membership.userId,
          groupMembershipId: owned.membership.id,
        },
        select: { createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      tx.trainingMissionAnswer.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: { in: serviceEnrollmentIds },
          userId: owned.membership.userId,
        },
        select: { createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      tx.personalLearningLineInbox.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: { in: serviceEnrollmentIds },
          groupMembershipId: owned.membership.id,
          userId: owned.membership.userId,
        },
        select: { createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
  const serviceFallbackStart = serviceEnrollments
    .map(({ startsAt }) => startsAt)
    .filter((value): value is Date => value instanceof Date)
    .reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null);
  const serviceLastLearnerUseAt =
    [
      latestServiceEvent?.occurredAt,
      latestServiceRequest?.createdAt,
      latestServiceAnswer?.createdAt,
      latestServiceLineText?.createdAt,
      ...latestDynamicDataUse.map((row) => row?.lastLearnerUseAt),
    ]
      .filter((value): value is Date => value instanceof Date)
      .reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null) ??
    serviceFallbackStart;
  const latestEnrollmentTopicUse = await tx.personalLearningTopic.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programEnrollmentId: input.programEnrollmentId,
      groupMembershipId: owned.membership.id,
      userId: owned.membership.userId,
      lastLearnerUseAt: { not: null },
    },
    select: { lastLearnerUseAt: true },
    orderBy: [{ lastLearnerUseAt: 'desc' }, { id: 'desc' }],
  });
  const summaryLastLearnerUseAt = [lastLearnerUseAt, latestEnrollmentTopicUse?.lastLearnerUseAt]
    .filter((value): value is Date => value instanceof Date)
    .reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null);
  const contentDue = personalLearningDynamicContentDeletionDue({
    endedAt,
    lastLearnerUseAt,
    now: input.now,
  });
  const summaryDue = personalLearningDynamicSummaryDeletionDue({
    endedAt,
    lastLearnerUseAt: summaryLastLearnerUseAt,
    now: input.now,
  });
  const serviceSummaryDue =
    !serviceHasActiveEnrollment &&
    personalLearningDynamicSummaryDeletionDue({
      endedAt: serviceEndedAt,
      lastLearnerUseAt: serviceLastLearnerUseAt,
      now: input.now,
    });
  const [selectedRequests, selectedAnswers] = contentDue
    ? await Promise.all([
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
      ])
    : [[], []];
  if ([selectedRequests, selectedAnswers].some((rows) => rows.length > TRAINING_EXPORT_MAX_ROWS))
    return { outcome: 'TOO_LARGE' } as const;
  const lineInbox = await tx.personalLearningLineInbox.findMany({
    where: {
      ...personal,
      OR: [
        ...(contentDue ? [{ messageType: 'TEXT', text: { not: null } }] : []),
        {
          messageType: 'IMAGE',
          createdAt: { lte: new Date(input.now.getTime() - 90 * 86_400_000) },
        },
      ],
    },
    select: { id: true, createdAt: true, messageType: true, providerEventId: true },
    orderBy: { id: 'asc' },
    take: TRAINING_EXPORT_MAX_ROWS + 1,
  });
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
        take: TRAINING_EXPORT_MAX_ROWS,
      })
    : [];
  const [
    profiles,
    assignments,
    snapshots,
    goals,
    preferences,
    toolkit,
    dynamicTopics,
    personaItems,
    personaSuppressions,
    savedExamples,
    personaProfiles,
  ] =
    summaryDue || serviceSummaryDue
      ? await Promise.all([
          summaryDue
            ? tx.trainingParticipantProfile.findMany({
                where: { ...personal, groupMembershipId: owned.membership.id },
                select: { id: true, updatedAt: true },
                orderBy: { id: 'asc' },
                take: TRAINING_EXPORT_MAX_ROWS + 1,
              })
            : [],
          summaryDue
            ? tx.programMissionAssignment.findMany({
                where: scope,
                select: { id: true, updatedAt: true },
                orderBy: { id: 'asc' },
                take: TRAINING_EXPORT_MAX_ROWS + 1,
              })
            : [],
          summaryDue
            ? tx.programProgressSnapshot.findMany({
                where: scope,
                select: { id: true, updatedAt: true },
                orderBy: { id: 'asc' },
                take: TRAINING_EXPORT_MAX_ROWS + 1,
              })
            : [],
          summaryDue
            ? tx.programMemberGoal.findMany({
                where: { ...scope, groupMembershipId: owned.membership.id },
                select: { id: true, updatedAt: true },
                orderBy: { id: 'asc' },
                take: TRAINING_EXPORT_MAX_ROWS + 1,
              })
            : [],
          summaryDue
            ? tx.programMemberPreference.findMany({
                where: { ...scope, groupMembershipId: owned.membership.id },
                select: { id: true, updatedAt: true },
                orderBy: { id: 'asc' },
                take: TRAINING_EXPORT_MAX_ROWS + 1,
              })
            : [],
          summaryDue
            ? tx.trainingToolkitItem.findMany({
                where: personal,
                select: { id: true, updatedAt: true },
                orderBy: { id: 'asc' },
                take: TRAINING_EXPORT_MAX_ROWS + 1,
              })
            : [],
          summaryDue
            ? tx.personalLearningTopic.findMany({
                where: {
                  ...scope,
                  groupMembershipId: owned.membership.id,
                  userId: owned.membership.userId,
                },
                select: { id: true, updatedAt: true },
                orderBy: { id: 'asc' },
                take: TRAINING_EXPORT_MAX_ROWS + 1,
              })
            : [],
          serviceSummaryDue
            ? tx.personalLearningPersonaItem.findMany({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  groupMembershipId: owned.membership.id,
                  userId: owned.membership.userId,
                },
                select: { id: true, updatedAt: true },
                orderBy: { id: 'asc' },
                take: TRAINING_EXPORT_MAX_ROWS + 1,
              })
            : [],
          serviceSummaryDue
            ? tx.personalLearningPersonaSuppression.findMany({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  groupMembershipId: owned.membership.id,
                  userId: owned.membership.userId,
                },
                select: { id: true, createdAt: true },
                orderBy: { id: 'asc' },
                take: TRAINING_EXPORT_MAX_ROWS + 1,
              })
            : [],
          serviceSummaryDue
            ? tx.personalLearningSavedExample.findMany({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  groupMembershipId: owned.membership.id,
                  userId: owned.membership.userId,
                },
                select: { id: true, updatedAt: true },
                orderBy: { id: 'asc' },
                take: TRAINING_EXPORT_MAX_ROWS + 1,
              })
            : [],
          serviceSummaryDue
            ? tx.personalLearningPersonaProfile.findMany({
                where: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  groupMembershipId: owned.membership.id,
                  userId: owned.membership.userId,
                },
                select: { id: true, updatedAt: true, lastLearnerUseAt: true },
                orderBy: { id: 'asc' },
                take: TRAINING_EXPORT_MAX_ROWS + 1,
              })
            : [],
        ])
      : [[], [], [], [], [], [], [], [], [], [], []];
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
    lineInbox,
    toolkit,
    dynamicTopics,
    personaItems,
    personaSuppressions,
    savedExamples,
    personaProfiles,
  };
  if (
    Object.entries(rows).some(
      ([key, list]) => key !== 'practiceSupportImages' && list.length > TRAINING_EXPORT_MAX_ROWS,
    )
  )
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
    dynamicTopicsDue: dynamicTopics.length,
    personaItemsDue: personaItems.length,
    personaSuppressionsDue: personaSuppressions.length,
    savedExamplesDue: savedExamples.length,
    personaProfilesDue: personaProfiles.length,
    dynamicLearningDataDue:
      dynamicTopics.length +
      personaItems.length +
      personaSuppressions.length +
      savedExamples.length +
      personaProfiles.length,
    learningRequests: selectedRequests.length,
    conversationEvents: contentEvents.filter(({ eventType }) =>
      eventType.startsWith('PERSONAL_LEARNING_CONVERSATION_'),
    ).length,
    practiceSupportImages: dueImages.length,
    lineMessages: lineInbox.length,
  };
  const revision = createHash('sha256')
    .update(
      JSON.stringify({
        scope,
        operator: input.operatorUserId,
        state,
        endedAt,
        lastLearnerUseAt,
        summaryLastLearnerUseAt,
        serviceEndedAt,
        serviceLastLearnerUseAt,
        serviceHasActiveEnrollment,
        serviceEndUnresolved,
        dueImageCount,
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
        (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(owned.enrollment.status) && !endedAt) ||
        serviceEndUnresolved,
    },
  };
}
