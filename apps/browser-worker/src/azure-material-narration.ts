import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserRunError } from './browser';
import { browserFixtureWorkerEndpoint } from './model-selector';
import type { NarrateMaterialStep } from './material-narration';

export function browserMaterialNarration(jobId: string, workerId: string): NarrateMaterialStep {
  let ordinal = 0;
  return async ({ directory, file, signal }) => {
    const endpoint = browserFixtureWorkerEndpoint('/api/internal/browser-fixture/narration');
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${endpoint.secret}`,
        'x-browser-job-id': jobId,
        'x-browser-worker-id': workerId,
        'x-browser-step-ordinal': String(++ordinal),
      },
      signal,
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404) throw new BrowserRunError('INVALID_PLAN');
      throw new Error('browser material narration unavailable');
    }
    await writeFile(join(directory, file), new Uint8Array(await response.arrayBuffer()), {
      signal,
    });
  };
}
