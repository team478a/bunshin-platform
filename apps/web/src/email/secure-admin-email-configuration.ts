import 'server-only';
import type {
  AdminEmailSecretCryptoPort,
  EncryptedAdminEmailApiKey,
  LineConfigurationEnvironment,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const environments = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const;
export const currentAdminEmailEnvironment = (): LineConfigurationEnvironment =>
  environments[getServerEnvironment().APP_ENV];

export class AesGcmAdminEmailSecretCrypto implements AdminEmailSecretCryptoPort {
  private material(version?: number) {
    const environment = getServerEnvironment();
    if (!environment.ENCRYPTION_KEY)
      throw new ApplicationError('CONFIGURATION_ERROR', 'ENCRYPTION_KEY is required');
    const keyVersion = version ?? environment.ADMIN_EMAIL_CONFIG_KEY_VERSION;
    return {
      environment,
      keyVersion,
      key: Buffer.from(
        hkdfSync(
          'sha256',
          Buffer.from(environment.ENCRYPTION_KEY),
          Buffer.from(`bunshin:${environment.APP_ENV}`),
          Buffer.from(`admin-email-configuration:aes-gcm:v${keyVersion}`),
          32,
        ),
      ),
    };
  }
  encrypt(raw: string): EncryptedAdminEmailApiKey {
    const value = raw.trim();
    const { environment, keyVersion, key } = this.material();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${environment.APP_ENV}:admin-email-config:v${keyVersion}`));
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
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid encrypted email secret');
    const { environment, key } = this.material(version);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
      decipher.setAAD(Buffer.from(`${environment.APP_ENV}:admin-email-config:v${version}`));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new ApplicationError(
        'CONFIGURATION_ERROR',
        'email secret authentication failed',
        error,
      );
    }
  }
}

export class ResendAdminEmailConnectionTestAdapter {
  async sendTest(input: { apiKey: string; fromEmail: string; recipientEmails: string[] }) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${input.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: input.fromEmail,
        to: input.recipientEmails,
        subject: '【BUNSHIN】管理者メールの接続確認',
        text: 'BUNSHIN管理画面からの接続確認に成功しました。',
      }),
    });
    if (response.ok) return { success: true, errorCategory: null };
    if ([401, 403].includes(response.status))
      return { success: false, errorCategory: 'CREDENTIAL_INVALID' };
    if (response.status === 422)
      return { success: false, errorCategory: 'SENDER_OR_RECIPIENT_INVALID' };
    if (response.status === 429) return { success: false, errorCategory: 'QUOTA_OR_RATE_LIMIT' };
    return { success: false, errorCategory: 'PROVIDER_UNAVAILABLE' };
  }
}
