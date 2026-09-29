import {
  FORTUNE_GENERATION_JOB_TYPE,
  fortuneGenerationPayloadReference,
  type JobEnvironment,
} from '@bunshin/application';
import type {
  FortuneAiGenerationQueue,
  FortuneGenerationJobLease,
} from '@bunshin/capability-fortune';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { fortuneReadingView, fortuneTarget } from './fortune-shared';

export async function lockFortuneGenerationLease(
  tx: Prisma.TransactionClient,
  lease: FortuneGenerationJobLease,
  actorUserId: string,
  readingId: string,
): Promise<boolean> {
  await tx.$queryRaw`SELECT id FROM jobs
    WHERE id = ${lease.jobId}::uuid
      AND workspace_id = ${lease.workspaceId}::uuid
      AND bunshin_id = ${lease.bunshinId}::uuid
      AND requested_by = ${actorUserId}::uuid
    FOR UPDATE`;
  const job = await tx.job.findFirst({
    where: {
      id: lease.jobId,
      workspaceId: lease.workspaceId,
      bunshinId: lease.bunshinId,
      requestedBy: actorUserId,
      capabilityType: 'FORTUNE',
      jobType: FORTUNE_GENERATION_JOB_TYPE,
      payloadReference: fortuneGenerationPayloadReference(lease.serviceSettingId, readingId),
      status: 'LEASED',
      leaseOwner: lease.workerId,
      leaseExpiresAt: { gt: new Date() },
      attemptCount: lease.attemptCount,
    },
    select: { id: true },
  });
  return Boolean(job);
}

export class PrismaFortuneGenerationQueue implements FortuneAiGenerationQueue {
  constructor(
    private readonly db: PrismaClient,
    private readonly environment: JobEnvironment,
  ) {}

  enqueue(input: Parameters<FortuneAiGenerationQueue['enqueue']>[0]) {
    return this.db.$transaction(async (tx) => {
      const scope = await fortuneTarget(tx, input.serviceSlug, input.actorUserId);
      if (!scope || !scope.aiEnabled) return null;
      const reading = await tx.fortuneReading.findFirst({
        where: {
          id: input.readingId,
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          serviceSettingId: scope.id,
          memberUserId: input.actorUserId,
          status: 'READY_BASIC',
          deletedAt: null,
          participant: {
            workspaceId: scope.workspaceId,
            serviceSettingId: scope.id,
            userId: input.actorUserId,
          },
        },
      });
      if (!reading) return null;
      const reference = fortuneGenerationPayloadReference(scope.id, reading.id);
      const job = await tx.job.upsert({
        where: {
          environment_idempotencyKey: { environment: this.environment, idempotencyKey: reference },
        },
        update: {},
        create: {
          environment: this.environment,
          workspaceId: scope.workspaceId,
          bunshinId: scope.bunshinId,
          capabilityType: 'FORTUNE',
          jobType: FORTUNE_GENERATION_JOB_TYPE,
          payloadReference: reference,
          idempotencyKey: reference,
          correlationId: `fortune:${reading.id}`,
          requestedBy: input.actorUserId,
          maxAttempts: 3,
        },
      });
      if (
        job.workspaceId !== scope.workspaceId ||
        job.bunshinId !== scope.bunshinId ||
        job.requestedBy !== input.actorUserId ||
        job.payloadReference !== reference ||
        job.jobType !== FORTUNE_GENERATION_JOB_TYPE ||
        job.capabilityType !== 'FORTUNE'
      )
        throw new ApplicationError('CONFLICT', 'fortune job scope mismatch');
      // A terminal job must never restart because the user submits the draw again.
      if (job.status !== 'PENDING') return fortuneReadingView(tx, reading);
      const updated = await tx.fortuneReading.updateMany({
        where: {
          id: reading.id,
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          serviceSettingId: scope.id,
          memberUserId: input.actorUserId,
          status: 'READY_BASIC',
          deletedAt: null,
        },
        data: { status: 'GENERATING', failureCode: null },
      });
      if (updated.count !== 1) {
        const current = await tx.fortuneReading.findFirst({
          where: {
            id: reading.id,
            serviceSettingId: scope.id,
            memberUserId: input.actorUserId,
            deletedAt: null,
          },
        });
        return current ? fortuneReadingView(tx, current) : null;
      }
      return fortuneReadingView(tx, { ...reading, status: 'GENERATING' });
    });
  }
}

export function verifyFortuneGenerationJob(
  db: PrismaClient,
  input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
    jobLease: FortuneGenerationJobLease;
    generationRevision: Date;
  },
) {
  return db.$transaction(async (tx) => {
    if (!(await lockFortuneGenerationLease(tx, input.jobLease, input.actorUserId, input.readingId)))
      return false;
    const scope = await fortuneTarget(tx, input.serviceSlug, input.actorUserId);
    if (
      !scope ||
      !scope.aiEnabled ||
      scope.id !== input.jobLease.serviceSettingId ||
      scope.workspaceId !== input.jobLease.workspaceId ||
      scope.bunshinId !== input.jobLease.bunshinId
    )
      return false;
    return Boolean(
      await tx.fortuneReading.findFirst({
        where: {
          id: input.readingId,
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          serviceSettingId: scope.id,
          memberUserId: input.actorUserId,
          status: 'GENERATING',
          deletedAt: null,
          updatedAt: input.generationRevision,
        },
        select: { id: true },
      }),
    );
  });
}
