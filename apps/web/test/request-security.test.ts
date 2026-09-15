import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import { requireSameOrigin, trustedRequestOrigin } from '../src/auth/request-security';
import { CUSTOM_DOMAIN_HOST_HEADER } from '../src/services/custom-domain-routing';

describe('request origin security', () => {
  beforeEach(() => {
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'https://www.watashi-works.com');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
  });

  it('accepts the configured application origin', () => {
    const request = new Request('https://www.watashi-works.com/api/test', {
      headers: { origin: 'https://www.watashi-works.com' },
    });
    expect(() => requireSameOrigin(request)).not.toThrow();
  });

  it('accepts a HTTPS custom origin selected by the server proxy', () => {
    const request = new Request('https://service.example.com/api/test', {
      headers: {
        origin: 'https://service.example.com',
        [CUSTOM_DOMAIN_HOST_HEADER]: 'service.example.com',
      },
    });
    expect(trustedRequestOrigin(request)).toBe('https://service.example.com');
    expect(() => requireSameOrigin(request)).not.toThrow();
  });

  it('rejects a mismatched origin even when a custom domain marker exists', () => {
    const request = new Request('https://service.example.com/api/test', {
      headers: {
        origin: 'https://evil.example',
        [CUSTOM_DOMAIN_HOST_HEADER]: 'service.example.com',
      },
    });
    expect(() => requireSameOrigin(request)).toThrow(ApplicationError);
  });
});
