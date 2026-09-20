import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import {
  AesGcmAdminEmailSecretCrypto,
  currentAdminEmailEnvironment,
} from './secure-admin-email-configuration';

export class ServiceEmailSecretCrypto {
  private material(workspaceId: string, groupId: string, version?: number) {
    const environment = getServerEnvironment();
    if (!environment.ENCRYPTION_KEY)
      throw new ApplicationError('CONFIGURATION_ERROR', 'ENCRYPTION_KEY is required');
    const keyVersion = version ?? environment.ADMIN_EMAIL_CONFIG_KEY_VERSION;
    return {
      keyVersion,
      key: Buffer.from(
        hkdfSync(
          'sha256',
          Buffer.from(environment.ENCRYPTION_KEY),
          Buffer.from(`bunshin:${environment.APP_ENV}`),
          Buffer.from(`service-email:${workspaceId}:${groupId}:v${keyVersion}`),
          32,
        ),
      ),
      aad: `${environment.APP_ENV}:${workspaceId}:${groupId}:v${keyVersion}`,
    };
  }

  encrypt(raw: string, workspaceId: string, groupId: string) {
    const value = raw.trim();
    const { keyVersion, key, aad } = this.material(workspaceId, groupId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad));
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

  decrypt(raw: string, workspaceId: string, groupId: string) {
    const [versionValue, ivValue, tagValue, encryptedValue] = raw.split('.');
    const version = Number(versionValue?.replace(/^v/, ''));
    if (!ivValue || !tagValue || !encryptedValue || !Number.isInteger(version))
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid service email secret');
    const { key, aad } = this.material(workspaceId, groupId, version);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

export async function serviceEmailApiKey(configuration: {
  providerMode: 'PLATFORM' | 'DEDICATED_RESEND';
  encryptedApiKey: string | null;
  workspaceId: string;
  groupId: string;
}) {
  if (configuration.providerMode === 'DEDICATED_RESEND') {
    if (!configuration.encryptedApiKey)
      throw new ApplicationError('CONFIGURATION_ERROR', 'OEMメールAPIキーが未設定です');
    return new ServiceEmailSecretCrypto().decrypt(
      configuration.encryptedApiKey,
      configuration.workspaceId,
      configuration.groupId,
    );
  }
  const db = await import('@bunshin/database');
  const platform = await db.prisma.adminEmailConfiguration.findFirst({
    where: {
      environment: currentAdminEmailEnvironment(),
      status: 'ACTIVE',
      globallyPaused: false,
      lastVerifiedAt: { not: null },
      lastErrorCategory: null,
    },
    orderBy: { version: 'desc' },
  });
  if (!platform)
    throw new ApplicationError('CONFIGURATION_ERROR', '共通メール基盤が利用できません');
  return new AesGcmAdminEmailSecretCrypto().decrypt(platform.encryptedApiKey);
}

export class ServiceRegistrationResendAdapter {
  constructor(private readonly request: typeof fetch = fetch) {}

  async send(input: {
    apiKey: string;
    fromName: string;
    fromEmail: string;
    replyToEmail: string | null;
    to: string;
    subject: string;
    body: string;
    idempotencyKey: string;
  }) {
    const response = await this.request('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': input.idempotencyKey,
        'user-agent': 'bunshin-service-registration-email/1.0',
      },
      body: JSON.stringify({
        from: `${input.fromName} <${input.fromEmail}>`,
        to: [input.to],
        ...(input.replyToEmail ? { reply_to: input.replyToEmail } : {}),
        subject: input.subject,
        text: input.body,
      }),
    });
    if (!response.ok) {
      const category =
        response.status === 401 || response.status === 403
          ? 'CREDENTIAL_INVALID'
          : response.status === 422
            ? 'SENDER_OR_RECIPIENT_INVALID'
            : response.status === 429
              ? 'QUOTA_OR_RATE_LIMIT'
              : 'PROVIDER_UNAVAILABLE';
      throw new ApplicationError('INTERNAL_ERROR', category);
    }
    const payload = (await response.json()) as { id?: unknown };
    return typeof payload.id === 'string' ? payload.id : null;
  }
}
