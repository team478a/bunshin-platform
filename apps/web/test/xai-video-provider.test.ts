import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  XaiVideoAdapter,
  XaiVideoProviderError,
  classifyXaiVideoStatus,
} from '../src/providers/xai-video';

const requestId = '41eb9a5f-cbd4-9f21-8d59-79005f1e61b7';

describe('xAI video provider', () => {
  it('submits text-to-video without a source image', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ request_id: requestId }));
    const result = await new XaiVideoAdapter('xai-secret', request).submit({
      generationId: 'generation-1',
      model: 'grok-imagine-video-1.5',
      prompt: '朝のカフェを縦型動画で映す',
      durationSeconds: 5,
      referenceImageUrls: [],
    });

    expect(result).toEqual({ externalJobId: requestId });
    expect(request).toHaveBeenCalledWith(
      'https://api.x.ai/v1/videos/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer xai-secret' }),
      }),
    );
    const init = request.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(typeof init.body === 'string' ? init.body : '') as unknown;
    expect(body).toEqual({
      model: 'grok-imagine-video-1.5',
      prompt: '朝のカフェを縦型動画で映す',
      duration: 5,
      resolution: '720p',
      aspect_ratio: '9:16',
    });
  });

  it('uses the first private reference URL for image-to-video', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ request_id: requestId }));
    await new XaiVideoAdapter('xai-secret', request).submit({
      generationId: 'generation-1',
      model: 'grok-imagine-video-1.5-lite',
      prompt: '商品をゆっくり回転させる',
      durationSeconds: 10,
      referenceImageUrls: [
        'https://signed.example.com/product.png',
        'https://signed.example.com/unused.png',
      ],
    });

    const init = request.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(typeof init.body === 'string' ? init.body : '') as Record<
      string,
      unknown
    >;
    expect(body.image).toEqual({ url: 'https://signed.example.com/product.png' });
    expect(body).not.toHaveProperty('aspect_ratio');
  });

  it('maps asynchronous progress and records the exact billed cost', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: 'processing', progress: 40 }))
      .mockResolvedValueOnce(
        Response.json({
          status: 'done',
          video: { url: 'https://vidgen.x.ai/xai-vidgen-bucket/result.mp4' },
          usage: { cost_in_usd_ticks: 500_000_000 },
        }),
      );
    const adapter = new XaiVideoAdapter('xai-secret', request);

    await expect(
      adapter.inspect({ model: 'grok-imagine-video-1.5', externalJobId: requestId }),
    ).resolves.toEqual({ status: 'GENERATING' });
    await expect(
      adapter.inspect({ model: 'grok-imagine-video-1.5', externalJobId: requestId }),
    ).resolves.toEqual({
      status: 'SUCCEEDED',
      outputUrl: 'https://vidgen.x.ai/xai-vidgen-bucket/result.mp4',
      actualCostUsdMicros: 50_000,
    });
  });

  it('rejects untrusted output hosts and classifies provider failures', async () => {
    const adapter = new XaiVideoAdapter(
      'xai-secret',
      vi.fn().mockResolvedValue(
        Response.json({
          status: 'done',
          video: { url: 'https://example.com/result.mp4' },
          usage: { cost_in_usd_ticks: 500_000_000 },
        }),
      ),
    );
    await expect(
      adapter.inspect({ model: 'grok-imagine-video-1.5', externalJobId: requestId }),
    ).rejects.toMatchObject({ category: 'INVALID_RESPONSE' });
    expect(classifyXaiVideoStatus(401)).toMatchObject({
      category: 'AUTHENTICATION',
      retryable: false,
    });
    expect(classifyXaiVideoStatus(429)).toMatchObject({ category: 'RATE_LIMIT', retryable: true });
    expect(classifyXaiVideoStatus(503)).toMatchObject({
      category: 'PROVIDER_ERROR',
      retryable: true,
    });
    expect(classifyXaiVideoStatus(400)).toBeInstanceOf(XaiVideoProviderError);
  });
});
