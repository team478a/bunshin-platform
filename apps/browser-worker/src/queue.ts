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
  assertUserJob,
} from '@bunshin/application';
import {
  browserObservedFixtureVersion,
  browserFormFixtureVersion,
  browserPilotEnvironment,
  trainingCatalogueDiscoveryPrefix,
  type BrowserPlan,
} from '@bunshin/capability-browser';
import { PrismaBrowserLearningMaterials, PrismaJobRepository, prisma } from '@bunshin/database';
import {
  BrowserRunError,
  discoverBrowserPlan,
  discoverObservedBrowserPlan,
  runBrowserPlan,
} from './browser';
import { saveEvidence } from './evidence';
import { compactPreviewStep, fixture, fixturePlan, fixtureVersion } from './fixture';
import {
  completeRecipeReplay,
  completeWithRecipe,
  findRecipeId,
  fixtureForRecipe,
  loadRecipe,
  loadVerifiedRecipe,
  type RecipeVersion,
} from './recipes';
import { isObservedVersion, observedScenario } from './observed-scenarios';
import { modelObservedSelector, modelPreviewSelector } from './model-selector';
import { completeMaterialJob } from './materials';
import { runTrainingMaterial } from './training-material';

import { runMaterialVideo } from './material-video-job';

const jobs = new PrismaJobRepository(prisma, 'browser-fixture');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function queueEnvironment() {
  const environment = browserPilotEnvironment(process.env['APP_ENV'] ?? 'development');
  if (!environment) throw new BrowserRunError('INVALID_PLAN');
  return environment;
}

function deviceFrom(value: string | undefined) {
  if (value === 'desktop' || value === 'mobile') return value;
  throw new BrowserRunError('INVALID_PLAN');
}

export async function enqueueFixture(
  workspaceId: string,
  actorId: string,
  deviceName: string,
  requestId: string,
  mode:
    | 'fixture'
    | 'discover'
    | 'discover-model'
    | 'discover-observed-model'
    | 'discover-observed-form-model'
    | 'replay'
    | 'material' = 'fixture',
) {
  if (![workspaceId, actorId, requestId].every((value) => uuid.test(value))) {
    throw new Error('Workspace, actor and request must be UUIDs');
  }
  let payloadReference;
  if (mode === 'replay' || mode === 'material') {
    if (!uuid.test(deviceName)) throw new BrowserRunError('INVALID_PLAN');
    await loadVerifiedRecipe(deviceName, workspaceId, actorId, 'any');
    payloadReference = `${mode}:${deviceName.toLowerCase()}`;
  } else {
    const device = deviceFrom(deviceName);
    const version =
      mode === 'discover-observed-form-model'
        ? browserFormFixtureVersion
        : mode === 'discover-observed-model'
          ? browserObservedFixtureVersion
          : fixtureVersion;
    const kind = isObservedVersion(version) ? 'discover-observed-model' : mode;
    payloadReference = `${kind === 'fixture' ? '' : kind + ':'}${version}:${device}`;
  }
  return new EnqueueJob(jobs).enqueue({
    environment: queueEnvironment(),
    workspaceId,
    requestedBy: actorId,
    correlationId: requestId,
    jobType: BROWSER_FIXTURE_JOB_TYPE,
    payloadReference,
    idempotencyKey: `browser-fixture:${workspaceId.toLowerCase()}:${actorId.toLowerCase()}:${payloadReference}:${requestId.toLowerCase()}`,
    maxAttempts:
      mode === 'discover-observed-model' || mode === 'discover-observed-form-model' ? 1 : 3,
  });
}

export async function cancelFixture(workspaceId: string, actorId: string, jobId: string) {
  const environment = queueEnvironment();
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
  const environment = queueEnvironment();
  // Retain a lease beyond the browser budget for cleanup and local evidence writes.
  const claim = new ClaimJob(jobs, input.limits.timeoutMs + 30_000);
  const fail = new FailJob(jobs);
  const complete = new CompleteJob(jobs);
  const consume = async () => {
    const workerId = randomUUID();
    while (!input.signal.aborted) {
      const job = await claim.execute(environment, workerId);
      if (!job) {
        if (input.once) return;
        await delay(2_000, undefined, { signal: input.signal }).catch((error: unknown) => {
          if (!input.signal.aborted) throw error;
        });
        continue;
      }
      let recipeId: string | undefined;
      let completedWithRecipe = false;
      try {
        if (job.attemptCount > job.maxAttempts) {
          await fail.execute(job, workerId, {
            errorCategory: 'BROWSER_ATTEMPTS_EXHAUSTED',
            retryable: false,
          });
          continue;
        }
        if (job.payloadReference.startsWith('browser-video:')) {
          assertUserJob(job);
          await runMaterialVideo(job, workerId, input.limits.timeoutMs, input.signal);
          console.log(JSON.stringify({ jobId: job.id, status: 'SUCCEEDED' }));
          continue;
        }
        if (job.payloadReference.startsWith('training-material:')) {
          if (!job.requestedBy) throw new BrowserRunError('INVALID_PLAN');
          assertUserJob(job);
          const material = await runTrainingMaterial({ ...input, job, workerId });
          console.log(
            JSON.stringify({ jobId: job.id, status: 'SUCCEEDED', materialId: material.id }),
          );
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
        assertUserJob(job);
        const [kind, value, device, extra] = job.payloadReference.split(':');
        const trainingCatalogue = kind === trainingCatalogueDiscoveryPrefix;
        if (kind === 'material' && value && uuid.test(value) && device === undefined) {
          const material = await completeMaterialJob({
            recipeId: value,
            job,
            workerId,
            output: input.output,
            limits: input.limits,
            signal: input.signal,
          });
          console.log(
            JSON.stringify({
              jobId: job.id,
              status: 'SUCCEEDED',
              attempt: job.attemptCount,
              recipeId: value,
              materialId: material.id,
            }),
          );
          continue;
        }
        let discovery: BrowserPlan | undefined;
        let evidencePlan: BrowserPlan | undefined;
        let version: RecipeVersion = fixtureVersion;
        let run;
        const observedVersion = trainingCatalogue
          ? browserObservedFixtureVersion
          : kind === 'discover-observed-model' && extra === undefined && isObservedVersion(value)
            ? value
            : null;
        if (observedVersion) {
          const scenario = observedScenario(observedVersion);
          const limits = {
            ...input.limits,
            maxSteps: Math.min(input.limits.maxSteps, scenario.maxSteps),
          };
          const catalogueSignal = AbortSignal.any([
            input.signal,
            AbortSignal.timeout(limits.timeoutMs),
          ]);
          const requestedDevice = trainingCatalogue
            ? await new PrismaBrowserLearningMaterials(prisma).catalogueDiscovery(job)
            : deviceFrom(device);
          version = observedVersion;
          recipeId = await findRecipeId(job.workspaceId, job.requestedBy, requestedDevice, version);
          if (recipeId) {
            ({ plan: evidencePlan } = await loadVerifiedRecipe(
              recipeId,
              job.workspaceId,
              job.requestedBy,
              version,
            ));
          } else {
            ({ plan: discovery } = await discoverObservedBrowserPlan(
              scenario.goal(requestedDevice),
              scenario.fixture,
              limits,
              catalogueSignal,
              modelObservedSelector(job.id, workerId, scenario.form),
            ));
            evidencePlan = discovery;
          }
          run = await runBrowserPlan(evidencePlan, scenario.fixture, limits, catalogueSignal);
        } else if (
          (kind === 'discover' || kind === 'discover-model') &&
          value === fixtureVersion &&
          extra === undefined
        ) {
          const template = fixturePlan(deviceFrom(device));
          recipeId = await findRecipeId(job.workspaceId, job.requestedBy, template.device);
          if (recipeId) {
            const saved = await loadRecipe(recipeId, job.workspaceId, job.requestedBy);
            run = await runBrowserPlan(saved, fixture, input.limits, input.signal);
          } else {
            const candidates = template.steps.filter(({ action }) => action !== 'scroll').reverse();
            if (kind === 'discover-model') candidates.push(compactPreviewStep);
            ({ plan: discovery, run } = await discoverBrowserPlan(
              { ...template, steps: candidates },
              fixture,
              input.limits,
              input.signal,
              kind === 'discover-model' ? modelPreviewSelector(job.id, workerId) : undefined,
            ));
          }
        } else {
          let plan;
          if (kind === 'replay' && value && uuid.test(value) && device === undefined) {
            recipeId = value;
            ({ plan, version } = await loadVerifiedRecipe(
              value,
              job.workspaceId,
              job.requestedBy,
              'any',
            ));
          } else if (kind === fixtureVersion && device === undefined) {
            plan = fixturePlan(deviceFrom(value));
          } else {
            throw new BrowserRunError('INVALID_PLAN');
          }
          if (isObservedVersion(version)) evidencePlan = plan;
          run = await runBrowserPlan(plan, fixtureForRecipe(version), input.limits, input.signal);
        }
        await saveEvidence(
          join(input.output, job.workspaceId, job.id),
          String(job.attemptCount),
          run,
          input.signal,
          evidencePlan,
        );
        if (discovery) {
          input.signal.throwIfAborted();
          recipeId = (
            await completeWithRecipe(
              job,
              workerId,
              discovery,
              run.verifiedAt,
              version,
              trainingCatalogue,
            )
          ).id;
          completedWithRecipe = true;
        } else if (recipeId) {
          input.signal.throwIfAborted();
          await completeRecipeReplay(
            job,
            workerId,
            recipeId,
            run.verifiedAt,
            version,
            trainingCatalogue,
          );
          completedWithRecipe = true;
        }
      } catch (error) {
        const category =
          error instanceof BrowserRunError
            ? error.category
            : input.signal.aborted
              ? 'CANCELLED'
              : 'INFRASTRUCTURE';
        await fail.execute(job, workerId, {
          errorCategory: `BROWSER_${category}`,
          retryable:
            category !== 'INVALID_PLAN' &&
            category !== 'STEP_FAILED' &&
            category !== 'MODEL_SELECTION_FAILED',
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
      if (!completedWithRecipe) await complete.execute(job.id, workerId);
      console.log(
        JSON.stringify({ jobId: job.id, status: 'SUCCEEDED', attempt: job.attemptCount, recipeId }),
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
