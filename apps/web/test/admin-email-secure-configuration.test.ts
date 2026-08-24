import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { AesGcmAdminEmailSecretCrypto } from '../src/email/secure-admin-email-configuration';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  vi.stubEnv('ENCRYPTION_KEY', 'encryption-root-at-least-thirty-two-bytes');
  vi.stubEnv('ADMIN_EMAIL_CONFIG_KEY_VERSION', '3');
});

describe('administrator email secure configuration', () => {
  it('uses a purpose-separated authenticated envelope and exposes only a mask', () => {
    const crypto = new AesGcmAdminEmailSecretCrypto();
    const sealed = crypto.encrypt('resend-secret-1234');
    expect(sealed.encryptedValue).not.toContain('resend-secret');
    expect(sealed.mask).toBe('••••1234');
    expect(sealed.keyVersion).toBe(3);
    expect(crypto.decrypt(sealed.encryptedValue)).toBe('resend-secret-1234');
  });

  it('does not allow ciphertext to be opened in another environment', () => {
    const sealed = new AesGcmAdminEmailSecretCrypto().encrypt('resend-secret-1234');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://app.example.com');
    expect(() => new AesGcmAdminEmailSecretCrypto().decrypt(sealed.encryptedValue)).toThrow(
      'authentication failed',
    );
  });
});
