import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  RunwayVideoAdapter,
  RunwayVideoProviderError,
  classifyRunwayStatus,
} from '../src/providers/runway-video';

const taskId = '11111111-1111-4111-8111-111111111111';

describe('Runway video provider', () => {
  it('submits a vertical image-to-video task without exposing the API key in the body', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ id: taskId }));
    const result = await new RunwayVideoAdapter('runway-secret', request).submit({
      generationId: 'generation-1',
      model: 'gen4_turbo',
      prompt: 'やさしくカメラへ近づく',
      durationSeconds: 5,
      referenceImageUrls: ['https://signed.example.com/reference.png'],
    });

    expect(result).toEqual({ externalJobId: taskId });
    expect(request).toHaveBeenCalledWith(
      'https://api.dev.runwayml.com/v1/image_to_video',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer runway-secret',
          'X-Runway-Version': '2024-11-06',
        }),
      }),
    );
    const init = request.mock.calls[0]![1] as RequestInit;
    expect(typeof init.body).toBe('string');
    const requestBody = typeof init.body === 'string' ? init.body : '';
    expect(JSON.parse(requestBody) as unknown).toEqual({
      model: 'gen4_turbo',
      promptImage: 'https://signed.example.com/reference.png',
      promptText: 'やさしくカメラへ近づく',
      ratio: '720:1280',
      duration: 5,
    });
    expect(requestBody).not.toContain('runway-secret');
  });

  it('maps task progress and returns a validated completed video URL', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: taskId, status: 'RUNNING' }))
      .mockResolvedValueOnce(
        Response.json({
          id: taskId,
          status: 'SUCCEEDED',
          output: ['https://dnznrvs05pmza.cloudfront.net/result.mp4'],
        }),
      );
    const adapter = new RunwayVideoAdapter('runway-secret', request);
    await expect(adapter.inspect({ model: 'gen4.5', externalJobId: taskId })).resolves.toEqual({
      status: 'GENERATING',
    });
    await expect(adapter.inspect({ model: 'gen4.5', externalJobId: taskId })).resolves.toEqual({
      status: 'SUCCEEDED',
      outputUrl: 'https://dnznrvs05pmza.cloudfront.net/result.mp4',
    });
  });

  it('rejects unknown models and untrusted output hosts', async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        id: taskId,
        status: 'SUCCEEDED',
        output: ['https://example.com/video.mp4'],
      }),
    );
    const adapter = new RunwayVideoAdapter('runway-secret', request);
    await expect(
      adapter.submit({
        generationId: 'generation-1',
        model: 'retired-model',
        prompt: 'test',
        durationSeconds: 5,
        referenceImageUrls: ['https://signed.example.com/reference.png'],
      }),
    ).rejects.toMatchObject({ category: 'INVALID_REQUEST' });
    await expect(adapter.inspect({ model: 'gen4.5', externalJobId: taskId })).rejects.toMatchObject(
      {
        category: 'INVALID_RESPONSE',
      },
    );
  });

  it('classifies provider failures for retry policy', () => {
    expect(classifyRunwayStatus(401)).toMatchObject({
      category: 'AUTHENTICATION',
      retryable: false,
    });
    expect(classifyRunwayStatus(429)).toMatchObject({ category: 'RATE_LIMIT', retryable: true });
    expect(classifyRunwayStatus(503)).toMatchObject({
      category: 'PROVIDER_ERROR',
      retryable: true,
    });
    expect(classifyRunwayStatus(400)).toBeInstanceOf(RunwayVideoProviderError);
  });
});
