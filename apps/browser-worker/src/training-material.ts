import { join } from 'node:path';
import type { UserJob } from '@bunshin/application';
import { PrismaBrowserLearningMaterials, prisma } from '@bunshin/database';
import { BrowserRunError, verifyBrowserPlan } from './browser';
import { saveEvidence } from './evidence';
import { compactPreviewStep, fixture, fixturePlan } from './fixture';
import { composeFixtureMaterial } from './material-content';
import { materialSignature } from './material-signature';

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

    const { plan, run } = await verifyBrowserPlan(
      fixturePlan(target.device),
      fixture,
      limits,
      signal,
      {
        stepId: 'preview',
        target: compactPreviewStep.target,
      },
    );
    await saveEvidence(
      join(output, job.workspaceId, job.id),
      String(job.attemptCount),
      run,
      signal,
    );
    const content = await composeFixtureMaterial(plan, run, signal);
    signal.throwIfAborted();
    return await materials.finish(job, workerId, {
      ...content,
      semanticDigest: materialSignature(plan, run),
      verifiedAt: new Date(run.verifiedAt),
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'NOT_FOUND')
      throw new BrowserRunError('INVALID_PLAN');
    throw error;
  }
}

export function scheduleTrainingReviews() {
  return new PrismaBrowserLearningMaterials(prisma).scheduleReviews();
}

export function rollbackTrainingMaterial(input: {
  workspaceId: string;
  actorId: string;
  materialId: string;
  expectedCurrentId: string;
}) {
  return new PrismaBrowserLearningMaterials(prisma).rollback(input);
}
