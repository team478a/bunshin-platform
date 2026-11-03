import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';

export const INSTAGRAM_LOGIN_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
] as const;

export type InstagramLoginFailure =
  | 'INVALID_INPUT'
  | 'AUTHENTICATION'
  | 'PERMISSION'
  | 'RATE_LIMIT'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'TRANSPORT';

export class InstagramLoginError extends Error {
  constructor(
    public readonly category: InstagramLoginFailure,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super('Instagram Login unavailable');
    this.name = 'InstagramLoginError';
  }
}

export interface InstagramLoginCredential {
  platform: 'INSTAGRAM';
  externalAccountId: string;
  displayName: string;
  scopes: string[];
  accessToken: string;
  tokenExpiresAt: Date;
}

interface InstagramLoginConfiguration {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphApiVersion: string;
}

type Fetch = typeof fetch;
const authorizeEndpoint = 'https://www.instagram.com/oauth/authorize';
const shortTokenEndpoint = 'https://api.instagram.com/oauth/access_token';
const graphOrigin = 'https://graph.instagram.com';
const numericId = /^[0-9]{1,30}$/;
const oauthValue = /^[\x21-\x7e]+$/;
const stateValue = /^[A-Za-z0-9._~-]{32,1024}$/;

function invalid(): never {
  throw new InstagramLoginError('INVALID_INPUT', false);
}

function configurationError(): never {
  throw new ApplicationError('CONFIGURATION_ERROR', 'Instagram Login is not configured');
}

function validOAuthValue(value: string, maximum: number): string {
  if (typeof value !== 'string' || !value || value.length > maximum || !oauthValue.test(value))
    invalid();
  return value;
}

function apiFailure(status: number): InstagramLoginError {
  if (status === 400 || status === 401)
    return new InstagramLoginError('AUTHENTICATION', false, status);
  if (status === 403) return new InstagramLoginError('PERMISSION', false, status);
  if (status === 429) return new InstagramLoginError('RATE_LIMIT', true, status);
  return new InstagramLoginError('PROVIDER_ERROR', status >= 500, status);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InstagramLoginError('INVALID_RESPONSE', false);
  return value as Record<string, unknown>;
}

function accessToken(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 8192 || !oauthValue.test(value))
    throw new InstagramLoginError('INVALID_RESPONSE', false);
  return value;
}

function expiration(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 366 * 86400)
    throw new InstagramLoginError('INVALID_RESPONSE', false);
  return value as number;
}

function tokenExpiration(now: Date, expiresIn: number): Date {
  const expiresAt = new Date(now.getTime() + expiresIn * 1000);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(expiresAt.getTime()))
    throw new InstagramLoginError('INVALID_RESPONSE', false);
  return expiresAt;
}

/**
 * Official Instagram Login transport only. OAuth transaction persistence,
 * callback state consumption, owner authorization and credential persistence
 * remain in the calling use case.
 */
export class InstagramLoginAdapter {
  private readonly profileEndpoint: string;

  constructor(
    private readonly configuration: InstagramLoginConfiguration,
    private readonly request: Fetch = fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {
    if (!/^[0-9]{5,30}$/.test(configuration.appId)) configurationError();
    if (
      !configuration.appSecret ||
      configuration.appSecret.length < 16 ||
      configuration.appSecret.length > 256 ||
      !oauthValue.test(configuration.appSecret) ||
      !/^v[1-9][0-9]?\.0$/.test(configuration.graphApiVersion)
    )
      configurationError();
    let redirect: URL;
    try {
      redirect = new URL(configuration.redirectUri);
    } catch {
      configurationError();
    }
    if (
      (redirect.protocol !== 'https:' &&
        !(
          redirect.protocol === 'http:' &&
          (redirect.hostname === 'localhost' || redirect.hostname === '127.0.0.1')
        )) ||
      redirect.username ||
      redirect.password ||
      redirect.hash
    )
      configurationError();
    this.profileEndpoint = `${graphOrigin}/${configuration.graphApiVersion}/me`;
  }

  authorizationUrl(state: string): string {
    if (!stateValue.test(state)) invalid();
    const url = new URL(authorizeEndpoint);
    url.search = new URLSearchParams({
      client_id: this.configuration.appId,
      redirect_uri: this.configuration.redirectUri,
      response_type: 'code',
      scope: INSTAGRAM_LOGIN_SCOPES.join(','),
      state,
    }).toString();
    return url.toString();
  }

  async exchangeCode(input: {
    code: string;
    signal?: AbortSignal;
  }): Promise<InstagramLoginCredential> {
    const code = validOAuthValue(input.code, 4096);
    const form = new FormData();
    form.set('client_id', this.configuration.appId);
    form.set('client_secret', this.configuration.appSecret);
    form.set('grant_type', 'authorization_code');
    form.set('redirect_uri', this.configuration.redirectUri);
    form.set('code', code);
    const short = object(
      await this.send(shortTokenEndpoint, {
        method: 'POST',
        body: form,
        ...(input.signal ? { signal: input.signal } : {}),
      }),
    );
    if (!Array.isArray(short['data']) || short['data'].length !== 1)
      throw new InstagramLoginError('INVALID_RESPONSE', false);
    const item = object(short['data'][0]);
    const shortToken = accessToken(item['access_token']);
    const externalAccountId = item['user_id'];
    const permissions = item['permissions'];
    if (
      typeof externalAccountId !== 'string' ||
      !numericId.test(externalAccountId) ||
      typeof permissions !== 'string'
    )
      throw new InstagramLoginError('INVALID_RESPONSE', false);
    const scopes = [...new Set(permissions.split(',').map((value) => value.trim()))]
      .filter(Boolean)
      .sort();
    if (INSTAGRAM_LOGIN_SCOPES.some((scope) => !scopes.includes(scope)))
      throw new InstagramLoginError('PERMISSION', false);

    const long = await this.exchangeLongLivedToken(shortToken, input.signal);
    const profile = object(
      await this.send(
        `${this.profileEndpoint}?${new URLSearchParams({
          fields: 'user_id,username',
          access_token: long.accessToken,
        }).toString()}`,
        {
          method: 'GET',
          ...(input.signal ? { signal: input.signal } : {}),
        },
      ),
    );
    if (
      profile['user_id'] !== externalAccountId ||
      typeof profile['username'] !== 'string' ||
      !profile['username'].trim() ||
      profile['username'].length > 255
    )
      throw new InstagramLoginError('INVALID_RESPONSE', false);
    return {
      platform: 'INSTAGRAM',
      externalAccountId,
      displayName: profile['username'].trim(),
      scopes,
      accessToken: long.accessToken,
      tokenExpiresAt: tokenExpiration(this.clock(), long.expiresIn),
    };
  }

  async refreshLongLivedToken(input: {
    accessToken: string;
    signal?: AbortSignal;
  }): Promise<{ accessToken: string; tokenExpiresAt: Date }> {
    const currentToken = validOAuthValue(input.accessToken, 8192);
    const result = object(
      await this.send(
        `${graphOrigin}/refresh_access_token?${new URLSearchParams({
          grant_type: 'ig_refresh_token',
          access_token: currentToken,
        }).toString()}`,
        {
          method: 'GET',
          ...(input.signal ? { signal: input.signal } : {}),
        },
      ),
    );
    if (typeof result['token_type'] !== 'string' || result['token_type'].toLowerCase() !== 'bearer')
      throw new InstagramLoginError('INVALID_RESPONSE', false);
    return {
      accessToken: accessToken(result['access_token']),
      tokenExpiresAt: tokenExpiration(this.clock(), expiration(result['expires_in'])),
    };
  }

  private async exchangeLongLivedToken(
    shortToken: string,
    signal?: AbortSignal,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const result = object(
      await this.send(
        `${graphOrigin}/access_token?${new URLSearchParams({
          grant_type: 'ig_exchange_token',
          client_secret: this.configuration.appSecret,
          access_token: shortToken,
        }).toString()}`,
        {
          method: 'GET',
          ...(signal ? { signal } : {}),
        },
      ),
    );
    if (typeof result['token_type'] !== 'string' || result['token_type'].toLowerCase() !== 'bearer')
      throw new InstagramLoginError('INVALID_RESPONSE', false);
    return {
      accessToken: accessToken(result['access_token']),
      expiresIn: expiration(result['expires_in']),
    };
  }

  private async send(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(url, {
        ...init,
        redirect: 'error',
        cache: 'no-store',
      });
    } catch {
      throw new InstagramLoginError('TRANSPORT', true);
    }
    if (!response.ok) throw apiFailure(response.status);
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new InstagramLoginError('INVALID_RESPONSE', false, response.status);
    }
  }
}

export function instagramLoginAdapter(request: Fetch = fetch): InstagramLoginAdapter {
  const environment = getServerEnvironment();
  if (
    !environment.INSTAGRAM_LOGIN_APP_ID ||
    !environment.INSTAGRAM_LOGIN_APP_SECRET ||
    !environment.INSTAGRAM_LOGIN_REDIRECT_URI ||
    !environment.INSTAGRAM_GRAPH_API_VERSION
  )
    configurationError();
  return new InstagramLoginAdapter(
    {
      appId: environment.INSTAGRAM_LOGIN_APP_ID,
      appSecret: environment.INSTAGRAM_LOGIN_APP_SECRET,
      redirectUri: environment.INSTAGRAM_LOGIN_REDIRECT_URI,
      graphApiVersion: environment.INSTAGRAM_GRAPH_API_VERSION,
    },
    request,
  );
}
