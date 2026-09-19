import 'server-only';
import type { LineConfigurationEnvironment } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

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

export type StripeCheckoutSession = {
  id: string;
  url: string;
  expiresAt: Date | null;
};

export class StripeCheckoutAdapter {
  async create(input: {
    secretKey: string;
    idempotencyKey: string;
    purchaseId: string;
    workspaceId: string;
    offeringId: string;
    productName: string;
    amountYen: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<StripeCheckoutSession> {
    const body = new URLSearchParams({
      mode: 'payment',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.purchaseId,
      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][unit_amount]': String(input.amountYen),
      'line_items[0][price_data][product_data][name]': input.productName,
      'line_items[0][quantity]': '1',
      'metadata[purchase_id]': input.purchaseId,
      'metadata[workspace_id]': input.workspaceId,
      'metadata[offering_id]': input.offeringId,
      'payment_intent_data[metadata][purchase_id]': input.purchaseId,
      'payment_intent_data[metadata][workspace_id]': input.workspaceId,
    });
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': input.idempotencyKey,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new ApplicationError(
        response.status === 401 || response.status === 403
          ? 'CONFIGURATION_ERROR'
          : 'INTERNAL_ERROR',
        'Stripe Checkoutを開始できませんでした',
      );
    }
    const payload = (await response.json()) as {
      id?: unknown;
      url?: unknown;
      expires_at?: unknown;
    };
    if (
      typeof payload.id !== 'string' ||
      !payload.id.startsWith('cs_') ||
      typeof payload.url !== 'string' ||
      !payload.url.startsWith('https://checkout.stripe.com/')
    ) {
      throw new ApplicationError('INTERNAL_ERROR', 'Stripe response is invalid');
    }
    return {
      id: payload.id,
      url: payload.url,
      expiresAt:
        typeof payload.expires_at === 'number' ? new Date(payload.expires_at * 1000) : null,
    };
  }
}

export class StripeCheckoutSessionRetrievalAdapter {
  async retrieve(secretKey: string, sessionId: string): Promise<unknown> {
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid Stripe Checkout identifier');
    }
    let response: Response;
    try {
      response = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
        {
          headers: { authorization: `Bearer ${secretKey}` },
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch (error) {
      throw new ApplicationError('INTERNAL_ERROR', 'Stripe Checkout retrieval failed', error);
    }
    if (!response.ok) {
      throw new ApplicationError(
        response.status === 401 || response.status === 403
          ? 'CONFIGURATION_ERROR'
          : response.status === 404
            ? 'NOT_FOUND'
            : 'INTERNAL_ERROR',
        'Stripe Checkout retrieval failed',
      );
    }
    return response.json();
  }
}

export class StripeEventRetrievalAdapter {
  async retrieve(secretKey: string, eventId: string): Promise<unknown> {
    if (!/^evt_[A-Za-z0-9]+$/.test(eventId)) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid Stripe event identifier');
    }
    let response: Response;
    try {
      response = await fetch(`https://api.stripe.com/v1/events/${encodeURIComponent(eventId)}`, {
        headers: { authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new ApplicationError('INTERNAL_ERROR', 'Stripe event retrieval failed', error);
    }
    if (!response.ok) {
      throw new ApplicationError(
        response.status === 401 || response.status === 403
          ? 'CONFIGURATION_ERROR'
          : response.status === 404
            ? 'NOT_FOUND'
            : 'INTERNAL_ERROR',
        'Stripe event retrieval failed',
      );
    }
    return response.json();
  }
}

export function verifyStripeWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string;
  webhookSecret: string;
  now?: Date;
  toleranceSeconds?: number;
}) {
  const parts = input.signatureHeader.split(',').map((part) => part.trim().split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value ?? '');
  const seconds = Number(timestamp);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (
    !timestamp ||
    !Number.isInteger(seconds) ||
    Math.abs(now - seconds) > (input.toleranceSeconds ?? 300) ||
    signatures.length === 0
  ) {
    return false;
  }
  const expected = createHmac('sha256', input.webhookSecret)
    .update(`${timestamp}.${input.rawBody}`, 'utf8')
    .digest();
  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
