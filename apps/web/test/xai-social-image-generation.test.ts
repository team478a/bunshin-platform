import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  XaiSocialImageGenerationAdapter,
  XaiSocialImageProviderError,
} from '../src/providers/xai-social-image-generation';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const input = {
  requestId: '11111111-1111-4111-8111-111111111111',
  prompt: '人物を含まない、明るい仕事机の背景素材',
  width: 1080 as const,
  height: 1350 as const,
  model: 'grok-imagine-image-2.0',
  quality: 'high',
};

describe('xAI social image generation adapter', () => {
  it('requests a 3:4 base64 image and normalizes it to PNG', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: [{ b64_json: png.toString('base64'), mime_type: 'image/png' }] }),
      );
    const times = [100, 175];
    const result = await new XaiSocialImageGenerationAdapter({
      apiKey: 'secret-key',
      fetch: request,
      now: () => times.shift()!,
    }).generate(input);

    expect(result).toMatchObject({
      mimeType: 'image/png',
      provider: 'XAI',
      model: input.model,
      quality: 'medium',
      inputTokens: null,
      outputTokens: null,
      latencyMs: 75,
    });
    expect(result.bytes.length).toBeGreaterThan(0);
    const [url, options] = request.mock.calls[0]!;
    expect(url).toBe('https://api.x.ai/v1/images/generations');
    expect(options.headers.authorization).toBe('Bearer secret-key');
    expect(JSON.parse(String(options.body))).toEqual({
      model: input.model,
      prompt: input.prompt,
      n: 1,
      aspect_ratio: '3:4',
      resolution: '1k',
      quality: 'medium',
      response_format: 'b64_json',
    });
  });

  it('uses the JSON image edit contract for a reference image', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(Response.json({ data: [{ b64_json: png.toString('base64') }] }));
    await new XaiSocialImageGenerationAdapter({ apiKey: 'test', fetch: request }).generate({
      ...input,
      referenceImage: new Uint8Array(png),
    });
    const [url, options] = request.mock.calls[0]!;
    expect(url).toBe('https://api.x.ai/v1/images/edits');
    const body = JSON.parse(String(options.body));
    expect(body.image).toEqual({
      type: 'image_url',
      url: `data:image/png;base64,${png.toString('base64')}`,
    });
  });

  it.each([
    [401, {}, 'AUTHENTICATION', false],
    [429, {}, 'RATE_LIMIT', true],
    [400, { error: { code: 'content_policy_violation' } }, 'CONTENT_POLICY', false],
    [503, {}, 'PROVIDER_UNAVAILABLE', true],
  ])(
    'classifies status %s without exposing provider response',
    async (status, body, category, retryable) => {
      const adapter = new XaiSocialImageGenerationAdapter({
        apiKey: 'secret-key',
        fetch: vi.fn().mockResolvedValue(Response.json(body, { status })),
      });
      const error = await adapter.generate(input).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(XaiSocialImageProviderError);
      expect(error).toMatchObject({ category, retryable });
    },
  );

  it('rejects malformed image data and invalid dimensions', async () => {
    const adapter = new XaiSocialImageGenerationAdapter({
      apiKey: 'secret-key',
      fetch: vi.fn().mockResolvedValue(Response.json({ data: [{ b64_json: 'bm90LWltYWdl' }] })),
    });
    await expect(adapter.generate(input)).rejects.toMatchObject({
      category: 'INVALID_RESPONSE',
      retryable: false,
    });
    await expect(adapter.generate({ ...input, width: 1024 as never })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(adapter.generate({ ...input, quality: 'ultra' })).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
    });
  });

  it('classifies an empty authentication response by status', async () => {
    const adapter = new XaiSocialImageGenerationAdapter({
      apiKey: 'secret-key',
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    });
    await expect(adapter.generate(input)).rejects.toMatchObject({
      category: 'AUTHENTICATION',
      retryable: false,
    });
  });
});
