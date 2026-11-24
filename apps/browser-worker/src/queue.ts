import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  BROWSER_FIXTURE_JOB_TYPE,
  CancelJob,
  ClaimJob,
  CompleteJob,
  EnqueueJob,
  FailJob,
} from '@bunshin/application';
import { PrismaJobRepository, prisma } from '@bunshin/database';
import { BrowserRunError, runBrowserPlan } from './browser';
import { saveEvidence } from './evidence';
import { fixture, fixturePlan, fixtureVersion } from './fixture';

const environment = 'DEVELOPMENT';
const jobs = new PrismaJobRepository(prisma, 'browser-fixture');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function deviceFrom(value: string | undefined) {
  if (value === 'desktop' || value === 'mobile') return value;
  throw new BrowserRunError('INVALID_PLAN');
}

export async function enqueueFixture(
  workspaceId: string,
  actorId: string,
  deviceName: string,
  requestId: string,
) {
  if (![workspaceId, actorId, requestId].every((value) => uuid.test(value))) {
    throw new Error('Workspace, actor and request must be UUIDs');
  }
  const device = deviceFrom(deviceName);
  const payloadReference = `${fixtureVersion}:${device}`;
  return new EnqueueJob(jobs).enqueue({
    environment,
    workspaceId,
    requestedBy: actorId,
    correlationId: requestId,
    jobType: BROWSER_FIXTURE_JOB_TYPE,
    payloadReference,
    idempotencyKey: `browser-fixture:${workspaceId}:${actorId}:${payloadReference}:${requestId}`,
    maxAttempts: 3,
  });
}

export async function cancelFixture(workspaceId: string, actorId: string, jobId: string) {
  if (![workspaceId, actorId, jobId].every((value) => uuid.test(value))) {
    throw new Error('Workspace, actor and job must be UUIDs');
  }
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      environment,
      jobType: BROWSER_FIXTURE_JOB_TYPE,
      workspaceId,
      requestedBy: actorId,
      workspace: {
        status: 'ACTIVE',
        memberships: { some: { userId: actorId, status: 'ACTIVE', user: { status: 'ACTIVE' } } },
      },
    },
    select: { id: true },
  });
  if (!job) throw new Error('Fixture job not found');
  const cancelled = await new CancelJob(jobs).execute(job.id, environment);
  return { jobId: cancelled.id, status: cancelled.status };
}

export async function runQueue(input: {
  output: string;
  once: boolean;
  concurrency: number;
  limits: { timeoutMs: number; maxSteps: number };
  signal: AbortSignal;
}) {
  const workerId = randomUUID();
  // Retain a lease beyond the browser budget for cleanup and local evidence writes.
  const claim = new ClaimJob(jobs, input.limits.timeoutMs + 30_000);
  const fail = new FailJob(jobs);
  const complete = new CompleteJob(jobs);
  const consume = async () => {
    while (!input.signal.aborted) {
      const job = await claim.execute(environment, workerId);
      if (!job) {
        if (input.once) return;
        await delay(2_000, undefined, { signal: input.signal }).catch((error: unknown) => {
          if (!input.signal.aborted) throw error;
        });
        continue;
      }
      try {
        if (job.attemptCount > job.maxAttempts) {
          await fail.execute(job, workerId, {
            errorCategory: 'BROWSER_ATTEMPTS_EXHAUSTED',
            retryable: false,
          });
          continue;
        }
        const membership = job.requestedBy
          ? await prisma.workspaceMembership.findFirst({
              where: {
                workspaceId: job.workspaceId,
                userId: job.requestedBy,
                status: 'ACTIVE',
                workspace: { status: 'ACTIVE' },
                user: { status: 'ACTIVE' },
              },
              select: { id: true },
            })
          : null;
        if (!membership || job.bunshinId || job.capabilityType) {
          await fail.execute(job, workerId, {
            errorCategory: 'BROWSER_SCOPE_INVALID',
            retryable: false,
          });
          continue;
        }
        const [version, deviceName, extra] = job.payloadReference.split(':');
        if (version !== fixtureVersion || extra !== undefined)
          throw new BrowserRunError('INVALID_PLAN');
        const run = await runBrowserPlan(
          fixturePlan(deviceFrom(deviceName)),
          fixture,
          input.limits,
          input.signal,
        );
        await saveEvidence(
          join(input.output, job.workspaceId, job.id),
          String(job.attemptCount),
          run,
          input.signal,
        );
      } catch (error) {
        const category =
          error instanceof BrowserRunError
            ? error.category
            : input.signal.aborted
              ? 'CANCELLED'
              : 'INFRASTRUCTURE';
        await fail.execute(job, workerId, {
          errorCategory: `BROWSER_${category}`,
          retryable: category !== 'INVALID_PLAN' && category !== 'STEP_FAILED',
        });
        console.error(
          JSON.stringify({
            jobId: job.id,
            category,
            ...(error instanceof BrowserRunError ? { stepId: error.stepId } : {}),
          }),
        );
        continue;
      }
      await complete.execute(job.id, workerId);
      console.log(
        JSON.stringify({ jobId: job.id, status: 'SUCCEEDED', attempt: job.attemptCount }),
      );
    }
  };

  // An infrastructure exception stops new claims while the other slots drain.
  const shutdown = new AbortController();
  const onFailure = (error: unknown) => {
    shutdown.abort();
    throw error;
  };
  input = { ...input, signal: AbortSignal.any([input.signal, shutdown.signal]) };
  const results = await Promise.allSettled(
    Array.from({ length: input.concurrency }, () => consume().catch(onFailure)),
  );
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
  }
}

export async function disconnect() {
  await prisma.$disconnect();
}
