import 'server-only';
import type {
  AiProviderSecretCryptoPort,
  EncryptedAiProviderApiKey,
  LineConfigurationEnvironment,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';

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
  encrypt(raw: string): EncryptedAiProviderApiKey {
    const value = raw.trim();
    const environment = getServerEnvironment();
    if (!environment.ENCRYPTION_KEY)
      throw new ApplicationError('CONFIGURATION_ERROR', 'ENCRYPTION_KEY is required');
    const keyVersion = environment.AI_PROVIDER_CONFIG_KEY_VERSION;
    const key = Buffer.from(
      hkdfSync(
        'sha256',
        Buffer.from(environment.ENCRYPTION_KEY, 'utf8'),
        Buffer.from(`bunshin:${environment.APP_ENV}`, 'utf8'),
        Buffer.from(`ai-provider-configuration:aes-gcm:v${keyVersion}`, 'utf8'),
        32,
      ),
    );
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
}
