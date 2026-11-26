import { join } from 'node:path';
import { CompleteJob, type UserJob } from '@bunshin/application';
import { PrismaJobRepository, prisma } from '@bunshin/database';
import { BrowserRunError, runBrowserPlan } from './browser';
import { saveEvidence } from './evidence';
import { composeFixtureMaterial, readMaterialProof } from './material-content';
import { isObservedVersion, observedScenario } from './observed-scenarios';
import { fixtureForRecipe, loadVerifiedRecipe, recipeScope } from './recipes';

const revision = 1;

export async function completeMaterialJob(input: {
  recipeId: string;
  job: UserJob;
  workerId: string;
  output: string;
  limits: { timeoutMs: number; maxSteps: number };
  signal: AbortSignal;
}) {
  const { recipeId, job, workerId, output, limits, signal } = input;
  const scope = recipeScope(job.workspaceId, job.requestedBy);
  const key = { recipeId, revision };
  const existing = await prisma.browserFixtureMaterial.findFirst({
    where: { ...key, recipe: scope },
    select: { id: true },
  });
  if (existing) {
    await new CompleteJob(new PrismaJobRepository(prisma)).execute(job.id, workerId);
    return existing;
  }

  const { plan, version, sourceJobId, sourceAttempt, verifiedAt } = await loadVerifiedRecipe(
    recipeId,
    job.workspaceId,
    job.requestedBy,
    'any',
  );
  const originalProof = { sourceJobId, sourceAttempt, verifiedAt };
  const folder = join(
    output,
    job.workspaceId,
    originalProof.sourceJobId,
    String(originalProof.sourceAttempt),
  );
  const observed = isObservedVersion(version) ? observedScenario(version) : null;
  let evidence = await readMaterialProof(
    folder,
    plan,
    originalProof.verifiedAt,
    signal,
    !!observed,
  );
  let proof = originalProof;
  if (!evidence?.verifiedResultText) {
    const run = await runBrowserPlan(plan, fixtureForRecipe(version), limits, signal);
    await saveEvidence(
      join(output, job.workspaceId, job.id),
      String(job.attemptCount),
      run,
      signal,
    );
    evidence = run;
    proof = {
      sourceJobId: job.id,
      sourceAttempt: job.attemptCount,
      verifiedAt: new Date(run.verifiedAt),
    };
  }
  const { steps, ...content } = await composeFixtureMaterial(
    plan,
    evidence,
    signal,
    observed?.material,
  );
  signal.throwIfAborted();
  return prisma.$transaction(async (tx) => {
    await new CompleteJob(new PrismaJobRepository(tx)).execute(job.id, workerId);
    const ownerRecipe = await tx.browserFixtureRecipe.findFirst({
      where: { id: recipeId, ...scope },
      select: { id: true },
    });
    if (!ownerRecipe) throw new BrowserRunError('INVALID_PLAN');
    return tx.browserFixtureMaterial.upsert({
      where: { recipeId_revision: key },
      create: { ...key, ...content, ...proof, steps: { create: steps } },
      update: {},
      select: { id: true },
    });
  });
}
