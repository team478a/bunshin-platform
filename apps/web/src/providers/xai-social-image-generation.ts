import 'server-only';
import type { SocialImageAssetGenerationProviderPort } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import sharp from 'sharp';

const GENERATION_ENDPOINT = 'https://api.x.ai/v1/images/generations';
const EDIT_ENDPOINT = 'https://api.x.ai/v1/images/edits';
const MAX_IMAGE_BYTES = 30_000_000;
const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,119}$/;

type XaiImageResponse = {
  data?: Array<{ b64_json?: string; mime_type?: string }>;
  error?: { code?: string; type?: string };
};

export type XaiSocialImageFailureCategory =
  | 'AUTHENTICATION'
  | 'RATE_LIMIT'
  | 'CONTENT_POLICY'
  | 'INVALID_REQUEST'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE';

export class XaiSocialImageProviderError extends Error {
  constructor(
    readonly category: XaiSocialImageFailureCategory,
    readonly retryable: boolean,
  ) {
    super(category);
  }
}

function failure(status: number, value: XaiImageResponse) {
  const code = value.error?.code ?? value.error?.type ?? '';
  if (status === 401 || status === 403)
    return new XaiSocialImageProviderError('AUTHENTICATION', false);
  if (status === 429) return new XaiSocialImageProviderError('RATE_LIMIT', true);
  if (/content|safety|moderation/i.test(code))
    return new XaiSocialImageProviderError('CONTENT_POLICY', false);
  if (status >= 500) return new XaiSocialImageProviderError('PROVIDER_UNAVAILABLE', true);
  return new XaiSocialImageProviderError('INVALID_REQUEST', false);
}

async function pngBytes(value: XaiImageResponse) {
  const encoded = value.data?.[0]?.b64_json;
  if (!encoded || encoded.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4)
    throw new XaiSocialImageProviderError('INVALID_RESPONSE', false);
  let decoded: Buffer;
  try {
    decoded = Buffer.from(encoded, 'base64');
  } catch {
    throw new XaiSocialImageProviderError('INVALID_RESPONSE', false);
  }
  if (!decoded.length || decoded.length > MAX_IMAGE_BYTES)
    throw new XaiSocialImageProviderError('INVALID_RESPONSE', false);
  try {
    const metadata = await sharp(decoded, { limitInputPixels: 40_000_000 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? ''))
      throw new Error('unsupported image');
    const output = await sharp(decoded).png().toBuffer();
    if (output.length > MAX_IMAGE_BYTES) throw new Error('image too large');
    return new Uint8Array(output);
  } catch {
    throw new XaiSocialImageProviderError('INVALID_RESPONSE', false);
  }
}

export class XaiSocialImageGenerationAdapter implements SocialImageAssetGenerationProviderPort {
  constructor(
    private readonly options: { apiKey: string; fetch?: typeof fetch; now?: () => number },
  ) {
    if (!options.apiKey.trim())
      throw new ApplicationError('CONFIGURATION_ERROR', 'xAI APIキーが設定されていません');
  }

  async generate(input: Parameters<SocialImageAssetGenerationProviderPort['generate']>[0]) {
    const prompt = input.prompt.trim();
    if (!prompt || prompt.length > 32_000)
      throw new ApplicationError('VALIDATION_ERROR', '画像生成指示が不正です');
    if (!MODEL.test(input.model))
      throw new ApplicationError('CONFIGURATION_ERROR', '画像生成モデルの設定が不正です');
    if (input.width !== 1080 || input.height !== 1350)
      throw new ApplicationError('VALIDATION_ERROR', '画像生成サイズが不正です');
    if (!['low', 'medium', 'high', 'auto'].includes(input.quality))
      throw new ApplicationError('CONFIGURATION_ERROR', '画像生成品質の設定が不正です');
    if (input.referenceImage && input.referenceImage.length > 20_000_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reference image');
    const quality = input.quality === 'low' ? 'low' : input.quality === 'auto' ? 'auto' : 'medium';
    const body = {
      model: input.model,
      prompt,
      n: 1,
      aspect_ratio: '3:4',
      resolution: '1k',
      quality,
      response_format: 'b64_json',
      ...(input.referenceImage
        ? {
            image: {
              type: 'image_url',
              url: `data:image/png;base64,${Buffer.from(input.referenceImage).toString('base64')}`,
            },
          }
        : {}),
    };
    const now = this.options.now ?? Date.now;
    const started = now();
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(
        input.referenceImage ? EDIT_ENDPOINT : GENERATION_ENDPOINT,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          cache: 'no-store',
          signal: AbortSignal.timeout(120_000),
        },
      );
    } catch {
      throw new XaiSocialImageProviderError('PROVIDER_UNAVAILABLE', true);
    }
    let value: XaiImageResponse;
    try {
      value = (await response.json()) as XaiImageResponse;
    } catch {
      if (!response.ok) throw failure(response.status, {});
      throw new XaiSocialImageProviderError('INVALID_RESPONSE', response.status >= 500);
    }
    if (!response.ok) throw failure(response.status, value);
    return {
      bytes: await pngBytes(value),
      mimeType: 'image/png' as const,
      provider: 'XAI',
      model: input.model,
      quality,
      inputTokens: null,
      outputTokens: null,
      latencyMs: Math.max(0, now() - started),
    };
  }
}
