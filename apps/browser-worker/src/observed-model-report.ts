import { createHash } from 'node:crypto';
import { BROWSER_FIXTURE_JOB_TYPE } from '@bunshin/application';
import {
  browserObservedFixtureVersion,
  browserFormFixtureVersion,
  browserFormStepLimit,
  browserObservedModelOperationKey,
  browserObservedStepLimit,
  browserPilotEnvironment,
  trainingCatalogueDiscoveryPrefix,
} from '@bunshin/capability-browser';
import { prisma } from '@bunshin/database';
import { BrowserRunError } from './browser';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const terminal = new Set(['SUCCEEDED', 'DEAD', 'CANCELLED']);

export async function reportObservedModelJob(workspaceId: string, actorId: string, jobId: string) {
  const environment = browserPilotEnvironment(process.env['APP_ENV'] ?? 'development');
  if (!environment || ![workspaceId, actorId, jobId].every((value) => uuid.test(value))) {
    throw new BrowserRunError('INVALID_PLAN');
  }
  return prisma.$transaction(
    async (tx) => {
      const job = await tx.job.findFirst({
        where: {
          id: jobId,
          workspaceId,
          requestedBy: actorId,
          environment,
          jobType: BROWSER_FIXTURE_JOB_TYPE,
          bunshinId: null,
          capabilityType: null,
          OR: [
            {
              payloadReference: {
                in: [browserObservedFixtureVersion, browserFormFixtureVersion].flatMap((version) =>
                  ['desktop', 'mobile'].map(
                    (device) => `discover-observed-model:${version}:${device}`,
                  ),
                ),
              },
            },
            { payloadReference: { startsWith: trainingCatalogueDiscoveryPrefix + ':' } },
          ],
          workspace: {
            status: 'ACTIVE',
            memberships: {
              some: { userId: actorId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
            },
          },
        },
        select: {
          id: true,
          payloadReference: true,
          status: true,
          attemptCount: true,
          lastErrorCategory: true,
          createdAt: true,
          completedAt: true,
        },
      });
      if (!job) throw new BrowserRunError('INVALID_PLAN');

      const stepLimit = job.payloadReference.startsWith(
        `discover-observed-model:${browserFormFixtureVersion}:`,
      )
        ? browserFormStepLimit
        : browserObservedStepLimit;
      const operations = Array.from({ length: stepLimit }, (_, index) => {
        const ordinal = index + 1;
        const key = browserObservedModelOperationKey(job.id, ordinal);
        return { ordinal, key, hash: createHash('sha256').update(key).digest('hex') };
      });
      const usage = await tx.aiUsageEvent.findMany({
        where: {
          workspaceId,
          actorUserId: actorId,
          taskType: 'BROWSER_FIXTURE_SELECTION',
          provider: 'google',
          idempotencyKey: { in: operations.map(({ key }) => key) },
        },
        select: {
          idempotencyKey: true,
          status: true,
          model: true,
          promptVersion: true,
          inputTokens: true,
          outputTokens: true,
          latencyMs: true,
          estimatedCostUsdMicros: true,
        },
      });
      const admissions = await tx.aiProviderCallAdmission.findMany({
        where: {
          environment,
          provider: 'GOOGLE',
          operationHash: { in: operations.map(({ hash }) => hash) },
        },
        select: { operationHash: true, settledAt: true },
      });

      let total = 0n;
      let complete = terminal.has(job.status);
      const steps = operations.flatMap(({ ordinal, key, hash }) => {
        const event = usage.find(({ idempotencyKey }) => idempotencyKey === key);
        const admission = admissions.find(({ operationHash }) => operationHash === hash);
        if (!event && !admission) return [];
        const cost = event?.estimatedCostUsdMicros ?? null;
        if (cost === null || !admission?.settledAt) complete = false;
        if (cost !== null) total += cost;
        return [
          {
            ordinal,
            admitted: !!admission,
            settled: !!admission?.settledAt,
            status: event?.status ?? null,
            model: event?.model ?? null,
            promptVersion: event?.promptVersion ?? null,
            inputTokens: event?.inputTokens ?? null,
            outputTokens: event?.outputTokens ?? null,
            latencyMs: event?.latencyMs ?? null,
            estimatedCostUsdMicros: cost?.toString() ?? null,
          },
        ];
      });
      return {
        jobId: job.id,
        status: job.status,
        attempts: job.attemptCount,
        errorCategory: job.lastErrorCategory,
        queueToCompletionMs: job.completedAt
          ? job.completedAt.getTime() - job.createdAt.getTime()
          : null,
        recordedCalls: usage.length,
        admittedSteps: admissions.length,
        estimatedCostUsdMicros: complete ? total.toString() : null,
        steps,
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
