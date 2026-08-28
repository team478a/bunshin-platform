import 'server-only';
import type { SocialImageAssetGenerationProviderPort } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

const ENDPOINT = 'https://api.openai.com/v1/images/generations';
const MAX_RESPONSE_BYTES = 30_000_000;
const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,119}$/;
const QUALITIES = new Set(['low', 'medium', 'high', 'auto']);

type ImageResponse = {
  data?: Array<{ b64_json?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: { code?: string; type?: string };
};

export type OpenAiSocialImageFailureCategory =
  | 'AUTHENTICATION'
  | 'RATE_LIMIT'
  | 'CONTENT_POLICY'
  | 'INVALID_REQUEST'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE';

export class OpenAiSocialImageProviderError extends Error {
  constructor(
    readonly category: OpenAiSocialImageFailureCategory,
    readonly retryable: boolean,
  ) {
    super(category);
  }
}

function failure(status: number, value: ImageResponse) {
  const code = value.error?.code ?? value.error?.type ?? '';
  if (status === 401 || status === 403)
    return new OpenAiSocialImageProviderError('AUTHENTICATION', false);
  if (status === 429) return new OpenAiSocialImageProviderError('RATE_LIMIT', true);
  if (/content|safety|moderation/i.test(code))
    return new OpenAiSocialImageProviderError('CONTENT_POLICY', false);
  if (status >= 500) return new OpenAiSocialImageProviderError('PROVIDER_UNAVAILABLE', true);
  return new OpenAiSocialImageProviderError('INVALID_REQUEST', false);
}

function imageBytes(value: ImageResponse) {
  const encoded = value.data?.[0]?.b64_json;
  if (!encoded || encoded.length > Math.ceil((MAX_RESPONSE_BYTES * 4) / 3) + 4)
    throw new OpenAiSocialImageProviderError('INVALID_RESPONSE', false);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(encoded, 'base64'));
  } catch {
    throw new OpenAiSocialImageProviderError('INVALID_RESPONSE', false);
  }
  const png =
    bytes.length >= 8 &&
    Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!png || bytes.length > MAX_RESPONSE_BYTES)
    throw new OpenAiSocialImageProviderError('INVALID_RESPONSE', false);
  return bytes;
}

export class OpenAiSocialImageGenerationAdapter implements SocialImageAssetGenerationProviderPort {
  constructor(
    private readonly options: {
      apiKey: string;
      fetch?: typeof fetch;
      now?: () => number;
    },
  ) {
    if (!options.apiKey.trim())
      throw new ApplicationError('CONFIGURATION_ERROR', 'OpenAI APIキーが設定されていません');
  }

  async generate(input: Parameters<SocialImageAssetGenerationProviderPort['generate']>[0]) {
    const prompt = input.prompt.trim();
    if (!prompt || prompt.length > 32_000)
      throw new ApplicationError('VALIDATION_ERROR', '画像生成指示が不正です');
    if (!MODEL.test(input.model) || !QUALITIES.has(input.quality))
      throw new ApplicationError('CONFIGURATION_ERROR', '画像生成モデルの設定が不正です');
    if (input.width !== 1080 || input.height !== 1350)
      throw new ApplicationError('VALIDATION_ERROR', '画像生成サイズが不正です');

    const now = this.options.now ?? Date.now;
    const started = now();
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: input.model,
          prompt,
          n: 1,
          size: '1024x1536',
          quality: input.quality,
          output_format: 'png',
          moderation: 'auto',
          user: input.requestId,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new OpenAiSocialImageProviderError('PROVIDER_UNAVAILABLE', true);
    }
    let value: ImageResponse;
    try {
      value = (await response.json()) as ImageResponse;
    } catch {
      throw new OpenAiSocialImageProviderError('INVALID_RESPONSE', response.status >= 500);
    }
    if (!response.ok) throw failure(response.status, value);
    return {
      bytes: imageBytes(value),
      mimeType: 'image/png' as const,
      provider: 'OPENAI',
      model: input.model,
      quality: input.quality,
      inputTokens: value.usage?.input_tokens ?? null,
      outputTokens: value.usage?.output_tokens ?? null,
      latencyMs: Math.max(0, now() - started),
    };
  }
}
