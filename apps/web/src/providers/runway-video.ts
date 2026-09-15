import 'server-only';
import type { VideoSceneGenerationProviderPort } from '@bunshin/application';

const API_BASE_URL = 'https://api.dev.runwayml.com/v1';
const API_VERSION = '2024-11-06';
const RUNWAY_OUTPUT_HOSTS = new Set(['dnznrvs05pmza.cloudfront.net']);
type Fetch = typeof fetch;

export class RunwayVideoProviderError extends Error {
  constructor(
    readonly category:
      | 'AUTHENTICATION'
      | 'RATE_LIMIT'
      | 'QUOTA'
      | 'INVALID_REQUEST'
      | 'INVALID_RESPONSE'
      | 'TIMEOUT_OR_NETWORK'
      | 'PROVIDER_ERROR',
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(category);
    this.name = 'RunwayVideoProviderError';
  }
}

export const classifyRunwayStatus = (status: number) => {
  if (status === 401 || status === 403)
    return new RunwayVideoProviderError('AUTHENTICATION', false, status);
  if (status === 402) return new RunwayVideoProviderError('QUOTA', false, status);
  if (status === 429) return new RunwayVideoProviderError('RATE_LIMIT', true, status);
  if (status >= 400 && status < 500)
    return new RunwayVideoProviderError('INVALID_REQUEST', false, status);
  return new RunwayVideoProviderError('PROVIDER_ERROR', status >= 500, status);
};

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const modelName = (value: string) => {
  const model = value.trim();
  if (!['gen4_turbo', 'gen4.5'].includes(model))
    throw new RunwayVideoProviderError('INVALID_REQUEST', false);
  return model;
};

const taskId = (value: unknown) => {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    throw new RunwayVideoProviderError('INVALID_RESPONSE', false);
  return value;
};

const safeOutputUrl = (value: unknown) => {
  if (typeof value !== 'string') throw new RunwayVideoProviderError('INVALID_RESPONSE', false);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RunwayVideoProviderError('INVALID_RESPONSE', false);
  }
  const allowedHost =
    RUNWAY_OUTPUT_HOSTS.has(url.hostname) ||
    url.hostname === 'runwayml.com' ||
    url.hostname.endsWith('.runwayml.com');
  if (url.protocol !== 'https:' || !allowedHost || url.username || url.password || url.hash)
    throw new RunwayVideoProviderError('INVALID_RESPONSE', false);
  return url.toString();
};

export class RunwayVideoAdapter implements VideoSceneGenerationProviderPort {
  constructor(
    private readonly apiKey: string,
    private readonly request: Fetch = fetch,
    private readonly timeoutMs = 20_000,
  ) {
    if (!apiKey.trim()) throw new RunwayVideoProviderError('AUTHENTICATION', false);
  }

  private async call(path: string, init: RequestInit) {
    let response: Response;
    try {
      response = await this.request(`${API_BASE_URL}/${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'X-Runway-Version': API_VERSION,
          ...init.headers,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new RunwayVideoProviderError('TIMEOUT_OR_NETWORK', true);
    }
    if (!response.ok) throw classifyRunwayStatus(response.status);
    try {
      const body = object(await response.json());
      if (!body) throw new RunwayVideoProviderError('INVALID_RESPONSE', false, response.status);
      return body;
    } catch (error) {
      if (error instanceof RunwayVideoProviderError) throw error;
      throw new RunwayVideoProviderError('INVALID_RESPONSE', false, response.status);
    }
  }

  async submit(input: Parameters<VideoSceneGenerationProviderPort['submit']>[0]) {
    const model = modelName(input.model);
    const prompt = input.prompt.trim();
    const promptImage = input.referenceImageUrls[0];
    if (
      !input.generationId.trim() ||
      !prompt ||
      prompt.length > 1_000 ||
      !promptImage ||
      input.referenceImageUrls.length > 7
    )
      throw new RunwayVideoProviderError('INVALID_REQUEST', false);
    const body = await this.call('image_to_video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        promptImage,
        promptText: prompt,
        ratio: '720:1280',
        duration: input.durationSeconds,
      }),
    });
    return { externalJobId: taskId(body.id) };
  }

  async inspect(input: Parameters<VideoSceneGenerationProviderPort['inspect']>[0]) {
    modelName(input.model);
    const id = taskId(input.externalJobId);
    const body = await this.call(`tasks/${encodeURIComponent(id)}`, { method: 'GET' });
    if (body.status === 'PENDING' || body.status === 'THROTTLED')
      return { status: 'SUBMITTED' as const };
    if (body.status === 'RUNNING') return { status: 'GENERATING' as const };
    if (body.status === 'SUCCEEDED') {
      const outputs: unknown[] = Array.isArray(body.output) ? (body.output as unknown[]) : [];
      const output = outputs[0];
      return { status: 'SUCCEEDED' as const, outputUrl: safeOutputUrl(output) };
    }
    if (body.status === 'FAILED' || body.status === 'CANCELED')
      return { status: 'FAILED' as const, errorCode: 'PROVIDER_GENERATION_FAILED' };
    throw new RunwayVideoProviderError('INVALID_RESPONSE', false);
  }
}
