import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  AesGcmPaymentSecretCrypto,
  StripeAccountConnectionTestAdapter,
  StripeCheckoutAdapter,
  verifyStripeWebhookSignature,
} from '../src/payments/secure-configuration';

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  vi.stubEnv('ENCRYPTION_KEY', 'encryption-root-at-least-thirty-two-bytes');
  vi.stubEnv('PAYMENT_CONFIG_KEY_VERSION', '4');
});

describe('OEM payment secure configuration', () => {
  it('encrypts payment secrets with a purpose-separated authenticated envelope', () => {
    const crypto = new AesGcmPaymentSecretCrypto();
    const sealed = crypto.encrypt('sk_test_private_1234');
    expect(sealed.encryptedValue).not.toContain('sk_test_private');
    expect(sealed.mask).toBe('••••1234');
    expect(sealed.keyVersion).toBe(4);
    expect(sealed.encryptedValue.split('.')).toHaveLength(4);
    expect(crypto.decrypt(sealed.encryptedValue)).toBe('sk_test_private_1234');
  });

  it('does not accept ciphertext under a different purpose', () => {
    const crypto = new AesGcmPaymentSecretCrypto();
    const sealed = crypto.encrypt('whsec_private_5678');
    const parts = sealed.encryptedValue.split('.');
    parts[3] = `${parts[3]!.slice(0, -1)}${parts[3]!.endsWith('A') ? 'B' : 'A'}`;
    expect(() => crypto.decrypt(parts.join('.'))).toThrow('payment secret authentication failed');
  });

  it('verifies Stripe without creating a payment', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'acct_oem123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', request);
    await expect(
      new StripeAccountConnectionTestAdapter().validate('sk_test_private'),
    ).resolves.toEqual({ success: true, accountReference: 'acct_oem123', errorCategory: null });
    expect(request).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/account',
      expect.objectContaining({ headers: { authorization: 'Bearer sk_test_private' } }),
    );
  });

  it('creates Checkout with a server-defined amount and an idempotency key', async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        id: 'cs_test_oem123',
        url: 'https://checkout.stripe.com/c/pay',
        expires_at: 10,
      }),
    );
    vi.stubGlobal('fetch', request);
    await expect(
      new StripeCheckoutAdapter().create({
        secretKey: 'sk_test_private',
        idempotencyKey: 'purchase-1',
        purchaseId: 'purchase-id',
        workspaceId: 'workspace-id',
        offeringId: 'offering-id',
        productName: '90日プログラム',
        amountYen: 29_800,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    ).resolves.toMatchObject({ id: 'cs_test_oem123' });
    const options = request.mock.calls[0]![1] as RequestInit;
    expect(options.headers).toMatchObject({ 'idempotency-key': 'purchase-1' });
    expect(options.body).toBeInstanceOf(URLSearchParams);
    if (!(options.body instanceof URLSearchParams)) {
      throw new Error('Expected Stripe request body to be URLSearchParams');
    }
    expect(options.body.toString()).toContain(
      'line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=29800',
    );
  });

  it('accepts a fresh Stripe signature and rejects stale or altered payloads', () => {
    const rawBody = JSON.stringify({ id: 'evt_1' });
    const timestamp = 2_000_000_000;
    const secret = 'whsec_test';
    const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const base = {
      rawBody,
      signatureHeader: `t=${timestamp},v1=${signature}`,
      webhookSecret: secret,
      now: new Date(timestamp * 1000),
    };
    expect(verifyStripeWebhookSignature(base)).toBe(true);
    expect(verifyStripeWebhookSignature({ ...base, rawBody: `${rawBody} ` })).toBe(false);
    expect(verifyStripeWebhookSignature({ ...base, now: new Date((timestamp + 301) * 1000) })).toBe(
      false,
    );
  });
});
