import type {
  TrainingRetentionExecutionRepository,
  TrainingRetentionExecutionScope,
  TrainingRetentionExecutionResult,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';
import { lockTrainingEnrollmentData } from './training-data-lock';
import { trainingRetentionOwner, trainingRetentionSnapshot } from './training-retention-snapshot';

const action = 'TRAINING_RETENTION_APPLIED';
export class PrismaTrainingRetentionExecutionRepository implements TrainingRetentionExecutionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  preview(input: TrainingRetentionExecutionScope): Promise<TrainingRetentionExecutionResult> {
    return this.client.$transaction(
      async (tx): Promise<TrainingRetentionExecutionResult> => {
        const owned = await trainingRetentionOwner(tx, input);
        if (owned.outcome !== 'OWNED') return owned;
        const snapshot = await trainingRetentionSnapshot(tx, input, owned);
        return snapshot.outcome === 'PREVIEW'
          ? { outcome: 'PREVIEW', preview: snapshot.preview }
          : snapshot;
      },
      { isolationLevel: 'RepeatableRead', timeout: 30_000 },
    );
  }

  async execute(
    input: TrainingRetentionExecutionScope & { revision: string },
  ): Promise<TrainingRetentionExecutionResult> {
    try {
      return await this.client.$transaction(
        async (tx): Promise<TrainingRetentionExecutionResult> => {
          let owned = await trainingRetentionOwner(tx, input);
          if (owned.outcome !== 'OWNED') return owned;
          await lockTrainingEnrollmentData(tx, { ...input, actorUserId: owned.membership.userId });
          // Re-read all scope and lifecycle information after waiting for the lock.
          owned = await trainingRetentionOwner(tx, input);
          if (owned.outcome !== 'OWNED') return owned;
          const auditScope = {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            resourceType: 'PROGRAM_ENROLLMENT',
            resourceId: input.programEnrollmentId,
            action,
            performedByUserId: input.operatorUserId,
          };
          const previous = await tx.programAuditLog.findFirst({
            where: { ...auditScope, afterData: { path: ['revision'], equals: input.revision } },
            select: { id: true },
          });
          if (previous)
            return {
              outcome: 'ALREADY_APPLIED',
              counts: {
                answers: 0,
                workProfiles: 0,
                progressProfiles: 0,
                progressSnapshots: 0,
                assignmentSnapshots: 0,
                assignments: 0,
                activities: 0,
                goals: 0,
                preferences: 0,
                retainedToolkit: await tx.trainingToolkitItem.count({
                  where: {
                    workspaceId: input.workspaceId,
                    groupId: input.groupId,
                    programEnrollmentId: input.programEnrollmentId,
                    userId: owned.membership.userId,
                  },
                }),
              },
            };
          const snapshot = await trainingRetentionSnapshot(tx, input, owned);
          if (snapshot.outcome !== 'PREVIEW') return snapshot;
          if (snapshot.preview.revision !== input.revision) return { outcome: 'CONFLICT' };
          const { scope, personal, rows, work, progress } = snapshot;
          const answerIds = rows.answers.map(({ id }) => id);
          const assignments = rows.answers.map(({ missionAssignmentId }) => missionAssignmentId);
          await tx.job.updateMany({
            where: {
              workspaceId: input.workspaceId,
              requestedBy: owned.membership.userId,
              jobType: 'TRAINING_ANSWER_EVALUATE',
              status: { in: ['PENDING', 'LEASED', 'RETRY_SCHEDULED'] },
              payloadReference: {
                in: answerIds.map(
                  (id) =>
                    `training-evaluation:${input.groupId}:${input.programEnrollmentId}:${id}:${owned.membership.userId}`,
                ),
              },
            },
            data: {
              status: 'CANCELLED',
              cancelledAt: input.now,
              leaseOwner: null,
              leaseExpiresAt: null,
              nextRetryAt: null,
            },
          });
          await tx.trainingMissionAnswer.deleteMany({
            where: { ...personal, id: { in: answerIds } },
          });
          if (!progress) {
            await tx.programMissionAssignment.updateMany({
              where: {
                ...scope,
                id: { in: assignments },
                status: { in: ['PRESENTED', 'STARTED'] },
              },
              data: { status: 'SKIPPED', skippedAt: input.now },
            });
            await tx.programProgressSnapshot.updateMany({
              where: { ...scope, currentAssignmentId: { in: assignments } },
              data: {
                currentAssignmentId: null,
                nextEvaluationAt: null,
                revision: { increment: 1 },
              },
            });
          }
          if (progress) {
            await tx.trainingParticipantProfile.deleteMany({
              where: { ...personal, groupMembershipId: owned.membership.id },
            });
            await tx.programProgressSnapshot.deleteMany({ where: scope });
            await tx.programActionEvent.deleteMany({ where: scope });
            await tx.programMissionAssignment.deleteMany({ where: scope });
            await tx.programMemberGoal.deleteMany({
              where: { ...scope, groupMembershipId: owned.membership.id },
            });
            await tx.programMemberPreference.deleteMany({
              where: { ...scope, groupMembershipId: owned.membership.id },
            });
          } else if (work) {
            await tx.trainingParticipantProfile.updateMany({
              where: { ...personal, groupMembershipId: owned.membership.id },
              data: {
                role: 'OTHER',
                workContext: {},
                aiUseCases: [],
                workChallenges: [],
                preferredTopics: [],
                learningGoalKey: null,
              },
            });
            await tx.programMissionAssignment.updateMany({
              where: scope,
              data: { displaySnapshot: {} },
            });
            await tx.programMissionAssignment.updateMany({
              where: { ...scope, status: { in: ['PRESENTED', 'STARTED'] } },
              data: { status: 'SKIPPED', skippedAt: input.now },
            });
            await tx.programProgressSnapshot.updateMany({
              where: scope,
              data: {
                currentAssignmentId: null,
                nextEvaluationAt: null,
                revision: { increment: 1 },
              },
            });
            await tx.programActionEvent.updateMany({ where: scope, data: { metadata: {} } });
            await tx.programMemberGoal.updateMany({
              where: { ...scope, groupMembershipId: owned.membership.id },
              data: { title: '保持期限により削除済み', unit: '' },
            });
            await tx.programMemberPreference.updateMany({
              where: { ...scope, groupMembershipId: owned.membership.id },
              data: { notes: '' },
            });
          } else {
            await tx.programActionEvent.deleteMany({
              where: {
                ...scope,
                sourceResourceType: 'TRAINING_MISSION_ANSWER',
                sourceResourceId: { in: answerIds },
              },
            });
          }
          if (work || progress) {
            await tx.programEnrollment.updateMany({
              where: {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                id: input.programEnrollmentId,
                groupMembershipId: owned.membership.id,
              },
              data: { goalSnapshot: {} },
            });
            // Erase copied learning goals without discarding contract or invoice snapshots.
            await tx.$executeRaw(Prisma.sql`
            UPDATE program_audit_logs SET
              before_data = CASE WHEN jsonb_typeof(before_data) = 'object' THEN before_data - 'goalSnapshot' - 'goal_snapshot' ELSE before_data END,
              after_data = CASE WHEN jsonb_typeof(after_data) = 'object' THEN after_data - 'goalSnapshot' - 'goal_snapshot' ELSE after_data END
            WHERE workspace_id = ${input.workspaceId}::uuid AND group_id = ${input.groupId}::uuid
              AND resource_type = 'PROGRAM_ENROLLMENT' AND resource_id = ${input.programEnrollmentId}::uuid
          `);
            const markers = {
              ...(work ? { workRedactedAt: input.now } : {}),
              ...(progress ? { progressPurgedAt: input.now } : {}),
            };
            await tx.trainingDataRetentionState.upsert({
              where: { programEnrollmentId: input.programEnrollmentId },
              create: { ...scope, endedAt: snapshot.endedAt, ...markers },
              update: markers,
            });
          }
          await tx.programAuditLog.create({
            data: {
              ...auditScope,
              beforeData: Prisma.DbNull,
              afterData: {
                revision: input.revision,
                counts: snapshot.preview.counts,
                policyVersion: 'TRAINING_RETENTION_V1',
              },
              performedAt: input.now,
            },
          });
          return { outcome: 'APPLIED', counts: snapshot.preview.counts };
        },
        { isolationLevel: 'ReadCommitted', timeout: 30_000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        return { outcome: 'CONFLICT' };
      throw error;
    }
  }
}
