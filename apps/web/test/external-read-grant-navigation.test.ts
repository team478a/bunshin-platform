import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeLineAuthReturnPath } from '../src/auth/line-return';
import { externalReadClientCatalog } from '../src/services/external-read-client-catalog';
describe('external grant navigation and closed catalog', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('starts with no verified external clients', () => {
    expect(externalReadClientCatalog()).toEqual([]);
  });
  it('loads one reviewed OAuth client from complete server configuration', () => {
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://pooled.example/test');
    vi.stubEnv('DIRECT_URL', 'postgresql://direct.example/test');
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32));
    vi.stubEnv('EXTERNAL_READ_OAUTH_CLIENT_ID', 'grok-client');
    vi.stubEnv('EXTERNAL_READ_OAUTH_CLIENT_NAME', 'Grok Bot');
    vi.stubEnv(
      'EXTERNAL_READ_OAUTH_REDIRECT_URIS',
      JSON.stringify(['https://connector.example.com/oauth/callback']),
    );
    expect(externalReadClientCatalog()).toEqual([
      {
        id: 'grok-client',
        name: 'Grok Bot',
        oauthRedirectUris: ['https://connector.example.com/oauth/callback'],
      },
    ]);
  });
  it('allows only the scoped owner page as a login return', () => {
    const path = '/s/hassy/bunshins/11111111-1111-4111-8111-111111111111/connections';
    expect(safeLineAuthReturnPath(path)).toBe(path);
    expect(safeLineAuthReturnPath(path + '/other')).toBeNull();
    expect(safeLineAuthReturnPath('https://evil.example' + path)).toBeNull();
    expect(safeLineAuthReturnPath(path + '?userId=other')).toBeNull();
  });
});
