import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { LineMessagingApiAdapter } from '../src/line/messaging-provider';

describe('LINE Messaging API adapter', () => {
  it('sends a Japanese badge award message without exposing secrets', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(
      new LineMessagingApiAdapter(request).pushBadgeNotification({
        accessToken: 'secret-token',
        recipientId: 'line-user-1',
        badgeUrl: 'https://watashi-works.example/badges',
        title: 'はじめの一歩',
        description: '初めての行動を達成しました。',
      }),
    ).resolves.toEqual({ ok: true });
    const requestBody = request.mock.calls[0]?.[1]?.body;
    expect(typeof requestBody).toBe('string');
    const body = JSON.parse(requestBody as string) as {
      messages: Array<{ text: string }>;
    };
    expect(body.messages[0]?.text).toContain('新しいバッジを獲得しました！');
    expect(body.messages[0]?.text).toContain('https://watashi-works.example/badges');
    expect(body.messages[0]?.text).not.toContain('secret-token');
  });

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
        summary: {
          platform: 'INSTAGRAM',
          format: 'SLIDE',
          estimatedMinutes: 5,
          topic: '朝の時間を上手に使うコツ',
          researched: true,
          externalLinkIncluded: true,
        },
        kind: 'DAILY_MISSION',
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
          text: '今日やることができました。\nSNS：インスタグラム\n作るもの：スライド投稿\n目安：5分\nテーマ：朝の時間を上手に使うコツ\n新しい情報も参考にした企画です。\nあなた専用の紹介URLを入れました。URLは確認画面で安全に表示します。\n画像は確認画面で作れます。\nこのお知らせを開いただけでは画像づくりは始まりません。\n\nくわしく見る\nhttps://app.example.com/today?state=opaque',
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('Knowledge');
    expect(JSON.stringify(body)).not.toContain('投稿本文');
    expect(JSON.stringify(body)).not.toContain('動画生成プロンプト');
    expect(JSON.stringify(body)).not.toContain('Memory');
    expect(JSON.stringify(body)).not.toContain('ref=');
  });

  it('removes line breaks and limits the short topic before sending', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await new LineMessagingApiAdapter(request).pushMissionNotification({
      accessToken: 'access-token',
      recipientId: 'provider-user-a',
      deepLinkUrl: 'https://app.example.com/today?state=opaque',
      summary: {
        platform: 'X',
        format: 'TEXT',
        estimatedMinutes: 3,
        topic: `${'安全なテーマ'.repeat(20)}\n投稿本文：送ってはいけない`,
        researched: false,
      },
      kind: 'DAILY_MISSION',
    });
    const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string) as {
      messages: Array<{ text: string }>;
    };
    expect(body.messages[0]?.text).not.toContain('\n投稿本文');
    expect(body.messages[0]?.text).not.toContain('送ってはいけない');
    expect(body.messages[0]?.text).toContain('SNS：X');
  });

  it('sends the daily growth action instead of describing every day as a post', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await new LineMessagingApiAdapter(request).pushMissionNotification({
      accessToken: 'access-token',
      recipientId: 'provider-user-a',
      deepLinkUrl: 'https://app.example.com/today?state=opaque',
      summary: {
        platform: 'INSTAGRAM',
        format: 'TEXT',
        estimatedMinutes: 5,
        topic: '秋の新商品',
        researched: false,
        businessAction: {
          kind: 'PHOTO',
          label: '写真をためる日',
          title: '秋の新商品に使える写真を1枚撮る',
          reason: '投稿の日に慌てないためです。',
          steps: ['商品を選ぶ', '明るい場所で撮る', '個人情報がないか確認する'],
          postContentIsPrimary: false,
          program: {
            cycleNumber: 1,
            day: 18,
            phaseKey: 'START_POSTING',
            phaseLabel: '投稿を始める',
          },
        },
      },
      kind: 'DAILY_MISSION',
    });
    const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string) as {
      messages: Array<{ text: string }>;
    };
    expect(body.messages[0]?.text).toContain('今日の種類：写真をためる日');
    expect(body.messages[0]?.text).toContain('90日計画：第1期・18日目（投稿を始める）');
    expect(body.messages[0]?.text).toContain('やること：秋の新商品に使える写真を1枚撮る');
    expect(body.messages[0]?.text).not.toContain('作るもの：文章の投稿');
  });

  it('sends a review image before the Mission summary when one is ready', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await new LineMessagingApiAdapter(request).pushMissionNotification({
      accessToken: 'access-token',
      recipientId: 'provider-user-a',
      deepLinkUrl: 'https://app.example.com/today?state=opaque',
      image: {
        originalContentUrl: 'https://storage.example.com/completed.png?token=one',
        previewImageUrl: 'https://storage.example.com/thumbnail.png?token=two',
      },
      summary: {
        platform: 'INSTAGRAM',
        format: 'IMAGE',
        estimatedMinutes: 5,
        topic: '今日のテーマ',
        researched: false,
      },
      kind: 'DAILY_MISSION',
    });
    const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string) as {
      messages: Array<Record<string, string>>;
    };
    expect(body.messages[0]).toEqual({
      type: 'image',
      originalContentUrl: 'https://storage.example.com/completed.png?token=one',
      previewImageUrl: 'https://storage.example.com/thumbnail.png?token=two',
    });
    expect(body.messages[1]?.text).toContain('確認用の画像も用意しました');
    expect(body.messages[1]?.text).not.toContain('画像づくりは始まりません');
  });

  it('uses a gentle return message for a low-priority reminder', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await new LineMessagingApiAdapter(request).pushMissionNotification({
      accessToken: 'access-token',
      recipientId: 'provider-user-a',
      deepLinkUrl: 'https://app.example.com/today?state=opaque',
      summary: {
        platform: 'X',
        format: 'TEXT',
        estimatedMinutes: 3,
        topic: '短いテーマ',
        researched: false,
      },
      kind: 'REMINDER',
    });
    const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string) as {
      messages: Array<{ text: string }>;
    };
    expect(body.messages[0]?.text).toContain('今日は内容を見るだけでも大丈夫です');
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
          summary: {
            platform: 'X',
            format: 'TEXT',
            estimatedMinutes: 3,
            topic: '短いテーマ',
            researched: false,
          },
          kind: 'DAILY_MISSION',
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

  it('uses a stable retry key for broadcast text and accepts LINE duplicate acknowledgement', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 409,
        headers: { 'x-line-accepted-request-id': 'accepted-request' },
      }),
    );
    const retryKey = '11111111-1111-4111-8111-111111111111';

    await expect(
      new LineMessagingApiAdapter(request).pushText({
        accessToken: 'access-token',
        recipientId: 'provider-user-a',
        text: '本文',
        retryKey,
      }),
    ).resolves.toEqual({ ok: true });
    expect(request.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({ 'X-Line-Retry-Key': retryKey }),
    );
  });
});
