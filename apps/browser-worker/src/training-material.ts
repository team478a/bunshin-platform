import { join } from 'node:path';
import type { UserJob } from '@bunshin/application';
import { PrismaBrowserLearningMaterials, prisma } from '@bunshin/database';
import { BrowserRunError, runBrowserPlan } from './browser';
import { saveEvidence } from './evidence';
import { fixture, fixturePlan } from './fixture';
import { composeFixtureMaterial } from './material-content';

export async function runTrainingMaterial(input: {
  job: UserJob;
  workerId: string;
  output: string;
  limits: { timeoutMs: number; maxSteps: number };
  signal: AbortSignal;
}) {
  const { job, workerId, output, limits, signal } = input;
  const materials = new PrismaBrowserLearningMaterials(prisma);
  try {
    const target = await materials.jobMaterial(job);
    if (target.existing) return await materials.finish(job, workerId);

    const plan = fixturePlan(target.device);
    const run = await runBrowserPlan(plan, fixture, limits, signal);
    await saveEvidence(
      join(output, job.workspaceId, job.id),
      String(job.attemptCount),
      run,
      signal,
    );
    const content = await composeFixtureMaterial(plan, run.steps, signal);
    signal.throwIfAborted();
    return await materials.finish(job, workerId, {
      ...content,
      verifiedAt: new Date(run.verifiedAt),
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'NOT_FOUND')
      throw new BrowserRunError('INVALID_PLAN');
    throw error;
  }
}
