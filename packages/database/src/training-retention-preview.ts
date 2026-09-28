import {
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_RETENTION_MAX_ENROLLMENTS,
  TRAINING_RETENTION_POLICY_VERSION,
  trainingAnswerRetentionCutoff,
  trainingEndRetentionEligibility,
  trainingRetentionEndDate,
  type TrainingRetentionPreviewRepository,
  type TrainingRetentionPreviewResult,
  type TrainingRetentionPreviewScope,
  type TrainingRetentionPreviewSummary,
  type TrainingRetentionAdminPreviewRepository,
  type TrainingRetentionAdminPreviewResult,
} from '@bunshin/capability-training';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './index';

async function readRetentionPreview(
  tx: Prisma.TransactionClient,
  input: TrainingRetentionPreviewScope,
): Promise<TrainingRetentionPreviewResult> {
  const cutoff = trainingAnswerRetentionCutoff(input.now);
  const scope = { workspaceId: input.workspaceId, groupId: input.groupId };
  const programs = await tx.serviceProgram.findMany({
    where: { ...scope, settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY } },
    select: { id: true },
    take: 1001,
  });
  if (programs.length > 1000) return { outcome: 'TOO_LARGE' };
  const enrollments = await tx.programEnrollment.findMany({
    where: { ...scope, serviceProgramId: { in: programs.map(({ id }) => id) } },
    select: { id: true, groupMembershipId: true, status: true, endsAt: true },
    orderBy: { id: 'asc' },
    take: TRAINING_RETENTION_MAX_ENROLLMENTS + 1,
  });
  if (enrollments.length > TRAINING_RETENTION_MAX_ENROLLMENTS) return { outcome: 'TOO_LARGE' };
  const summary: TrainingRetentionPreviewSummary = {
    mode: 'DRY_RUN',
    policyVersion: TRAINING_RETENTION_POLICY_VERSION,
    enrollments: enrollments.length,
    answersAndEvaluationsDue: 0,
    workProfilesDue: 0,
    scoreProfilesDue: 0,
    progressSnapshotsDue: 0,
    retainedToolkit: 0,
    endDateUnresolved: 0,
    ownershipUnresolved: 0,
  };
  for (const enrollment of enrollments) {
    const membership = await tx.groupMembership.findFirst({
      where: { ...scope, id: enrollment.groupMembershipId, serviceRole: 'PARTICIPANT' },
      select: { userId: true },
    });
    if (!membership) {
      summary.ownershipUnresolved++;
      continue;
    }
    const personal = {
      ...scope,
      programEnrollmentId: enrollment.id,
      userId: membership.userId,
    };
    const retention = await tx.trainingDataRetentionState.findFirst({
      where: { ...scope, programEnrollmentId: enrollment.id },
      select: { endedAt: true, workRedactedAt: true, progressPurgedAt: true },
    });
    const ended = trainingEndRetentionEligibility(
      trainingRetentionEndDate({ ...enrollment, recordedEnd: retention?.endedAt ?? null }),
      input.now,
    );
    if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(enrollment.status) && !ended.endDateKnown) {
      summary.endDateUnresolved++;
    }
    const [answers, toolkit, profiles, progress] = await Promise.all([
      tx.trainingMissionAnswer.count({ where: { ...personal, createdAt: { lte: cutoff } } }),
      tx.trainingToolkitItem.count({ where: personal }),
      (ended.workInformationDue && !retention?.workRedactedAt) ||
      (ended.progressAndScoresDue && !retention?.progressPurgedAt)
        ? tx.trainingParticipantProfile.count({
            where: { ...personal, groupMembershipId: enrollment.groupMembershipId },
          })
        : 0,
      ended.progressAndScoresDue && !retention?.progressPurgedAt
        ? tx.programProgressSnapshot.count({
            where: { ...scope, programEnrollmentId: enrollment.id },
          })
        : 0,
    ]);
    summary.answersAndEvaluationsDue += answers;
    summary.retainedToolkit += toolkit;
    if (ended.workInformationDue && !retention?.workRedactedAt) summary.workProfilesDue += profiles;
    if (ended.progressAndScoresDue && !retention?.progressPurgedAt)
      summary.scoreProfilesDue += profiles;
    summary.progressSnapshotsDue += progress;
  }
  return { outcome: 'PREVIEW', summary };
}

export class PrismaTrainingRetentionPreviewRepository implements TrainingRetentionPreviewRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  preview(input: TrainingRetentionPreviewScope): Promise<TrainingRetentionPreviewResult> {
    return this.client.$transaction((tx) => readRetentionPreview(tx, input), {
      isolationLevel: 'RepeatableRead',
      timeout: 40_000,
    });
  }
}

export class PrismaTrainingRetentionAdminPreviewRepository implements TrainingRetentionAdminPreviewRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  preview(
    input: TrainingRetentionPreviewScope & { actorUserId: string },
  ): Promise<TrainingRetentionAdminPreviewResult> {
    return this.client.$transaction(
      async (tx): Promise<TrainingRetentionAdminPreviewResult> => {
        const manager = await tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.actorUserId,
            status: 'ACTIVE',
            serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
            user: { status: 'ACTIVE' },
            group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
          },
          select: { id: true },
        });
        if (!manager) return { outcome: 'FORBIDDEN' };
        return readRetentionPreview(tx, input);
      },
      { isolationLevel: 'RepeatableRead', timeout: 40_000 },
    );
  }
}
