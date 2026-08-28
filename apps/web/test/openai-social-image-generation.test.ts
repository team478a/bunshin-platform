import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  OpenAiSocialImageGenerationAdapter,
  OpenAiSocialImageProviderError,
} from '../src/providers/openai-social-image-generation';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const input = {
  requestId: '11111111-1111-4111-8111-111111111111',
  prompt: '人物を含まない、明るい仕事机の背景素材',
  width: 1080 as const,
  height: 1350 as const,
  model: 'gpt-image-1',
  quality: 'medium',
};

describe('OpenAI social image generation adapter', () => {
  it('requests one moderated PNG without storing provider data', async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        data: [{ b64_json: Buffer.from(png).toString('base64') }],
        usage: { input_tokens: 12, output_tokens: 34 },
      }),
    );
    const times = [100, 175];
    const result = await new OpenAiSocialImageGenerationAdapter({
      apiKey: 'secret-key',
      fetch: request,
      now: () => times.shift()!,
    }).generate(input);
    expect(result).toMatchObject({
      bytes: png,
      mimeType: 'image/png',
      provider: 'OPENAI',
      model: 'gpt-image-1',
      quality: 'medium',
      inputTokens: 12,
      outputTokens: 34,
      latencyMs: 75,
    });
    const [, options] = request.mock.calls[0]!;
    const body = JSON.parse(String(options.body));
    expect(body).toMatchObject({
      model: 'gpt-image-1',
      n: 1,
      size: '1024x1536',
      quality: 'medium',
      output_format: 'png',
      moderation: 'auto',
      user: input.requestId,
    });
    expect(options.headers.authorization).toBe('Bearer secret-key');
  });

  it.each([
    [401, {}, 'AUTHENTICATION', false],
    [429, {}, 'RATE_LIMIT', true],
    [400, { error: { code: 'content_policy_violation' } }, 'CONTENT_POLICY', false],
    [503, {}, 'PROVIDER_UNAVAILABLE', true],
  ])(
    'classifies status %s without exposing provider response',
    async (status, body, category, retryable) => {
      const adapter = new OpenAiSocialImageGenerationAdapter({
        apiKey: 'secret-key',
        fetch: vi.fn().mockResolvedValue(Response.json(body, { status })),
      });
      const error = await adapter.generate(input).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(OpenAiSocialImageProviderError);
      expect(error).toMatchObject({ category, retryable });
    },
  );

  it('rejects malformed base64 or a non-PNG response', async () => {
    const adapter = new OpenAiSocialImageGenerationAdapter({
      apiKey: 'secret-key',
      fetch: vi.fn().mockResolvedValue(Response.json({ data: [{ b64_json: 'bm90LXBuZw==' }] })),
    });
    await expect(adapter.generate(input)).rejects.toMatchObject({
      category: 'INVALID_RESPONSE',
      retryable: false,
    });
  });

  it('rejects an unapproved model, quality or output dimensions before the request', async () => {
    const request = vi.fn();
    const adapter = new OpenAiSocialImageGenerationAdapter({
      apiKey: 'secret-key',
      fetch: request,
    });
    await expect(adapter.generate({ ...input, quality: 'ultra' })).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
    });
    await expect(adapter.generate({ ...input, width: 1024 as never })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(request).not.toHaveBeenCalled();
  });
});
