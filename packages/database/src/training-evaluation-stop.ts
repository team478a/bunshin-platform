import type { Prisma } from '@prisma/client';
import type { TrainingPersonalDataScope } from '@bunshin/capability-training';

export async function stopTrainingEnrollmentEvaluations(
  tx: Prisma.TransactionClient,
  scope: TrainingPersonalDataScope,
  now: Date,
): Promise<void> {
  // Call only after acquiring the shared enrollment lock in the ending transaction.
  await tx.job.updateMany({
    where: {
      workspaceId: scope.workspaceId,
      requestedBy: scope.actorUserId,
      jobType: 'TRAINING_ANSWER_EVALUATE',
      status: { in: ['PENDING', 'LEASED', 'RETRY_SCHEDULED'] },
      payloadReference: {
        startsWith: `training-evaluation:${scope.groupId}:${scope.programEnrollmentId}:`,
      },
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      nextRetryAt: null,
    },
  });
  await tx.trainingMissionAnswer.updateMany({
    where: {
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      programEnrollmentId: scope.programEnrollmentId,
      userId: scope.actorUserId,
      evaluationStatus: 'PENDING',
    },
    data: { evaluationStatus: 'FAILED' },
  });
}
