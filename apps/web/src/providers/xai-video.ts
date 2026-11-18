import 'server-only';
import type { VideoSceneGenerationProviderPort } from '@bunshin/application';

const API_BASE_URL = 'https://api.x.ai/v1';
const XAI_VIDEO_OUTPUT_HOSTS = new Set(['vidgen.x.ai']);
const USD_TICKS_PER_USD_MICRO = 10_000;
type Fetch = typeof fetch;

export class XaiVideoProviderError extends Error {
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
    this.name = 'XaiVideoProviderError';
  }
}

export const classifyXaiVideoStatus = (status: number) => {
  if (status === 401 || status === 403)
    return new XaiVideoProviderError('AUTHENTICATION', false, status);
  if (status === 402) return new XaiVideoProviderError('QUOTA', false, status);
  if (status === 429) return new XaiVideoProviderError('RATE_LIMIT', true, status);
  if (status >= 400 && status < 500)
    return new XaiVideoProviderError('INVALID_REQUEST', false, status);
  return new XaiVideoProviderError('PROVIDER_ERROR', status >= 500, status);
};

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const modelName = (value: string) => {
  const model = value.trim();
  if (!/^grok-imagine-video(?:-[a-z0-9.]+)*$/i.test(model) || model.length > 120)
    throw new XaiVideoProviderError('INVALID_REQUEST', false);
  return model;
};

const requestId = (value: unknown) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))
    throw new XaiVideoProviderError('INVALID_RESPONSE', false);
  return value;
};

const safeOutputUrl = (value: unknown) => {
  if (typeof value !== 'string') throw new XaiVideoProviderError('INVALID_RESPONSE', false);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new XaiVideoProviderError('INVALID_RESPONSE', false);
  }
  if (
    url.protocol !== 'https:' ||
    !XAI_VIDEO_OUTPUT_HOSTS.has(url.hostname) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new XaiVideoProviderError('INVALID_RESPONSE', false);
  return url.toString();
};

const actualCostUsdMicros = (body: Record<string, unknown>) => {
  const usage = object(body.usage);
  const ticks = usage?.cost_in_usd_ticks;
  if (typeof ticks !== 'number' || !Number.isSafeInteger(ticks) || ticks < 0)
    throw new XaiVideoProviderError('INVALID_RESPONSE', false);
  const micros = Math.round(ticks / USD_TICKS_PER_USD_MICRO);
  if (!Number.isSafeInteger(micros)) throw new XaiVideoProviderError('INVALID_RESPONSE', false);
  return micros;
};

export class XaiVideoAdapter implements VideoSceneGenerationProviderPort {
  constructor(
    private readonly apiKey: string,
    private readonly request: Fetch = fetch,
    private readonly timeoutMs = 20_000,
  ) {
    if (!apiKey.trim()) throw new XaiVideoProviderError('AUTHENTICATION', false);
  }

  private async call(path: string, init: RequestInit) {
    let response: Response;
    try {
      response = await this.request(`${API_BASE_URL}/${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...init.headers,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new XaiVideoProviderError('TIMEOUT_OR_NETWORK', true);
    }
    if (!response.ok) throw classifyXaiVideoStatus(response.status);
    try {
      const body = object(await response.json());
      if (!body) throw new XaiVideoProviderError('INVALID_RESPONSE', false, response.status);
      return body;
    } catch (error) {
      if (error instanceof XaiVideoProviderError) throw error;
      throw new XaiVideoProviderError('INVALID_RESPONSE', false, response.status);
    }
  }

  async submit(input: Parameters<VideoSceneGenerationProviderPort['submit']>[0]) {
    const model = modelName(input.model);
    const prompt = input.prompt.trim();
    if (
      !input.generationId.trim() ||
      !prompt ||
      prompt.length > 5_000 ||
      ![5, 10].includes(input.durationSeconds) ||
      input.referenceImageUrls.length > 7
    )
      throw new XaiVideoProviderError('INVALID_REQUEST', false);
    const sourceImageUrl = input.referenceImageUrls[0];
    const body = await this.call('videos/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        duration: input.durationSeconds,
        resolution: '720p',
        ...(sourceImageUrl ? { image: { url: sourceImageUrl } } : { aspect_ratio: '9:16' }),
      }),
    });
    return { externalJobId: requestId(body.request_id) };
  }

  async inspect(input: Parameters<VideoSceneGenerationProviderPort['inspect']>[0]) {
    modelName(input.model);
    const id = requestId(input.externalJobId);
    const body = await this.call(`videos/${encodeURIComponent(id)}`, { method: 'GET' });
    if (body.status === 'pending' || body.status === 'queued')
      return { status: 'SUBMITTED' as const };
    if (body.status === 'processing' || body.status === 'in_progress' || body.status === 'running')
      return { status: 'GENERATING' as const };
    if (body.status === 'failed')
      return { status: 'FAILED' as const, errorCode: 'XAI_VIDEO_GENERATION_FAILED' };
    if (body.status !== 'done') throw new XaiVideoProviderError('INVALID_RESPONSE', false);
    const video = object(body.video);
    if (!video) throw new XaiVideoProviderError('INVALID_RESPONSE', false);
    return {
      status: 'SUCCEEDED' as const,
      outputUrl: safeOutputUrl(video.url),
      actualCostUsdMicros: actualCostUsdMicros(body),
    };
  }
}
