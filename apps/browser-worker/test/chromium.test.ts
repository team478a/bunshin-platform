import { describe, expect, it } from 'vitest';
import { runBrowserPlan } from '../src/browser';
import { fixture, fixturePlan } from '../src/fixture';

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
