import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserRun } from '@bunshin/capability-browser';

export async function saveEvidence(
  parent: string,
  directory: string,
  run: BrowserRun,
  signal: AbortSignal,
) {
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(parent, '.pending-'));
  const output = join(parent, directory);
  try {
    const steps = [];
    for (const { stepId, action, before, after, beforePng, afterPng } of run.steps) {
      const beforeImage = `${stepId}-before.png`;
      const afterImage = `${stepId}-after.png`;
      await writeFile(join(staging, beforeImage), beforePng, { signal, mode: 0o600 });
      await writeFile(join(staging, afterImage), afterPng, { signal, mode: 0o600 });
      steps.push({ stepId, action, before, after, beforeImage, afterImage });
    }
    await writeFile(join(staging, 'evidence.json'), JSON.stringify({ ...run, steps }, null, 2), {
      signal,
      mode: 0o600,
    });
    signal.throwIfAborted();
    await rename(staging, output);
    return output;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
