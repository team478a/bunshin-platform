import { createHash } from 'node:crypto';
import {
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_EXPORT_MAX_ROWS,
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
      select: { id: true },
    }),
  ]);
  if (!membership || !program) return { outcome: 'NOT_FOUND' } as const;
  return { outcome: 'OWNED', enrollment, membership } as const;
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
  const rows = { answers, profiles, assignments, snapshots, goals, preferences, activities };
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
