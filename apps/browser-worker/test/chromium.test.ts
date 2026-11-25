import { describe, expect, it, vi } from 'vitest';
import {
  discoverBrowserPlan,
  discoverObservedBrowserPlan,
  runBrowserPlan,
  verifyBrowserPlan,
} from '../src/browser';
import { compactPreviewStep, fixture, fixturePlan } from '../src/fixture';
import { modelPreviewSelector } from '../src/model-selector';
import { materialSignature } from '../src/material-signature';

describe.skipIf(process.env['BROWSER_WORKER_LIVE_TESTS'] !== '1')('local Chromium', () => {
  const limits = { timeoutMs: 30_000, maxSteps: 20 };
  const signal = new AbortController().signal;

  const observedGoal = {
    version: 1,
    device: 'mobile',
    startPage: 'list',
    success: { page: 'item', visible: { by: 'role', role: 'status', name: '比較表示中' } },
  } as const;

  const catalogue = {
    pages: new Map([
      [
        'list',
        '<a href="/item">詳細へ進む</a><button disabled>準備中</button><button hidden>非表示</button><button>同名</button><button>同名</button>',
      ],
      [
        'item',
        `<button id="compare">比較を開く</button><div id="result" role="status" aria-label="比較表示中" hidden>比較結果</div>
        <script>document.querySelector('#compare').onclick = () => { document.querySelector('#result').hidden = false; };</script>`,
      ],
    ]),
    samples: new Map(),
  };

  it('discovers links and buttons on an unseen screen and verifies a replay of the new recipe', async () => {
    const offered: string[][] = [];
    const { plan, run } = await discoverObservedBrowserPlan(
      observedGoal,
      catalogue,
      limits,
      signal,
      async (candidates) => {
        offered.push(candidates.map((item) => (item.target.by === 'role' ? item.target.name : '')));
        return candidates[0]!.id;
      },
    );
    expect(offered).toEqual([['詳細へ進む'], ['比較を開く']]);
    expect(run.steps).toHaveLength(2);
    expect(run.steps[1]?.after.accessibility).toContain('比較表示中');
    expect(run.steps.every((step) => step.beforePng.length && step.afterPng.length)).toBe(true);
    const replay = await runBrowserPlan(plan, catalogue, limits, signal);
    expect(replay.steps.map((step) => step.stepId)).toEqual(plan.steps.map((step) => step.id));
  }, 70_000);

  it('fails when the selector returns a candidate outside its current screen', async () => {
    await expect(
      discoverObservedBrowserPlan(
        observedGoal,
        catalogue,
        limits,
        signal,
        async () => 'observed-2-0',
      ),
    ).rejects.toMatchObject({ category: 'STEP_FAILED' });
  }, 40_000);

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

  it('rechecks an unchanged fixture, substitutes an approved target, and rejects a missing action', async () => {
    const plan = fixturePlan('mobile');
    const fallback = { stepId: 'preview', target: compactPreviewStep.target };
    const verify = (pages: ReadonlyMap<string, string>) =>
      verifyBrowserPlan(plan, { ...fixture, pages }, limits, signal, fallback);
    const original = await verify(fixture.pages);
    const repeat = await verify(fixture.pages);
    expect(materialSignature(repeat.plan, repeat.run)).toBe(
      materialSignature(original.plan, original.run),
    );
    const changed = new Map(fixture.pages);
    const editor = changed
      .get('editor')!
      .replace('disabled>プレビュー</button>', 'disabled>旧表示</button>');
    changed.set('editor', editor);
    const repaired = await verify(changed);
    expect(repaired.plan.steps[2]).toMatchObject({
      id: 'preview',
      target: compactPreviewStep.target,
    });
    expect(repaired.run.steps[2]?.after.accessibility).toContain('プレビューを表示しました');
    expect(materialSignature(repaired.plan, repaired.run)).not.toBe(
      materialSignature(original.plan, original.run),
    );
    changed.set(
      'editor',
      editor.replace('disabled>簡易プレビュー</button>', 'disabled>旧簡易表示</button>'),
    );
    await expect(verify(changed)).rejects.toMatchObject({
      category: 'STEP_FAILED',
      stepId: 'preview',
    });
  }, 40_000);

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
