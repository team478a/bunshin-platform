import { browserPreviewChoices, browserPreviewChoiceSchema } from '@bunshin/capability-browser';
import { BrowserRunError, type BrowserStepSelector } from './browser';

export function modelPreviewSelector(jobId: string, workerId: string): BrowserStepSelector {
  return async (candidates, signal) => {
    if (candidates.length === 1) return candidates[0]!.id;
    if (
      candidates.length !== browserPreviewChoices.length ||
      !browserPreviewChoices.every((choice) => candidates.some(({ id }) => id === choice))
    )
      throw new BrowserRunError('INVALID_PLAN');

    const base = process.env['BROWSER_FIXTURE_MODEL_ORIGIN'];
    const secret = process.env['BROWSER_FIXTURE_MODEL_SECRET'];
    if (!base || !secret) throw new BrowserRunError('MODEL_SELECTION_FAILED');
    const origin = new URL(base);
    if (
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      (origin.protocol !== 'https:' &&
        !(
          origin.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
        ))
    )
      throw new BrowserRunError('MODEL_SELECTION_FAILED');
    const response = await fetch(new URL('/api/internal/browser-fixture/select', origin), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'x-browser-job-id': jobId,
        'x-browser-worker-id': workerId,
      },
      redirect: 'error',
      signal,
    });
    if (!response.ok) throw new BrowserRunError('MODEL_SELECTION_FAILED');
    const selected = browserPreviewChoiceSchema.safeParse(await response.json());
    if (!selected.success) throw new BrowserRunError('MODEL_SELECTION_FAILED');
    return selected.data;
  };
}
