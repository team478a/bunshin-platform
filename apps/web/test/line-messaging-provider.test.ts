import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { LineMessagingApiAdapter } from '../src/line/messaging-provider';

describe('LINE Messaging API adapter', () => {
  it('reads quota without returning raw provider responses', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ type: 'limited', value: 1_000 }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalUsage: 250 }), { status: 200 }));
    await expect(new LineMessagingApiAdapter(request).getQuota('access-token')).resolves.toEqual({
      ok: true,
      limit: 1_000,
      consumption: 250,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[1]?.headers).toEqual({ authorization: 'Bearer access-token' });
  });

  it('sends only a fixed Mission entry message and the supplied short deep link', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(
      new LineMessagingApiAdapter(request).pushMissionNotification({
        accessToken: 'access-token',
        recipientId: 'provider-user-a',
        deepLinkUrl: 'https://app.example.com/today?state=opaque',
      }),
    ).resolves.toEqual({ ok: true });
    const init = request.mock.calls[0]?.[1];
    expect(typeof init?.body).toBe('string');
    const body = JSON.parse(init?.body as string) as {
      to: string;
      messages: Array<{ type: string; text: string }>;
    };
    expect(body).toEqual({
      to: 'provider-user-a',
      messages: [
        {
          type: 'text',
          text: '今日のミッションができました。\nhttps://app.example.com/today?state=opaque',
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('Knowledge');
    expect(JSON.stringify(body)).not.toContain('投稿本文');
  });

  it.each([
    [401, 'CREDENTIAL_INVALID', false],
    [429, 'RATE_LIMITED', true],
    [400, 'INVALID_RECIPIENT', false],
    [503, 'PROVIDER_UNAVAILABLE', true],
  ] as const)(
    'classifies HTTP %s without exposing the response body',
    async (status, category, retryable) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('provider-secret-response', { status }));
      await expect(
        new LineMessagingApiAdapter(request).pushMissionNotification({
          accessToken: 'access-token',
          recipientId: 'provider-user-a',
          deepLinkUrl: 'https://app.example.com/today?state=opaque',
        }),
      ).resolves.toEqual({ ok: false, category, retryable });
    },
  );

  it('classifies timeouts as retryable', async () => {
    const error = new Error('access-token must not escape');
    error.name = 'TimeoutError';
    const request = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(new LineMessagingApiAdapter(request).getQuota('access-token')).resolves.toEqual({
      ok: false,
      category: 'TIMEOUT',
      retryable: true,
    });
  });
});
