import { createHash } from 'node:crypto';
import {
  browserFormFixtureVersion,
  browserFormResponseSchema,
  browserObservedFixtureVersion,
  browserObservedResponseSchema,
  browserPlanSchema,
  type BrowserPlan,
} from '@bunshin/capability-browser';
import { CompleteJob, type UserJob } from '@bunshin/application';
import { enqueueCatalogueMaterial, PrismaJobRepository, prisma } from '@bunshin/database';
import { BrowserRunError } from './browser';
import { compactPreviewStep, fixture, fixturePlan, fixtureVersion } from './fixture';
import { isObservedVersion, observedScenario, type ObservedVersion } from './observed-scenarios';

export type RecipeVersion = typeof fixtureVersion | ObservedVersion;

export function fixtureForRecipe(version: RecipeVersion) {
  return isObservedVersion(version) ? observedScenario(version).fixture : fixture;
}

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
  version: RecipeVersion = fixtureVersion,
) {
  const recipe = await prisma.browserFixtureRecipe.findFirst({
    where: { fixtureVersion: version, device, ...recipeScope(workspaceId, actorId) },
    orderBy: [{ verifiedAt: 'desc' }, { id: 'asc' }],
    select: { id: true },
  });
  return recipe?.id;
}

export async function loadRecipe(recipeId: string, workspaceId: string, actorId: string) {
  return (await loadVerifiedRecipe(recipeId, workspaceId, actorId)).plan;
}

export async function loadVerifiedRecipe(
  recipeId: string,
  workspaceId: string,
  actorId: string,
  version: RecipeVersion | 'any' = fixtureVersion,
) {
  const recipe = await prisma.browserFixtureRecipe.findFirst({
    where: {
      id: recipeId,
      fixtureVersion:
        version === 'any'
          ? { in: [fixtureVersion, browserObservedFixtureVersion, browserFormFixtureVersion] }
          : version,
      ...recipeScope(workspaceId, actorId),
    },
    select: {
      plan: true,
      device: true,
      fixtureVersion: true,
      planHash: true,
      verifiedAt: true,
      sourceJobId: true,
      sourceAttempt: true,
    },
  });
  const parsed = browserPlanSchema.safeParse(recipe?.plan);
  if (
    !recipe ||
    !parsed.success ||
    parsed.data.device !== recipe.device ||
    (recipe.fixtureVersion !== fixtureVersion && !isObservedVersion(recipe.fixtureVersion))
  ) {
    throw new BrowserRunError('INVALID_PLAN');
  }

  const recipeVersion: RecipeVersion = recipe.fixtureVersion;
  const plan = canonicalRecipePlan(parsed.data, recipeVersion);
  if (hashPlan(plan) !== recipe.planHash) throw new BrowserRunError('INVALID_PLAN');
  return {
    plan,
    version: recipeVersion,
    verifiedAt: recipe.verifiedAt,
    sourceJobId: recipe.sourceJobId,
    sourceAttempt: recipe.sourceAttempt,
  } as const;
}

function canonicalRecipePlan(plan: BrowserPlan, version: RecipeVersion) {
  if (isObservedVersion(version)) {
    const scenario = observedScenario(version);
    const id = (scenario.form ? browserFormResponseSchema : browserObservedResponseSchema).shape.id;
    const { steps, ...goal } = plan;
    if (
      JSON.stringify(goal) !== JSON.stringify(scenario.goal(plan.device)) ||
      steps.length > scenario.maxSteps ||
      !steps.every((step, index) => {
        if (!step.id.startsWith(`observed-${index + 1}-`) || !id.safeParse(step.id).success)
          return false;
        if ((step.action !== 'click' && step.action !== 'fill') || step.target.by !== 'role')
          return false;
        const { name, role } = step.target;
        if (!name.trim()) return false;
        return step.action === 'fill'
          ? scenario.form && role === 'textbox' && step.sample === scenario.fixture.observedSample
          : role === 'button' || role === 'link' || (scenario.form && role === 'checkbox');
      })
    ) {
      throw new BrowserRunError('INVALID_PLAN');
    }
    return plan;
  }

  // Legacy steps and success conditions must match the deployed fixture.
  const official = fixturePlan(plan.device);
  const allowed = [...official.steps, compactPreviewStep];
  const normalized = browserPlanSchema.safeParse({
    ...official,
    steps: plan.steps.map(({ id }) => allowed.find((step) => step.id === id)),
  });
  if (!normalized.success || JSON.stringify(normalized.data) !== JSON.stringify(plan)) {
    throw new BrowserRunError('INVALID_PLAN');
  }
  return normalized.data;
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
  version: RecipeVersion = fixtureVersion,
  queueMaterial = false,
) {
  return prisma.$transaction(async (tx) => {
    await new CompleteJob(new PrismaJobRepository(tx)).execute(job.id, workerId);
    const where = {
      id: recipeId,
      fixtureVersion: version,
      ...recipeScope(job.workspaceId, job.requestedBy),
    };
    const recipe = await tx.browserFixtureRecipe.findFirst({ where, select: { id: true } });
    if (!recipe) throw new BrowserRunError('INVALID_PLAN');
    const evidence = proof(job, verifiedAt);
    await tx.browserFixtureRecipe.updateMany({
      where: { ...where, verifiedAt: { lt: evidence.verifiedAt } },
      data: evidence,
    });
    if (queueMaterial) await enqueueCatalogueMaterial(tx, job, recipeId);
  });
}

export async function completeWithRecipe(
  job: UserJob,
  workerId: string,
  plan: BrowserPlan,
  verifiedAt: string,
  version: RecipeVersion = fixtureVersion,
  queueMaterial = false,
) {
  const canonical = canonicalRecipePlan(browserPlanSchema.parse(plan), version);
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
      fixtureVersion: version,
      device: plan.device,
      planHash,
    };
    const recipe = await tx.browserFixtureRecipe.upsert({
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
    if (queueMaterial) await enqueueCatalogueMaterial(tx, job, recipe.id);
    return recipe;
  });
}
