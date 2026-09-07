import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { LineMessagingApiAdapter } from '../src/line/messaging-provider';

const input = {
  accessToken: 'test-token',
  recipientId: 'recipient',
  projectTitle: 'Video',
  reviewUrl: 'https://example.com/video',
  retryKey: '11111111-1111-4111-8111-111111111111',
};

describe('video completion retries', () => {
  it('reuses the same key and payload after a timeout and accepts confirmed duplicates', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 409,
          headers: { 'x-line-accepted-request-id': 'accepted-request' },
        }),
      );
    const adapter = new LineMessagingApiAdapter(request);
    expect((await adapter.pushVideoCompletion(input)).ok).toBe(false);
    expect(await adapter.pushVideoCompletion(input)).toEqual({ ok: true });
    const first = request.mock.calls[0]![1]!;
    const second = request.mock.calls[1]![1]!;
    expect(first.headers).toEqual(expect.objectContaining({ 'X-Line-Retry-Key': input.retryKey }));
    expect(second.headers).toEqual(first.headers);
    expect(second.body).toEqual(first.body);
  });

  it('does not treat an unconfirmed conflict as delivery success', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 409 }));
    expect((await new LineMessagingApiAdapter(request).pushVideoCompletion(input)).ok).toBe(false);
  });

  it('rejects invalid retry keys before contacting LINE', async () => {
    const request = vi.fn<typeof fetch>();
    expect(
      (
        await new LineMessagingApiAdapter(request).pushVideoCompletion({
          ...input,
          retryKey: 'bad',
        })
      ).ok,
    ).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});
