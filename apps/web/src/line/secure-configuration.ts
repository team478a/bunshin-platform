import 'server-only';
import type {
  EncryptedLineSecrets,
  LineConfigurationEnvironment,
  LineSecretCryptoPort,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const runtimeEnvironment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const;

export function currentLineEnvironment(): LineConfigurationEnvironment {
  return runtimeEnvironment[getServerEnvironment().APP_ENV];
}

export function requireMatchingLineEnvironment(value: LineConfigurationEnvironment): void {
  if (value !== currentLineEnvironment())
    throw new ApplicationError('FORBIDDEN', 'LINE configuration environment mismatch');
}

function secretMask(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 8)
    throw new ApplicationError('VALIDATION_ERROR', 'LINE secret is too short');
  return `••••${trimmed.slice(-4)}`;
}

export class AesGcmLineSecretCrypto implements LineSecretCryptoPort {
  private material(version?: number) {
    const environment = getServerEnvironment();
    if (!environment.ENCRYPTION_KEY)
      throw new ApplicationError('CONFIGURATION_ERROR', 'ENCRYPTION_KEY is required');
    const keyVersion = version ?? environment.LINE_CONFIG_KEY_VERSION;
    const key = Buffer.from(
      hkdfSync(
        'sha256',
        Buffer.from(environment.ENCRYPTION_KEY, 'utf8'),
        Buffer.from(`bunshin:${environment.APP_ENV}`, 'utf8'),
        Buffer.from(`line-configuration:aes-gcm:v${keyVersion}`, 'utf8'),
        32,
      ),
    );
    return { environment, keyVersion, key };
  }
  encryptSecrets(input: {
    loginSecret: string;
    messagingSecret: string;
    accessToken: string;
  }): EncryptedLineSecrets {
    const { environment, keyVersion, key } = this.material();
    const encrypt = (plain: string) => {
      const value = plain.trim();
      secretMask(value);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(`${environment.APP_ENV}:line-config:v${keyVersion}`, 'utf8'));
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return [
        `v${keyVersion}`,
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        encrypted.toString('base64url'),
      ].join('.');
    };
    return {
      loginSecret: encrypt(input.loginSecret),
      messagingSecret: encrypt(input.messagingSecret),
      accessToken: encrypt(input.accessToken),
      loginSecretMask: secretMask(input.loginSecret),
      messagingSecretMask: secretMask(input.messagingSecret),
      accessTokenMask: secretMask(input.accessToken),
      keyVersion,
    };
  }

  decrypt(value: string): string {
    const [versionValue, ivValue, tagValue, cipherValue] = value.split('.');
    const version = Number(versionValue?.replace(/^v/, ''));
    if (!versionValue || !ivValue || !tagValue || !cipherValue || !Number.isInteger(version))
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid encrypted LINE secret');
    const { environment, key } = this.material(version);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
      decipher.setAAD(Buffer.from(`${environment.APP_ENV}:line-config:v${version}`, 'utf8'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(cipherValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new ApplicationError('CONFIGURATION_ERROR', 'LINE secret authentication failed', error);
    }
  }
}

export class LineConnectionTestAdapter {
  async validate(input: {
    loginChannelId: string;
    loginChannelSecret: string;
    messagingChannelId: string;
    messagingChannelSecret: string;
    channelAccessToken: string;
    callbackUrl: string;
  }) {
    const loginBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: 'bunshin-configuration-test-invalid-code',
      redirect_uri: input.callbackUrl,
      client_id: input.loginChannelId,
      client_secret: input.loginChannelSecret,
    });
    const [login, bot, tokenVerification] = await Promise.all([
      fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: loginBody,
        signal: AbortSignal.timeout(10_000),
      }),
      fetch('https://api.line.me/v2/bot/info', {
        headers: { authorization: `Bearer ${input.channelAccessToken}` },
        signal: AbortSignal.timeout(10_000),
      }),
      fetch('https://api.line.me/v2/oauth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: input.channelAccessToken }),
        signal: AbortSignal.timeout(10_000),
      }),
    ]);
    const loginResponse = await login.text();
    if (login.status === 401 || login.status === 403 || /invalid[_ -]?client/i.test(loginResponse))
      return { success: false, errorCategory: 'LOGIN_CREDENTIAL_INVALID', botDisplayName: null };
    if (login.status === 429)
      return { success: false, errorCategory: 'QUOTA_OR_RATE_LIMIT', botDisplayName: null };
    if (login.status !== 400)
      return { success: false, errorCategory: 'LOGIN_CONFIGURATION_INVALID', botDisplayName: null };
    if (!bot.ok) {
      const category =
        bot.status === 401
          ? 'ACCESS_TOKEN_INVALID'
          : bot.status === 429
            ? 'QUOTA_OR_RATE_LIMIT'
            : 'MESSAGING_CONFIGURATION_INVALID';
      return { success: false, errorCategory: category, botDisplayName: null };
    }
    const value = (await bot.json()) as { displayName?: unknown; basicId?: unknown };
    if (typeof value.displayName !== 'string')
      return { success: false, errorCategory: 'BOT_INFO_INVALID', botDisplayName: null };
    if (tokenVerification.ok) {
      const verified = (await tokenVerification.json()) as { client_id?: unknown };
      if (verified.client_id !== input.messagingChannelId)
        return {
          success: false,
          errorCategory: 'MESSAGING_CHANNEL_MISMATCH',
          botDisplayName: null,
        };
    } else if (tokenVerification.status === 429) {
      return { success: false, errorCategory: 'QUOTA_OR_RATE_LIMIT', botDisplayName: null };
    }
    void input.messagingChannelSecret;
    return { success: true, errorCategory: null, botDisplayName: value.displayName };
  }
}

export interface LineEndpointUrls {
  /** LINE Developers Consoleへ登録するSupabase AuthのProvider Callback。 */
  callbackUrl: string;
  /** Supabase認証完了後に戻るBUNSHIN Application Callback。 */
  applicationCallbackUrl: string;
  webhookUrl: string;
  liffEndpointUrl: string;
  missionDeepLinkBaseUrl: string;
}

export function lineEndpointUrls(): LineEndpointUrls {
  const environment = getServerEnvironment();
  const base = new URL(environment.APP_URL);
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  if (!supabaseUrl)
    throw new ApplicationError('CONFIGURATION_ERROR', 'NEXT_PUBLIC_SUPABASE_URL is required');
  const supabase = new URL(supabaseUrl);
  if (environment.APP_ENV !== 'development' && base.protocol !== 'https:')
    throw new ApplicationError('CONFIGURATION_ERROR', 'LINE URLs require HTTPS');
  if (environment.APP_ENV !== 'development' && ['localhost', '127.0.0.1'].includes(base.hostname))
    throw new ApplicationError('CONFIGURATION_ERROR', 'localhost is development only');
  if (base.username || base.password || base.search || base.hash)
    throw new ApplicationError('CONFIGURATION_ERROR', 'APP_URL contains forbidden components');
  if (environment.APP_ENV !== 'development' && supabase.protocol !== 'https:')
    throw new ApplicationError('CONFIGURATION_ERROR', 'Supabase Auth URL requires HTTPS');
  if (
    environment.APP_ENV !== 'development' &&
    ['localhost', '127.0.0.1'].includes(supabase.hostname)
  )
    throw new ApplicationError('CONFIGURATION_ERROR', 'local Supabase is development only');
  if (supabase.username || supabase.password || supabase.search || supabase.hash)
    throw new ApplicationError(
      'CONFIGURATION_ERROR',
      'NEXT_PUBLIC_SUPABASE_URL contains forbidden components',
    );
  const origin = base.origin;
  return {
    callbackUrl: `${supabase.origin}/auth/v1/callback`,
    applicationCallbackUrl: `${origin}/auth/line/callback`,
    webhookUrl: `${origin}/api/line/webhook`,
    liffEndpointUrl: `${origin}/line`,
    missionDeepLinkBaseUrl: `${origin}/today`,
  };
}
