import { createHash } from 'node:crypto';
import type { BrowserPlan, BrowserRun } from '@bunshin/capability-browser';

const controls = (snapshot: string) =>
  snapshot
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^- (button|checkbox|combobox|heading|link|radio|textbox)\b/.test(line))
    .map((line) =>
      line
        .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );

export function materialSignature(plan: BrowserPlan, run: BrowserRun) {
  const evidence = run.steps.map(({ stepId, action, before, after }) => ({
    stepId,
    action,
    before: [before.page, controls(before.accessibility)],
    after: [after.page, controls(after.accessibility)],
  }));
  return createHash('sha256').update(JSON.stringify({ plan, evidence })).digest('hex');
}
