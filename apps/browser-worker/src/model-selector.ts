import {
  browserObservedChoiceSchema,
  browserObservedSelectionSchema,
  browserFormResponseSchema,
  browserFormSelectionSchema,
  browserPreviewChoices,
  browserPreviewChoiceSchema,
  type BrowserFormSelection,
  type BrowserObservedSelection,
} from '@bunshin/capability-browser';
import { BrowserRunError, type BrowserStepSelector, type ObservedStepSelector } from './browser';

export function modelPreviewSelector(jobId: string, workerId: string): BrowserStepSelector {
  return async (candidates, signal) => {
    if (candidates.length === 1) return candidates[0]!.id;
    if (
      candidates.length !== browserPreviewChoices.length ||
      !browserPreviewChoices.every((choice) => candidates.some(({ id }) => id === choice))
    )
      throw new BrowserRunError('INVALID_PLAN');

    const response = await requestModelSelection(jobId, workerId, signal);
    const selected = browserPreviewChoiceSchema.safeParse(await response.json());
    if (!selected.success) throw new BrowserRunError('MODEL_SELECTION_FAILED');
    return selected.data;
  };
}

export function browserFixtureWorkerEndpoint(
  path: '/api/internal/browser-fixture/select' | '/api/internal/browser-fixture/narration',
) {
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
        origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
      ))
  )
    throw new BrowserRunError('MODEL_SELECTION_FAILED');
  return { url: new URL(path, origin), secret };
}

async function requestModelSelection(
  jobId: string,
  workerId: string,
  signal: AbortSignal,
  observed?: BrowserObservedSelection | BrowserFormSelection,
) {
  const { url, secret } = browserFixtureWorkerEndpoint('/api/internal/browser-fixture/select');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'x-browser-job-id': jobId,
      'x-browser-worker-id': workerId,
      ...(observed ? { 'content-type': 'application/json' } : {}),
    },
    ...(observed ? { body: JSON.stringify(observed) } : {}),
    redirect: 'error',
    signal,
  });
  if (!response.ok) throw new BrowserRunError('MODEL_SELECTION_FAILED');
  return response;
}

export function modelObservedSelector(
  jobId: string,
  workerId: string,
  form = false,
): ObservedStepSelector {
  let ordinal = 0;
  return async (candidates, signal) => {
    const schema = form ? browserFormSelectionSchema : browserObservedSelectionSchema;
    const body = schema.safeParse({
      ordinal: ++ordinal,
      choices: candidates.map(({ id, target }) =>
        target.by === 'role' ? { id, role: target.role, name: target.name } : null,
      ),
    });
    if (!body.success) throw new BrowserRunError('INVALID_PLAN');
    const response = await requestModelSelection(jobId, workerId, signal, body.data);
    const selected = (
      form ? browserFormResponseSchema.shape.id : browserObservedChoiceSchema.shape.id
    ).safeParse(await response.json());
    if (!selected.success || !body.data.choices.some(({ id }) => id === selected.data))
      throw new BrowserRunError('MODEL_SELECTION_FAILED');
    return selected.data;
  };
}
