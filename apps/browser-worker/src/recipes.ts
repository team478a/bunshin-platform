import { createHash } from 'node:crypto';
import { browserPlanSchema, type BrowserPlan } from '@bunshin/capability-browser';
import { CompleteJob, type UserJob } from '@bunshin/application';
import { PrismaJobRepository, prisma } from '@bunshin/database';
import { BrowserRunError } from './browser';
import { compactPreviewStep, fixturePlan, fixtureVersion } from './fixture';

export const recipeScope = (workspaceId: string, actorId: string) => ({
  workspaceId,
  actorId,
  membership: {
    status: 'ACTIVE' as const,
    workspace: { status: 'ACTIVE' as const },
    user: { status: 'ACTIVE' as const },
  },
});

export async function findRecipeId(
  workspaceId: string,
  actorId: string,
  device: BrowserPlan['device'],
) {
  const recipe = await prisma.browserFixtureRecipe.findFirst({
    where: { fixtureVersion, device, ...recipeScope(workspaceId, actorId) },
    orderBy: [{ verifiedAt: 'desc' }, { id: 'asc' }],
    select: { id: true },
  });
  return recipe?.id;
}

export async function loadRecipe(recipeId: string, workspaceId: string, actorId: string) {
  return (await loadVerifiedRecipe(recipeId, workspaceId, actorId)).plan;
}

export async function loadVerifiedRecipe(recipeId: string, workspaceId: string, actorId: string) {
  const recipe = await prisma.browserFixtureRecipe.findFirst({
    where: { id: recipeId, fixtureVersion, ...recipeScope(workspaceId, actorId) },
    select: {
      plan: true,
      device: true,
      planHash: true,
      verifiedAt: true,
      sourceJobId: true,
      sourceAttempt: true,
    },
  });
  const parsed = browserPlanSchema.safeParse(recipe?.plan);
  if (!recipe || !parsed.success || parsed.data.device !== recipe.device) {
    throw new BrowserRunError('INVALID_PLAN');
  }

  // Rebuild steps from the deployed fixture, so even a changed or stale record
  // cannot broaden the set of approved actions or weaken the goal.
  const official = fixturePlan(parsed.data.device);
  const allowed = [...official.steps, compactPreviewStep];
  const normalized = browserPlanSchema.safeParse({
    ...official,
    steps: parsed.data.steps.map(({ id }) => allowed.find((step) => step.id === id)),
  });
  if (
    !normalized.success ||
    JSON.stringify(normalized.data) !== JSON.stringify(parsed.data) ||
    hashPlan(normalized.data) !== recipe.planHash
  ) {
    throw new BrowserRunError('INVALID_PLAN');
  }
  return {
    plan: normalized.data,
    verifiedAt: recipe.verifiedAt,
    sourceJobId: recipe.sourceJobId,
    sourceAttempt: recipe.sourceAttempt,
  };
}

function hashPlan(plan: BrowserPlan) {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

function proof(job: UserJob, verifiedAt: string) {
  return { verifiedAt: new Date(verifiedAt), sourceJobId: job.id, sourceAttempt: job.attemptCount };
}

export async function completeRecipeReplay(
  job: UserJob,
  workerId: string,
  recipeId: string,
  verifiedAt: string,
) {
  return prisma.$transaction(async (tx) => {
    await new CompleteJob(new PrismaJobRepository(tx)).execute(job.id, workerId);
    const where = {
      id: recipeId,
      fixtureVersion,
      ...recipeScope(job.workspaceId, job.requestedBy),
    };
    const recipe = await tx.browserFixtureRecipe.findFirst({ where, select: { id: true } });
    if (!recipe) throw new BrowserRunError('INVALID_PLAN');
    const evidence = proof(job, verifiedAt);
    await tx.browserFixtureRecipe.updateMany({
      where: { ...where, verifiedAt: { lt: evidence.verifiedAt } },
      data: evidence,
    });
  });
}

export async function completeWithRecipe(
  job: UserJob,
  workerId: string,
  plan: BrowserPlan,
  verifiedAt: string,
) {
  const canonical = browserPlanSchema.parse(plan);
  const planHash = hashPlan(canonical);
  return prisma.$transaction(async (tx) => {
    await new CompleteJob(new PrismaJobRepository(tx)).execute(job.id, workerId);
    const owner = await tx.workspaceMembership.findFirst({
      where: {
        workspaceId: job.workspaceId,
        userId: job.requestedBy,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!owner) throw new BrowserRunError('INVALID_PLAN');
    const key = {
      workspaceId: job.workspaceId,
      actorId: job.requestedBy,
      fixtureVersion,
      device: plan.device,
      planHash,
    };
    return tx.browserFixtureRecipe.upsert({
      where: { workspaceId_actorId_fixtureVersion_device_planHash: key },
      create: {
        ...key,
        plan: canonical,
        verifiedAt: new Date(verifiedAt),
        sourceJobId: job.id,
        sourceAttempt: job.attemptCount,
      },
      update: {},
      select: { id: true },
    });
  });
}
