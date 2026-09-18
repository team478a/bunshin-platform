import 'server-only';
import type { LineConfigurationEnvironment } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const runtimeEnvironment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const;

export function currentPaymentEnvironment(): LineConfigurationEnvironment {
  return runtimeEnvironment[getServerEnvironment().APP_ENV];
}

export type EncryptedPaymentSecret = {
  encryptedValue: string;
  mask: string;
  keyVersion: number;
};

export class AesGcmPaymentSecretCrypto {
  private material(version?: number) {
    const environment = getServerEnvironment();
    if (!environment.ENCRYPTION_KEY)
      throw new ApplicationError('CONFIGURATION_ERROR', 'ENCRYPTION_KEY is required');
    const keyVersion = version ?? environment.PAYMENT_CONFIG_KEY_VERSION;
    return {
      environment,
      keyVersion,
      key: Buffer.from(
        hkdfSync(
          'sha256',
          Buffer.from(environment.ENCRYPTION_KEY, 'utf8'),
          Buffer.from(`bunshin:${environment.APP_ENV}`, 'utf8'),
          Buffer.from(`organization-payment-configuration:aes-gcm:v${keyVersion}`, 'utf8'),
          32,
        ),
      ),
    };
  }

  encrypt(raw: string): EncryptedPaymentSecret {
    const value = raw.trim();
    if (value.length < 8) throw new ApplicationError('VALIDATION_ERROR', 'secret is too short');
    const { environment, keyVersion, key } = this.material();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(
      Buffer.from(`${environment.APP_ENV}:organization-payment-config:v${keyVersion}`, 'utf8'),
    );
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      encryptedValue: [
        `v${keyVersion}`,
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        encrypted.toString('base64url'),
      ].join('.'),
      mask: `••••${value.slice(-4)}`,
      keyVersion,
    };
  }

  decrypt(value: string): string {
    const [versionValue, ivValue, tagValue, encryptedValue] = value.split('.');
    const version = Number(versionValue?.replace(/^v/, ''));
    if (!ivValue || !tagValue || !encryptedValue || !Number.isInteger(version))
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid encrypted payment secret');
    const { environment, key } = this.material(version);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
      decipher.setAAD(
        Buffer.from(`${environment.APP_ENV}:organization-payment-config:v${version}`, 'utf8'),
      );
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new ApplicationError(
        'CONFIGURATION_ERROR',
        'payment secret authentication failed',
        error,
      );
    }
  }
}

export class StripeAccountConnectionTestAdapter {
  async validate(secretKey: string): Promise<{
    success: boolean;
    accountReference: string | null;
    errorCategory: string | null;
  }> {
    try {
      const response = await fetch('https://api.stripe.com/v1/account', {
        headers: { authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        const payload = (await response.json()) as { id?: unknown };
        return {
          success: typeof payload.id === 'string' && payload.id.startsWith('acct_'),
          accountReference:
            typeof payload.id === 'string' && payload.id.startsWith('acct_') ? payload.id : null,
          errorCategory:
            typeof payload.id === 'string' && payload.id.startsWith('acct_')
              ? null
              : 'PROVIDER_RESPONSE_INVALID',
        };
      }
      if (response.status === 401 || response.status === 403)
        return { success: false, accountReference: null, errorCategory: 'CREDENTIAL_INVALID' };
      if (response.status === 429)
        return { success: false, accountReference: null, errorCategory: 'QUOTA_OR_RATE_LIMIT' };
      return { success: false, accountReference: null, errorCategory: 'PROVIDER_UNAVAILABLE' };
    } catch {
      return { success: false, accountReference: null, errorCategory: 'PROVIDER_UNAVAILABLE' };
    }
  }
}
