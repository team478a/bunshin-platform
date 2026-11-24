import type { BrowserRun } from '@bunshin/capability-browser';
import { expect, it } from 'vitest';
import { fixturePlan } from '../src/fixture';
import { materialSignature } from '../src/material-signature';

const state = (label: string, time: string) => ({
  page: 'editor',
  accessibility: `- heading "メモを作成"
- paragraph "広告 ${time}"
- button "${label}"
- heading "更新 2026-11-25 ${time}"`,
});
const run = (label: string, time: string): BrowserRun => ({
  browserVersion: 'fixture',
  durationMs: 10,
  verifiedAt: '2026-11-25T08:00:00Z',
  device: 'mobile',
  steps: [
    {
      stepId: 'preview',
      action: 'click',
      before: state(label, time),
      after: state(label, time),
      beforePng: new Uint8Array([Number(time[0])]),
      afterPng: new Uint8Array([Number(time[0])]),
    },
  ],
});

it('ignores time, free-form text and image bytes but detects a changed action label', () => {
  const plan = fixturePlan('mobile');
  const original = materialSignature(plan, run('プレビュー', '10:20'));
  expect(materialSignature(plan, run('プレビュー', '20:23'))).toBe(original);
  expect(materialSignature(plan, run('結果を見る', '10:20'))).not.toBe(original);
});
