import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { AesGcmLineSecretCrypto, lineEndpointUrls } from '../src/line/secure-configuration';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  vi.stubEnv('ENCRYPTION_KEY', 'encryption-root-at-least-thirty-two-bytes');
  vi.stubEnv('LINE_CONFIG_KEY_VERSION', '3');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
});

describe('LINE secure configuration', () => {
  it('seals, masks and authenticates each secret', () => {
    const crypto = new AesGcmLineSecretCrypto();
    const sealed = crypto.encryptSecrets({
      loginSecret: 'login-secret-1234',
      messagingSecret: 'message-secret-5678',
      accessToken: 'access-token-9012',
    });
    expect(sealed.loginSecret).not.toContain('login-secret');
    expect(sealed.loginSecretMask).toBe('••••1234');
    expect(sealed.keyVersion).toBe(3);
    expect(crypto.decrypt(sealed.loginSecret)).toBe('login-secret-1234');
    const parts = sealed.loginSecret.split('.');
    const ciphertext = parts[3]!;
    parts[3] = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;
    const tampered = parts.join('.');
    expect(() => crypto.decrypt(tampered)).toThrow();
  });

  it('separates the LINE provider callback from the application callback', () => {
    expect(lineEndpointUrls()).toEqual({
      callbackUrl: 'http://127.0.0.1:54321/auth/v1/callback',
      applicationCallbackUrl: 'http://localhost:3000/auth/line/callback',
      webhookUrl: 'http://localhost:3000/api/line/webhook',
      liffEndpointUrl: 'http://localhost:3000/line',
      missionDeepLinkBaseUrl: 'http://localhost:3000/today',
    });
  });

  it('rejects a Supabase URL containing redirectable components', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321?next=https://evil.example');
    expect(() => lineEndpointUrls()).toThrow('forbidden components');
  });
});
