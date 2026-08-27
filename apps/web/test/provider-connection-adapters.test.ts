import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiProviderConnectionTestAdapter } from '../src/ai/secure-provider-configuration';
import { LineConnectionTestAdapter } from '../src/line/secure-configuration';

afterEach(() => vi.unstubAllGlobals());

describe('外部サービス接続確認', () => {
  it('OpenAIの認証エラーを固定分類する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(
      new AiProviderConnectionTestAdapter().validate({
        provider: 'OPENAI',
        apiKey: 'secret-value',
        model: 'gpt-5-mini',
      }),
    ).resolves.toEqual({ success: false, errorCategory: 'CREDENTIAL_INVALID' });
  });

  it('Creatomateは動画を生成せずテンプレート一覧で接続確認する', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      new AiProviderConnectionTestAdapter().validate({
        provider: 'CREATOMATE',
        apiKey: 'creatomate-secret',
        model: null,
      }),
    ).resolves.toEqual({ success: true, errorCategory: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.creatomate.com/v2/templates',
      expect.objectContaining({ headers: { authorization: 'Bearer creatomate-secret' } }),
    );
  });

  it('LINE Access TokenとMessaging Channel IDの不一致を拒否する', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"invalid_grant"}', { status: 400 }))
      .mockResolvedValueOnce(Response.json({ displayName: 'BUNSHIN公式', basicId: '@bunshin' }))
      .mockResolvedValueOnce(Response.json({ client_id: 'different-channel' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new LineConnectionTestAdapter().validate({
        loginChannelId: 'login-channel',
        loginChannelSecret: 'login-secret',
        messagingChannelId: 'expected-channel',
        messagingChannelSecret: 'messaging-secret',
        channelAccessToken: 'access-token',
        callbackUrl: 'https://example.com/callback',
      }),
    ).resolves.toEqual({
      success: false,
      errorCategory: 'MESSAGING_CHANNEL_MISMATCH',
      botDisplayName: null,
    });
  });

  it('LINE Loginの認証情報不一致を拒否する', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"invalid_client"}', { status: 400 }))
      .mockResolvedValueOnce(Response.json({ displayName: 'BUNSHIN公式' }))
      .mockResolvedValueOnce(Response.json({ client_id: 'messaging-channel' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new LineConnectionTestAdapter().validate({
      loginChannelId: 'login-channel',
      loginChannelSecret: 'wrong-secret',
      messagingChannelId: 'messaging-channel',
      messagingChannelSecret: 'messaging-secret',
      channelAccessToken: 'access-token',
      callbackUrl: 'https://example.com/callback',
    });
    expect(result.errorCategory).toBe('LOGIN_CREDENTIAL_INVALID');
  });
});
