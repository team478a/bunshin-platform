import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  INSTAGRAM_LOGIN_SCOPES,
  InstagramLoginAdapter,
  InstagramLoginError,
} from '../src/providers/instagram-login';

const configuration = {
  appId: '990602627938098',
  appSecret: 'meta-app-secret-value',
  redirectUri: 'https://app.example.com/oauth/instagram/callback',
  graphApiVersion: 'v26.0',
};
const state = 'state-value-with-at-least-32-bytes-1234567890';
const code = 'one-time-instagram-code';
const shortToken = 'short-instagram-token';
const longToken = 'long-instagram-token';
const refreshedToken = 'refreshed-instagram-token';
const userId = '17841400000000001';
const now = new Date('2026-11-04T00:00:00.000Z');

describe('Instagram Login official OAuth adapter', () => {
  it('builds a fixed-host authorization URL with the required initial scopes and state', () => {
    const url = new URL(new InstagramLoginAdapter(configuration).authorizationUrl(state));
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe(configuration.appId);
    expect(url.searchParams.get('redirect_uri')).toBe(configuration.redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe(INSTAGRAM_LOGIN_SCOPES.join(','));
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.toString()).not.toContain(configuration.appSecret);
  });

  it('exchanges code, upgrades to a long-lived token and verifies the Instagram profile', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              access_token: shortToken,
              user_id: userId,
              permissions: INSTAGRAM_LOGIN_SCOPES.join(','),
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ access_token: longToken, token_type: 'bearer', expires_in: 5_183_944 }),
      )
      .mockResolvedValueOnce(Response.json({ user_id: userId, username: 'official.account' }));
    const result = await new InstagramLoginAdapter(configuration, request, () => now).exchangeCode({
      code,
    });

    expect(result).toEqual({
      platform: 'INSTAGRAM',
      externalAccountId: userId,
      displayName: 'official.account',
      scopes: [...INSTAGRAM_LOGIN_SCOPES].sort(),
      accessToken: longToken,
      tokenExpiresAt: new Date(now.getTime() + 5_183_944_000),
    });
    expect(request).toHaveBeenCalledTimes(3);
    const [shortUrl, shortInit] = request.mock.calls[0] as [string, RequestInit];
    expect(shortUrl).toBe('https://api.instagram.com/oauth/access_token');
    expect(shortInit.method).toBe('POST');
    expect(shortInit.body).toBeInstanceOf(FormData);
    const form = shortInit.body as FormData;
    expect(form.get('client_id')).toBe(configuration.appId);
    expect(form.get('client_secret')).toBe(configuration.appSecret);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('redirect_uri')).toBe(configuration.redirectUri);
    expect(form.get('code')).toBe(code);

    const [longUrl, longInit] = request.mock.calls[1] as [string, RequestInit];
    expect(new URL(longUrl).origin + new URL(longUrl).pathname).toBe(
      'https://graph.instagram.com/access_token',
    );
    expect(new URL(longUrl).searchParams.get('grant_type')).toBe('ig_exchange_token');
    expect(new URL(longUrl).searchParams.get('access_token')).toBe(shortToken);
    expect(longInit).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' });

    const [profileUrl] = request.mock.calls[2] as [string, RequestInit];
    expect(new URL(profileUrl).origin + new URL(profileUrl).pathname).toBe(
      'https://graph.instagram.com/v26.0/me',
    );
    expect(new URL(profileUrl).searchParams.get('fields')).toBe('user_id,username');
    expect(new URL(profileUrl).searchParams.get('access_token')).toBe(longToken);
  });

  it('refreshes an eligible long-lived token using the official refresh grant', async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        access_token: refreshedToken,
        token_type: 'bearer',
        expires_in: 5_184_000,
      }),
    );
    await expect(
      new InstagramLoginAdapter(configuration, request, () => now).refreshLongLivedToken({
        accessToken: longToken,
      }),
    ).resolves.toEqual({
      accessToken: refreshedToken,
      tokenExpiresAt: new Date(now.getTime() + 5_184_000_000),
    });
    const url = new URL(request.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe('https://graph.instagram.com/refresh_access_token');
    expect(url.searchParams.get('grant_type')).toBe('ig_refresh_token');
    expect(url.searchParams.get('access_token')).toBe(longToken);
  });

  it('rejects missing publish scope before long-token exchange', async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            access_token: shortToken,
            user_id: userId,
            permissions: 'instagram_business_basic',
          },
        ],
      }),
    );
    await expect(
      new InstagramLoginAdapter(configuration, request).exchangeCode({ code }),
    ).rejects.toMatchObject({ category: 'PERMISSION', retryable: false });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, 'AUTHENTICATION', false],
    [401, 'AUTHENTICATION', false],
    [403, 'PERMISSION', false],
    [429, 'RATE_LIMIT', true],
    [502, 'PROVIDER_ERROR', true],
  ] as const)(
    'classifies provider status %s without exposing provider details',
    async (status, category, retryable) => {
      const request = vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { message: `secret:${shortToken}` } }, { status }),
        );
      let error: unknown;
      try {
        await new InstagramLoginAdapter(configuration, request).exchangeCode({ code });
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({ category, retryable, status });
      expect(String(error)).not.toContain(shortToken);
      expect(JSON.stringify(error)).not.toContain(shortToken);
    },
  );

  it('does not retry a single-use code after a transport failure', async () => {
    const request = vi
      .fn()
      .mockRejectedValue(new Error(`network:${code}:${configuration.appSecret}`));
    await expect(
      new InstagramLoginAdapter(configuration, request).exchangeCode({ code }),
    ).rejects.toMatchObject({ category: 'TRANSPORT', retryable: true });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed state, code, configuration and provider responses', async () => {
    const adapter = new InstagramLoginAdapter(configuration, vi.fn());
    expect(() => adapter.authorizationUrl('short')).toThrow(InstagramLoginError);
    await expect(adapter.exchangeCode({ code: 'bad code' })).rejects.toMatchObject({
      category: 'INVALID_INPUT',
    });
    expect(
      () =>
        new InstagramLoginAdapter({ ...configuration, graphApiVersion: 'https://evil.example' }),
    ).toThrow('Instagram Login is not configured');

    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              access_token: shortToken,
              user_id: userId,
              permissions: INSTAGRAM_LOGIN_SCOPES.join(','),
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ access_token: longToken, token_type: 'bearer', expires_in: 5_184_000 }),
      )
      .mockResolvedValueOnce(Response.json({ user_id: '17841400000000002', username: 'other' }));
    await expect(
      new InstagramLoginAdapter(configuration, request).exchangeCode({ code }),
    ).rejects.toMatchObject({ category: 'INVALID_RESPONSE' });
  });
});
