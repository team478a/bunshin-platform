import 'server-only';
import type { VideoProjectRecord, VideoRenderProviderPort } from '@bunshin/application';
import { assertSupportedVideoComposition } from '@bunshin/application';
import { isAllowedCreatomateOutputUrl } from '../video/creatomate-output-url';

const API_BASE_URL = 'https://api.creatomate.com/v2';

type Fetch = typeof fetch;

export class VideoRenderProviderError extends Error {
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
    this.name = 'VideoRenderProviderError';
  }
}

export function classifyCreatomateStatus(status: number) {
  if (status === 401 || status === 403)
    return new VideoRenderProviderError('AUTHENTICATION', false, status);
  if (status === 402) return new VideoRenderProviderError('QUOTA', false, status);
  if (status === 429) return new VideoRenderProviderError('RATE_LIMIT', true, status);
  if (status >= 400 && status < 500)
    return new VideoRenderProviderError('INVALID_REQUEST', false, status);
  return new VideoRenderProviderError('PROVIDER_ERROR', status >= 500, status);
}

export function buildCreatomateRenderScript(
  project: VideoProjectRecord,
  aiSceneSources: Array<{ videoSceneId: string; url: string }> = [],
  photoSceneSources: Array<{ videoSceneId: string; url: string }> = [],
  narrationUrl?: string,
) {
  assertSupportedVideoComposition(project);
  if (project.aiProcessingTypes.includes('VOICE_SYNTHESIS') && !project.narrationEnabled)
    throw new VideoRenderProviderError('INVALID_REQUEST', false);
  if (Boolean(project.narrationEnabled) !== Boolean(narrationUrl))
    throw new VideoRenderProviderError('INVALID_REQUEST', false);
  const photos = new Map(photoSceneSources.map((source) => [source.videoSceneId, source.url]));
  if (
    photos.size !== photoSceneSources.length ||
    photoSceneSources.some(
      (source) =>
        !project.scenes.some(
          (scene) => scene.id === source.videoSceneId && scene.visualType === 'USER_ASSET',
        ),
    )
  )
    throw new VideoRenderProviderError('INVALID_REQUEST', false);
  if (project.standardComposition && (project.aiVideoSceneCount > 0 || aiSceneSources.length > 0))
    throw new VideoRenderProviderError('INVALID_REQUEST', false);
  const sources = new Map(aiSceneSources.map((source) => [source.videoSceneId, source.url]));
  if (sources.size !== aiSceneSources.length)
    throw new VideoRenderProviderError('INVALID_REQUEST', false);

  let time = 0;
  const elements = project.scenes.flatMap((scene, index) => {
    const duration = scene.durationMs / 1000;
    const background = index % 2 === 0 ? '#fff9f5' : '#f3f6ff';
    const requiresAiVideo =
      scene.visualType === 'AI_VIDEO' || scene.aiProcessingTypes.includes('VIDEO_GENERATION');
    const source = sources.get(scene.id);
    if (requiresAiVideo && !source) throw new VideoRenderProviderError('INVALID_REQUEST', false);
    const photo = photos.get(scene.id);
    if (scene.visualType === 'USER_ASSET' && !photo)
      throw new VideoRenderProviderError('INVALID_REQUEST', false);
    const visualElement = photo
      ? {
          type: 'image',
          track: 1,
          time,
          duration,
          source: photo,
          fit: 'contain',
          width: '100%',
          height: '100%',
        }
      : source
        ? {
            type: 'video',
            track: 1,
            time,
            duration,
            source,
            fit: 'cover',
            volume: '0%',
          }
        : {
            type: 'shape',
            track: 1,
            time,
            duration,
            width: '100%',
            height: '100%',
            fill_color: background,
          };
    const sceneElements = [
      visualElement,
      {
        type: 'text',
        track: 2,
        time,
        duration,
        text: scene.caption,
        x: '50%',
        y: photo ? '83%' : '50%',
        width: '84%',
        height: photo ? '24%' : '48%',
        x_alignment: '50%',
        y_alignment: '50%',
        fill_color: source || photo ? '#ffffff' : '#0b3470',
        stroke_color: source || photo ? '#0b3470' : undefined,
        font_family: 'Noto Sans JP',
        font_weight: '700',
        font_size: '7.2 vmin',
        animations: [{ type: 'text-appear', duration: Math.min(0.4, duration / 4) }],
      },
    ];
    time += duration;
    return sceneElements;
  });

  if (time !== project.durationSeconds)
    throw new VideoRenderProviderError('INVALID_REQUEST', false);

  return {
    output_format: 'mp4',
    width: 1080,
    height: 1920,
    frame_rate: 30,
    duration: project.durationSeconds,
    elements: [
      ...elements,
      ...(narrationUrl
        ? [
            {
              type: 'audio',
              track: 3,
              time: 0,
              duration: project.durationSeconds,
              source: narrationUrl,
            },
            {
              type: 'text',
              track: 4,
              time: 0,
              duration: project.durationSeconds,
              text: 'AI音声',
              x: '90%',
              y: '5%',
              width: '16%',
              font_size: '2.5 vmin',
              fill_color: '#ffffff',
              stroke_color: '#000000',
            },
          ]
        : []),
    ],
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function json(response: Response) {
  try {
    return object(await response.json());
  } catch {
    return null;
  }
}

function safeOutputUrl(value: unknown) {
  if (typeof value !== 'string') throw new VideoRenderProviderError('INVALID_RESPONSE', false);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VideoRenderProviderError('INVALID_RESPONSE', false);
  }
  if (!isAllowedCreatomateOutputUrl(url))
    throw new VideoRenderProviderError('INVALID_RESPONSE', false);
  return url.toString();
}

export class CreatomateVideoRenderAdapter implements VideoRenderProviderPort {
  constructor(
    private readonly apiKey: string,
    private readonly request: Fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {
    if (!apiKey.trim()) throw new VideoRenderProviderError('AUTHENTICATION', false);
  }

  private async call(url: string, init: RequestInit) {
    let response: Response;
    try {
      response = await this.request(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...init.headers,
        },
      });
    } catch {
      throw new VideoRenderProviderError('TIMEOUT_OR_NETWORK', true);
    }
    if (!response.ok) throw classifyCreatomateStatus(response.status);
    const body = await json(response);
    if (!body) throw new VideoRenderProviderError('INVALID_RESPONSE', false, response.status);
    return body;
  }

  async submit(input: Parameters<VideoRenderProviderPort['submit']>[0]) {
    const body = await this.call(`${API_BASE_URL}/renders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...buildCreatomateRenderScript(
          input.project,
          input.aiSceneSources,
          input.photoSceneSources,
          input.narrationUrl,
        ),
        metadata: input.renderId,
        webhook_url: input.webhookUrl,
      }),
    });
    if (typeof body.id !== 'string' || !body.id)
      throw new VideoRenderProviderError('INVALID_RESPONSE', false);
    return { externalJobId: body.id };
  }

  async inspect(input: Parameters<VideoRenderProviderPort['inspect']>[0]) {
    const externalJobId = input.externalJobId.trim();
    if (!/^[0-9a-z-]{1,255}$/i.test(externalJobId))
      throw new VideoRenderProviderError('INVALID_REQUEST', false);
    const body = await this.call(`${API_BASE_URL}/renders/${encodeURIComponent(externalJobId)}`, {
      method: 'GET',
    });
    switch (body.status) {
      case 'planned':
      case 'waiting':
        return { status: 'SUBMITTED' as const };
      case 'transcribing':
      case 'rendering':
        return { status: 'RENDERING' as const };
      case 'succeeded':
        return { status: 'SUCCEEDED' as const, outputUrl: safeOutputUrl(body.url) };
      case 'failed':
        return { status: 'FAILED' as const, errorCode: 'PROVIDER_RENDER_FAILED' };
      default:
        throw new VideoRenderProviderError('INVALID_RESPONSE', false);
    }
  }
}
