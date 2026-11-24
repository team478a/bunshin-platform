import { describe, expect, it, vi } from 'vitest';
import { discoverBrowserPlan, runBrowserPlan } from '../src/browser';
import { compactPreviewStep, fixture, fixturePlan } from '../src/fixture';
import { modelPreviewSelector } from '../src/model-selector';

describe.skipIf(process.env['BROWSER_WORKER_LIVE_TESTS'] !== '1')('local Chromium', () => {
  const limits = { timeoutMs: 30_000, maxSteps: 20 };
  const signal = new AbortController().signal;

  it.each(['desktop', 'mobile'] as const)(
    'replays %s steps with matching image evidence',
    async (device) => {
      const run = await runBrowserPlan(fixturePlan(device), fixture, limits, signal);
      expect(run.steps.map((step) => step.stepId)).toEqual([
        'open-editor',
        'fill-note',
        'preview',
        'scroll',
      ]);
      expect(run.steps[0]).toMatchObject({ before: { page: 'home' }, after: { page: 'editor' } });
      expect(run.steps[1]?.after.accessibility).toContain('研修メモのサンプル');
      expect(run.steps[2]?.after.accessibility).toContain('プレビューを表示しました');
      for (const step of run.steps) {
        expect(Array.from(step.beforePng.slice(0, 4))).toEqual([137, 80, 78, 71]);
        expect(Array.from(step.afterPng.slice(0, 4))).toEqual([137, 80, 78, 71]);
        expect(Buffer.compare(step.beforePng, step.afterPng)).not.toBe(0);
      }
    },
    40_000,
  );

  it('discovers visible and enabled steps in order and replays the observed plan', async () => {
    const template = fixturePlan('mobile');
    const offered: string[][] = [];
    const result = await discoverBrowserPlan(
      { ...template, steps: template.steps.slice(0, 3).reverse() },
      fixture,
      limits,
      signal,
      (candidates) => {
        offered.push(candidates.map(({ id }) => id));
        return Promise.resolve(candidates[0]?.id ?? '');
      },
    );
    const expected = ['open-editor', 'fill-note', 'preview'];
    expect(offered).toEqual(expected.map((id) => [id]));
    expect(result.plan.steps.map(({ id }) => id)).toEqual(expected);
    const replay = await runBrowserPlan(result.plan, fixture, limits, signal);
    expect(replay.steps.map(({ stepId }) => stepId)).toEqual(expected);
  }, 70_000);

  it('calls the internal selector once for two eligible preview actions and replays without it', async () => {
    const preview = vi.fn(() => Promise.resolve(Response.json('compact-preview')));
    vi.stubGlobal('fetch', preview);
    vi.stubEnv('BROWSER_FIXTURE_MODEL_ORIGIN', 'http://127.0.0.1:3000');
    vi.stubEnv('BROWSER_FIXTURE_MODEL_SECRET', 'fixture-secret');
    try {
      const template = fixturePlan('mobile');
      const result = await discoverBrowserPlan(
        { ...template, steps: [...template.steps.slice(0, 3), compactPreviewStep] },
        fixture,
        limits,
        signal,
        modelPreviewSelector('job-id', 'worker-id'),
      );
      expect(result.plan.steps.map(({ id }) => id)).toEqual([
        'open-editor',
        'fill-note',
        'compact-preview',
      ]);
      await runBrowserPlan(result.plan, fixture, limits, signal);
      expect(preview).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  }, 70_000);

  it('rejects a selection outside the observed candidates', async () => {
    const plan = fixturePlan('desktop');
    await expect(
      discoverBrowserPlan(plan, fixture, limits, signal, () => Promise.resolve('preview')),
    ).rejects.toMatchObject({ category: 'STEP_FAILED' });
  }, 40_000);

  it('fails if the observed outcome changes', async () => {
    const plan = fixturePlan('desktop');
    await expect(
      runBrowserPlan(
        {
          ...plan,
          success: { ...plan.success, visible: { by: 'text', text: 'Missing result' } },
        },
        fixture,
        limits,
        signal,
      ),
    ).rejects.toMatchObject({ category: 'STEP_FAILED' });
  }, 40_000);
});
