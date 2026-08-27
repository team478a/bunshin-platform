import 'server-only';
import type {
  AiProviderSecretCryptoPort,
  EncryptedAiProviderApiKey,
  LineConfigurationEnvironment,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const runtimeEnvironment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const;

export function currentAiProviderEnvironment(): LineConfigurationEnvironment {
  return runtimeEnvironment[getServerEnvironment().APP_ENV];
}

function mask(value: string): string {
  if (value.length < 8) throw new ApplicationError('VALIDATION_ERROR', 'API key is too short');
  return `••••${value.slice(-4)}`;
}

export class AesGcmAiProviderSecretCrypto implements AiProviderSecretCryptoPort {
  private material(version?: number) {
    const environment = getServerEnvironment();
    if (!environment.ENCRYPTION_KEY)
      throw new ApplicationError('CONFIGURATION_ERROR', 'ENCRYPTION_KEY is required');
    const keyVersion = version ?? environment.AI_PROVIDER_CONFIG_KEY_VERSION;
    return {
      environment,
      keyVersion,
      key: Buffer.from(
        hkdfSync(
          'sha256',
          Buffer.from(environment.ENCRYPTION_KEY, 'utf8'),
          Buffer.from(`bunshin:${environment.APP_ENV}`, 'utf8'),
          Buffer.from(`ai-provider-configuration:aes-gcm:v${keyVersion}`, 'utf8'),
          32,
        ),
      ),
    };
  }
  encrypt(raw: string): EncryptedAiProviderApiKey {
    const value = raw.trim();
    const { environment, keyVersion, key } = this.material();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${environment.APP_ENV}:ai-provider-config:v${keyVersion}`, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      encryptedValue: [
        `v${keyVersion}`,
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        encrypted.toString('base64url'),
      ].join('.'),
      mask: mask(value),
      keyVersion,
    };
  }

  decrypt(value: string): string {
    const [versionValue, ivValue, tagValue, cipherValue] = value.split('.');
    const version = Number(versionValue?.replace(/^v/, ''));
    if (!versionValue || !ivValue || !tagValue || !cipherValue || !Number.isInteger(version))
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid encrypted provider secret');
    const { environment, key } = this.material(version);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
      decipher.setAAD(Buffer.from(`${environment.APP_ENV}:ai-provider-config:v${version}`, 'utf8'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(cipherValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new ApplicationError(
        'CONFIGURATION_ERROR',
        'provider secret authentication failed',
        error,
      );
    }
  }
}

export class AiProviderConnectionTestAdapter {
  async validate(input: {
    provider: 'OPENAI' | 'GROK' | 'EXA' | 'FIRECRAWL' | 'CREATOMATE';
    apiKey: string;
    model: string | null;
  }) {
    const request =
      input.provider === 'OPENAI' || input.provider === 'GROK'
        ? fetch(
            `${input.provider === 'OPENAI' ? 'https://api.openai.com' : 'https://api.x.ai'}/v1/models/${encodeURIComponent(input.model ?? '')}`,
            {
              headers: { authorization: `Bearer ${input.apiKey}` },
              signal: AbortSignal.timeout(10_000),
            },
          )
        : input.provider === 'EXA'
          ? fetch('https://api.exa.ai/search', {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-api-key': input.apiKey },
              body: JSON.stringify({ query: 'BUNSHIN connection test', numResults: 1 }),
              signal: AbortSignal.timeout(10_000),
            })
          : input.provider === 'FIRECRAWL'
            ? fetch('https://api.firecrawl.dev/v2/scrape', {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  authorization: `Bearer ${input.apiKey}`,
                },
                body: JSON.stringify({
                  url: 'https://example.com',
                  formats: ['markdown'],
                  maxAge: 604800000,
                }),
                signal: AbortSignal.timeout(15_000),
              })
            : fetch('https://api.creatomate.com/v2/templates', {
                headers: { authorization: `Bearer ${input.apiKey}` },
                signal: AbortSignal.timeout(10_000),
              });
    const response = await request;
    if (response.ok) return { success: true, errorCategory: null };
    if (response.status === 401 || response.status === 403)
      return { success: false, errorCategory: 'CREDENTIAL_INVALID' };
    if (response.status === 429) return { success: false, errorCategory: 'QUOTA_OR_RATE_LIMIT' };
    if (response.status === 404 && ['OPENAI', 'GROK'].includes(input.provider))
      return { success: false, errorCategory: 'MODEL_UNAVAILABLE' };
    return { success: false, errorCategory: 'PROVIDER_CONFIGURATION_INVALID' };
  }
}
