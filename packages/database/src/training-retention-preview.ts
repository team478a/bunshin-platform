import {
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_RETENTION_MAX_ENROLLMENTS,
  TRAINING_RETENTION_POLICY_VERSION,
  trainingAnswerRetentionCutoff,
  trainingEndRetentionEligibility,
  type TrainingRetentionPreviewRepository,
  type TrainingRetentionPreviewResult,
  type TrainingRetentionPreviewScope,
  type TrainingRetentionPreviewSummary,
} from '@bunshin/capability-training';
import type { PrismaClient } from '@prisma/client';
import { prisma } from './index';

export class PrismaTrainingRetentionPreviewRepository implements TrainingRetentionPreviewRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  preview(input: TrainingRetentionPreviewScope): Promise<TrainingRetentionPreviewResult> {
    const cutoff = trainingAnswerRetentionCutoff(input.now);
    const scope = { workspaceId: input.workspaceId, groupId: input.groupId };
    return this.client.$transaction(
      async (tx): Promise<TrainingRetentionPreviewResult> => {
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
        if (enrollments.length > TRAINING_RETENTION_MAX_ENROLLMENTS)
          return { outcome: 'TOO_LARGE' };
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
          const ended = trainingEndRetentionEligibility(
            enrollment.status === 'EXPIRED' ? enrollment.endsAt : null,
            input.now,
          );
          if (
            ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(enrollment.status) &&
            !ended.endDateKnown
          ) {
            summary.endDateUnresolved++;
          }
          const [answers, toolkit, profiles, progress] = await Promise.all([
            tx.trainingMissionAnswer.count({ where: { ...personal, createdAt: { lte: cutoff } } }),
            tx.trainingToolkitItem.count({ where: personal }),
            ended.workInformationDue || ended.progressAndScoresDue
              ? tx.trainingParticipantProfile.count({
                  where: { ...personal, groupMembershipId: enrollment.groupMembershipId },
                })
              : 0,
            ended.progressAndScoresDue
              ? tx.programProgressSnapshot.count({
                  where: { ...scope, programEnrollmentId: enrollment.id },
                })
              : 0,
          ]);
          summary.answersAndEvaluationsDue += answers;
          summary.retainedToolkit += toolkit;
          if (ended.workInformationDue) summary.workProfilesDue += profiles;
          if (ended.progressAndScoresDue) summary.scoreProfilesDue += profiles;
          summary.progressSnapshotsDue += progress;
        }
        return { outcome: 'PREVIEW', summary };
      },
      { isolationLevel: 'RepeatableRead', timeout: 40_000 },
    );
  }
}
