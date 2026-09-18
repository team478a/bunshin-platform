import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  AesGcmPaymentSecretCrypto,
  StripeAccountConnectionTestAdapter,
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
});
