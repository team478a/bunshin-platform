import 'server-only';

import { EnqueueJob, TRAINING_ANSWER_EVALUATION_JOB_TYPE } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';

const runtimeEnvironment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const;

export async function enqueueAiTrainingEvaluation(input: {
  workspaceId: string;
  groupId: string;
  enrollmentId: string;
  answerId: string;
  actorUserId: string;
  correlationId: string;
  resetFailed?: boolean;
}) {
  const db = await import('@bunshin/database');
  return db.prisma.$transaction(async (tx) => {
    await db.lockTrainingEnrollmentData(tx, {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      actorUserId: input.actorUserId,
      programEnrollmentId: input.enrollmentId,
    });
    const answer = await tx.trainingMissionAnswer.findFirst({
      where: {
        id: input.answerId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: input.enrollmentId,
        userId: input.actorUserId,
        evaluationStatus: input.resetFailed ? 'FAILED' : 'PENDING',
      },
      select: { id: true },
    });
    if (!answer) throw new ApplicationError('NOT_FOUND', 'training answer unavailable');
    const payloadReference = `training-evaluation:${input.groupId}:${input.enrollmentId}:${input.answerId}:${input.actorUserId}`;
    const previousFailures = await tx.job.count({
      where: {
        workspaceId: input.workspaceId,
        jobType: TRAINING_ANSWER_EVALUATION_JOB_TYPE,
        payloadReference,
        status: 'DEAD',
      },
    });
    if (input.resetFailed) {
      await tx.trainingMissionAnswer.updateMany({
        where: {
          id: input.answerId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: input.enrollmentId,
          userId: input.actorUserId,
          evaluationStatus: 'FAILED',
        },
        data: { evaluationStatus: 'PENDING', evaluatedAt: null },
      });
    }
    return new EnqueueJob(new db.PrismaJobRepository(tx)).enqueue({
      environment: runtimeEnvironment[getServerEnvironment().APP_ENV],
      workspaceId: input.workspaceId,
      jobType: TRAINING_ANSWER_EVALUATION_JOB_TYPE,
      payloadReference,
      idempotencyKey: `training-evaluation:${input.answerId}:run:${previousFailures}`,
      correlationId: input.correlationId,
      requestedBy: input.actorUserId,
      priority: 40,
      maxAttempts: 3,
    });
  });
}
