import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserObservedFixtureVersion,
  browserPlanSchema,
  type BrowserPlan,
} from '@bunshin/capability-browser';
import { fixtureVersion } from '../src/fixture';
import { observedCatalogueGoal } from '../src/observed-catalogue';
import { findRecipeId, loadVerifiedRecipe } from '../src/recipes';

const findFirst = vi.hoisted(() => vi.fn());
vi.mock('@bunshin/database', () => ({ prisma: { browserFixtureRecipe: { findFirst } } }));

const plan = browserPlanSchema.parse({
  ...observedCatalogueGoal('mobile'),
  steps: [
    {
      id: 'observed-1-0',
      action: 'click',
      target: { by: 'role', role: 'link', name: '詳細を開く' },
    },
    {
      id: 'observed-2-0',
      action: 'click',
      target: { by: 'role', role: 'button', name: '比較を開く' },
    },
  ],
});

function record(savedPlan: BrowserPlan) {
  return {
    plan: savedPlan,
    fixtureVersion: browserObservedFixtureVersion,
    device: savedPlan.device,
    planHash: createHash('sha256').update(JSON.stringify(savedPlan)).digest('hex'),
    verifiedAt: new Date('2026-11-25T00:00:00Z'),
    sourceJobId: 'job',
    sourceAttempt: 1,
  };
}

describe('observed recipe persistence', () => {
  beforeEach(() => findFirst.mockReset());

  it('looks up verified recipes by actor, workspace, version and device', async () => {
    findFirst.mockResolvedValueOnce({ id: 'recipe' });
    await expect(
      findRecipeId('workspace', 'actor', 'mobile', browserObservedFixtureVersion),
    ).resolves.toBe('recipe');
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        actorId: 'actor',
        device: 'mobile',
        fixtureVersion: browserObservedFixtureVersion,
        membership: {
          status: 'ACTIVE',
          workspace: { status: 'ACTIVE' },
          user: { status: 'ACTIVE' },
        },
      },
      orderBy: [{ verifiedAt: 'desc' }, { id: 'asc' }],
      select: { id: true },
    });
  });

  it('returns the verified plan and version for replay while the default lookup stays on the legacy version', async () => {
    findFirst.mockResolvedValueOnce(record(plan)).mockResolvedValueOnce(null);
    await expect(loadVerifiedRecipe('recipe', 'workspace', 'actor', 'any')).resolves.toMatchObject({
      plan,
      version: browserObservedFixtureVersion,
    });
    await expect(loadVerifiedRecipe('recipe', 'workspace', 'actor')).rejects.toMatchObject({
      category: 'INVALID_PLAN',
    });
    expect(findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ fixtureVersion }) }),
    );
  });

  it('rejects a changed goal even with a matching content hash', async () => {
    findFirst.mockResolvedValueOnce(
      record({ ...plan, success: { ...plan.success, page: 'guide' } }),
    );
    await expect(
      loadVerifiedRecipe('recipe', 'workspace', 'actor', browserObservedFixtureVersion),
    ).rejects.toMatchObject({ category: 'INVALID_PLAN' });
  });
});
