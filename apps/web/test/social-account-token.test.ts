import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  openSocialAccountToken,
  sealSocialAccountToken,
} from '../src/providers/social-account-token';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  vi.stubEnv('ENCRYPTION_KEY', 'encryption-root-at-least-thirty-two-bytes');
});

describe('SNS account token encryption', () => {
  it('authenticates the ciphertext and the complete ownership context', () => {
    const context = ['workspace', 'service', 'membership', 'user', 'INSTAGRAM', 'ig-1'];
    const sealed = sealSocialAccountToken('private-instagram-token', context);
    expect(sealed).not.toContain('private-instagram-token');
    expect(openSocialAccountToken(sealed, context)).toBe('private-instagram-token');
    expect(() => openSocialAccountToken(sealed, [...context.slice(0, -1), 'ig-2'])).toThrow(
      'SNS credential authentication failed',
    );
  });

  it('rejects malformed and modified envelopes without exposing plaintext', () => {
    expect(() => openSocialAccountToken('invalid', [])).toThrow('Invalid SNS credential envelope');
    const sealed = sealSocialAccountToken('DO_NOT_EXPOSE_TOKEN', ['owned']);
    const parts = sealed.split('.');
    parts[3] = `${parts[3]![0] === 'A' ? 'B' : 'A'}${parts[3]!.slice(1)}`;
    let error: unknown;
    try {
      openSocialAccountToken(parts.join('.'), ['owned']);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain('DO_NOT_EXPOSE_TOKEN');
  });
});
