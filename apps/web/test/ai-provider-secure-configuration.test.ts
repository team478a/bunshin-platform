import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { AesGcmAiProviderSecretCrypto } from '../src/ai/secure-provider-configuration';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  vi.stubEnv('ENCRYPTION_KEY', 'encryption-root-at-least-thirty-two-bytes');
  vi.stubEnv('AI_PROVIDER_CONFIG_KEY_VERSION', '2');
});

describe('AI provider secure configuration', () => {
  it('uses a purpose-separated authenticated envelope and returns only a mask', () => {
    const sealed = new AesGcmAiProviderSecretCrypto().encrypt('provider-secret-1234');
    expect(sealed.encryptedValue).not.toContain('provider-secret');
    expect(sealed.mask).toBe('••••1234');
    expect(sealed.keyVersion).toBe(2);
    expect(sealed.encryptedValue.split('.')).toHaveLength(4);
    expect(new AesGcmAiProviderSecretCrypto().decrypt(sealed.encryptedValue)).toBe(
      'provider-secret-1234',
    );
  });

  it('requires the server-side parent encryption key', () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(() => new AesGcmAiProviderSecretCrypto().encrypt('provider-secret-1234')).toThrow(
      'ENCRYPTION_KEY',
    );
  });
});
