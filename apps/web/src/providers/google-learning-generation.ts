import 'server-only';
import type {
  LearningAiGenerationPort,
  LearningAiRequest,
  LearningAiResult,
} from '@bunshin/application';
import { assertLearningProviderCapabilities } from './learning-provider-capabilities';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asToken(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function toGoogleRequest(request: LearningAiRequest) {
  let body: unknown;
  try {
    body = JSON.parse(request.serializedPrompt);
  } catch {
    throw new Error('learning request unavailable');
  }
  if (!object(body) || !Array.isArray(body.input) || !object(body.text))
    throw new Error('learning request unavailable');
  const format = body.text['format'];
  if (!object(format) || format['type'] !== 'json_schema' || !object(format['schema']))
    throw new Error('learning request unavailable');
  assertLearningProviderCapabilities(request);
  const system = body.input
    .filter((item): item is Record<string, unknown> => object(item) && item['role'] === 'system')
    .map((item) => item['content'])
    .filter((content): content is string => typeof content === 'string');
  const contents = body.input
    .filter((item): item is Record<string, unknown> => object(item) && item['role'] === 'user')
    .map((item) => {
      const content = item['content'];
      const parts = typeof content === 'string' ? [{ type: 'input_text', text: content }] : content;
      if (!Array.isArray(parts)) throw new Error('learning request unavailable');
      return {
        role: 'user',
        parts: parts.map((part) => {
          if (!object(part)) throw new Error('learning request unavailable');
          if (part['type'] === 'input_text' && typeof part['text'] === 'string')
            return { text: part['text'] };
          if (part['type'] === 'input_image' && typeof part['image_url'] === 'string') {
            const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(
              part['image_url'],
            );
            if (!match) throw new Error('learning request unavailable');
            return { inlineData: { mimeType: match[1], data: match[2] } };
          }
          throw new Error('learning request unavailable');
        }),
      };
    });
  if (contents.length === 0) throw new Error('learning request unavailable');
  return {
    systemInstruction: { parts: system.map((text) => ({ text })) },
    contents,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: format['schema'],
      maxOutputTokens:
        typeof body['max_output_tokens'] === 'number' ? body['max_output_tokens'] : undefined,
      candidateCount: 1,
    },
  };
}

export class GoogleLearningGenerationAdapter implements LearningAiGenerationPort {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async generate<T>(
    request: LearningAiRequest,
    validate: (value: unknown) => T,
    credentials: { apiKey: string },
  ): Promise<LearningAiResult<T>> {
    const payload = toGoogleRequest(request);
    const start = Date.now();
    const response = await this.fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': credentials.apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45_000),
      },
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error('learning response unavailable');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 128_000) {
          await reader.cancel();
          throw new Error('learning response limit exceeded');
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let raw: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (object(parsed)) raw = parsed;
    } catch {
      // Invalid provider output is recorded as a failed measured attempt below.
    }
    const candidates = Array.isArray(raw['candidates']) ? raw['candidates'] : [];
    const first = object(candidates[0]) ? candidates[0] : null;
    const content = first && object(first['content']) ? first['content'] : null;
    const parts = content && Array.isArray(content['parts']) ? content['parts'] : [];
    const text = parts
      .filter(
        (part): part is Record<string, unknown> => object(part) && typeof part['text'] === 'string',
      )
      .map((part) => part['text'] as string)
      .join('');
    const usage = object(raw['usageMetadata']) ? raw['usageMetadata'] : {};
    let value: T | null = null;
    try {
      if (response.ok && text) value = validate(JSON.parse(text));
    } catch {
      value = null;
    }
    const measurement = {
      provider: 'google',
      model: typeof raw['modelVersion'] === 'string' ? raw['modelVersion'] : request.model,
      inputTokens: asToken(usage['promptTokenCount']),
      outputTokens: asToken(usage['candidatesTokenCount']),
      cachedInputTokens: asToken(usage['cachedContentTokenCount']) ?? 0,
      latencyMs: Math.min(2_147_483_647, Date.now() - start),
      success: value !== null,
      errorCategory: value
        ? null
        : response.status === 429
          ? 'RATE_LIMIT'
          : response.ok
            ? 'INVALID_RESPONSE'
            : 'PROVIDER_ERROR',
      validationResult: value ? 'PASSED' : response.ok ? 'FAILED' : 'NOT_RUN',
      fallbackUsed: false,
      occurredAt: new Date(start).toISOString(),
    } as const;
    return { value, measurement, requestFinished: true };
  }
}
