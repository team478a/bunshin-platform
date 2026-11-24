import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { browserPlanSchema, type BrowserRun } from '@bunshin/capability-browser';
import { runBrowserPlan } from '../src/browser';
import { saveEvidence } from '../src/evidence';
import { fixture, fixturePlan } from '../src/fixture';

describe('browser worker contract', () => {
  const limits = { timeoutMs: 30_000, maxSteps: 20 };
  const signal = new AbortController().signal;

  it('rejects executable code and repeated evidence identifiers', () => {
    const plan = fixturePlan('desktop');
    expect(
      browserPlanSchema.safeParse({
        ...plan,
        steps: [{ id: 'script', action: 'evaluate', source: 'return true' }],
      }).success,
    ).toBe(false);
    expect(
      browserPlanSchema.safeParse({ ...plan, steps: [...plan.steps, plan.steps[0]] }).success,
    ).toBe(false);
  });

  it('rejects pages outside the fixture and enforces the operation limit before launch', async () => {
    const plan = fixturePlan('mobile');
    await expect(
      runBrowserPlan({ ...plan, startPage: 'unknown' }, fixture, limits, signal),
    ).rejects.toMatchObject({ category: 'INVALID_PLAN' });
    await expect(
      runBrowserPlan(plan, fixture, { ...limits, maxSteps: 1 }, signal),
    ).rejects.toMatchObject({ category: 'INVALID_PLAN' });
  });

  it('handles a job cancelled before browser startup', async () => {
    await expect(
      runBrowserPlan(fixturePlan('mobile'), fixture, limits, AbortSignal.abort()),
    ).rejects.toMatchObject({ category: 'CANCELLED' });
  });

  it('associates both images with the step and leaves no partial output on cancellation', async () => {
    const output = await mkdtemp(join(tmpdir(), 'browser-worker-test-'));
    const state = { page: 'home', accessibility: '- heading: Home' };
    const run: BrowserRun = {
      browserVersion: 'sample',
      durationMs: 5,
      verifiedAt: '2026-11-24T00:00:00Z',
      device: 'mobile',
      steps: [
        {
          stepId: 'first',
          action: 'scroll',
          before: state,
          after: state,
          beforePng: Uint8Array.of(1),
          afterPng: Uint8Array.of(2),
        },
      ],
    };
    try {
      await expect(saveEvidence(output, 'cancelled', run, AbortSignal.abort())).rejects.toThrow();
      expect(await readdir(output)).toEqual([]);
      await saveEvidence(output, 'attempt-1', run, signal);
      expect(await readdir(join(output, 'attempt-1'))).toEqual([
        'evidence.json',
        'first-after.png',
        'first-before.png',
      ]);
      const evidence = JSON.parse(
        await readFile(join(output, 'attempt-1', 'evidence.json'), 'utf8'),
      );
      expect(evidence.steps).toEqual([
        {
          stepId: 'first',
          action: 'scroll',
          before: state,
          after: state,
          beforeImage: 'first-before.png',
          afterImage: 'first-after.png',
        },
      ]);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
});
