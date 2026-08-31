import 'server-only';
import type { VideoSceneGenerationProviderPort } from '@bunshin/application';

const API_BASE_URL = 'https://queue.fal.run';
const FAL_HOSTS = new Set(['fal.media', 'v3.fal.media', 'v2.fal.media']);
type Fetch = typeof fetch;

export class FalKlingVideoProviderError extends Error {
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
    this.name = 'FalKlingVideoProviderError';
  }
}

export const classifyFalStatus = (status: number) => {
  if (status === 401 || status === 403)
    return new FalKlingVideoProviderError('AUTHENTICATION', false, status);
  if (status === 402) return new FalKlingVideoProviderError('QUOTA', false, status);
  if (status === 429) return new FalKlingVideoProviderError('RATE_LIMIT', true, status);
  if (status >= 400 && status < 500)
    return new FalKlingVideoProviderError('INVALID_REQUEST', false, status);
  return new FalKlingVideoProviderError('PROVIDER_ERROR', status >= 500, status);
};

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const safeOutputUrl = (value: unknown) => {
  if (typeof value !== 'string') throw new FalKlingVideoProviderError('INVALID_RESPONSE', false);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FalKlingVideoProviderError('INVALID_RESPONSE', false);
  }
  if (url.protocol !== 'https:' || !FAL_HOSTS.has(url.hostname) || url.username || url.password)
    throw new FalKlingVideoProviderError('INVALID_RESPONSE', false);
  return url.toString();
};

const modelPath = (value: string) => {
  const model = value.trim();
  if (!/^fal-ai\/kling-video\/[a-z0-9./-]{1,160}$/i.test(model))
    throw new FalKlingVideoProviderError('INVALID_REQUEST', false);
  return model;
};

export class FalKlingVideoAdapter implements VideoSceneGenerationProviderPort {
  constructor(
    private readonly apiKey: string,
    private readonly request: Fetch = fetch,
    private readonly timeoutMs = 20_000,
  ) {
    if (!apiKey.trim()) throw new FalKlingVideoProviderError('AUTHENTICATION', false);
  }

  private async call(path: string, init: RequestInit) {
    let response: Response;
    try {
      response = await this.request(`${API_BASE_URL}/${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Key ${this.apiKey}`,
          ...init.headers,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new FalKlingVideoProviderError('TIMEOUT_OR_NETWORK', true);
    }
    if (!response.ok) throw classifyFalStatus(response.status);
    try {
      const body = object(await response.json());
      if (!body) throw new FalKlingVideoProviderError('INVALID_RESPONSE', false, response.status);
      return body;
    } catch (error) {
      if (error instanceof FalKlingVideoProviderError) throw error;
      throw new FalKlingVideoProviderError('INVALID_RESPONSE', false, response.status);
    }
  }

  async submit(input: Parameters<VideoSceneGenerationProviderPort['submit']>[0]) {
    const model = modelPath(input.model);
    if (!input.generationId.trim() || !input.prompt.trim() || input.referenceImageUrls.length > 7)
      throw new FalKlingVideoProviderError('INVALID_REQUEST', false);
    const body = await this.call(model, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: input.prompt,
        duration: input.durationSeconds,
        image_urls: input.referenceImageUrls,
      }),
    });
    if (typeof body.request_id !== 'string' || !body.request_id)
      throw new FalKlingVideoProviderError('INVALID_RESPONSE', false);
    return { externalJobId: body.request_id };
  }

  async inspect(input: Parameters<VideoSceneGenerationProviderPort['inspect']>[0]) {
    const model = modelPath(input.model);
    if (!/^[a-z0-9_-]{1,255}$/i.test(input.externalJobId))
      throw new FalKlingVideoProviderError('INVALID_REQUEST', false);
    const body = await this.call(
      `${model}/requests/${encodeURIComponent(input.externalJobId)}/status`,
      {
        method: 'GET',
      },
    );
    if (body.status === 'IN_QUEUE') return { status: 'SUBMITTED' as const };
    if (body.status === 'IN_PROGRESS') return { status: 'GENERATING' as const };
    if (body.status === 'COMPLETED') {
      const responseUrl = body.response_url;
      if (typeof responseUrl !== 'string')
        throw new FalKlingVideoProviderError('INVALID_RESPONSE', false);
      const output = await this.callAbsolute(responseUrl);
      const video = object(output.video);
      return { status: 'SUCCEEDED' as const, outputUrl: safeOutputUrl(video?.url) };
    }
    if (body.status === 'FAILED')
      return { status: 'FAILED' as const, errorCode: 'PROVIDER_GENERATION_FAILED' };
    throw new FalKlingVideoProviderError('INVALID_RESPONSE', false);
  }

  private async callAbsolute(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new FalKlingVideoProviderError('INVALID_RESPONSE', false);
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'queue.fal.run' ||
      parsed.username ||
      parsed.password
    )
      throw new FalKlingVideoProviderError('INVALID_RESPONSE', false);
    return this.call(parsed.pathname.replace(/^\//, '') + parsed.search, { method: 'GET' });
  }
}
