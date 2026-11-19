import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  env: vi.fn(),
  createClient: vi.fn(),
  getClient: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: m.env }));
vi.mock('@bunshin/observability', () => ({ createLogger: () => ({ warn: m.warn }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: m.createClient }));
import { resolveExternalReadOAuthClient } from '../src/services/external-read-oauth-client';

const redirect = 'https://grok.com/connectors-oauth-exchange-code/';
const clients = [{ id: 'reviewed-template', name: 'Grok', oauthRedirectUris: [redirect] }];
const registered = {
  client_id: 'dynamic-client',
  client_name: 'Grok',
  client_type: 'public',
  registration_type: 'dynamic',
  token_endpoint_auth_method: 'none',
  redirect_uris: [redirect],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
};

beforeEach(() => {
  vi.resetAllMocks();
  m.env.mockReturnValue({
    APP_ENV: 'staging',
    EXTERNAL_READ_OAUTH_DYNAMIC_CLIENTS_ENABLED: 'true',
    SUPABASE_AUTH_ADMIN_URL: 'https://preview.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(40),
    SUPABASE_AUTH_ADMIN_ENV: 'staging',
  });
  m.createClient.mockReturnValue({ auth: { admin: { oauth: { getClient: m.getClient } } } });
  m.getClient.mockResolvedValue({ data: registered, error: null });
});

describe('external read OAuth client resolution', () => {
  it('keeps fixed reviewed clients independent of the staging DCR switch', async () => {
    m.env.mockReturnValue({ APP_ENV: 'production' });
    await expect(
      resolveExternalReadOAuthClient('reviewed-template', redirect, clients),
    ).resolves.toEqual(clients[0]);
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it('admits the exact reviewed public dynamic client in staging', async () => {
    await expect(
      resolveExternalReadOAuthClient('dynamic-client', redirect, clients),
    ).resolves.toEqual({
      ...clients[0],
      id: 'dynamic-client',
    });
    expect(m.getClient).toHaveBeenCalledWith('dynamic-client');
  });

  it.each([
    ['name', { client_name: 'Impostor' }],
    ['redirect', { redirect_uris: [redirect, 'https://evil.example/callback'] }],
    ['type', { client_type: 'confidential' }],
    ['registration', { registration_type: 'manual' }],
    ['secret method', { token_endpoint_auth_method: 'client_secret_post' }],
    ['secret value', { client_secret: 'must-not-be-returned' }],
    ['grant', { grant_types: ['authorization_code'] }],
    ['response', { response_types: ['token'] }],
  ])('rejects changed dynamic client %s metadata', async (_name, change) => {
    m.getClient.mockResolvedValue({ data: { ...registered, ...change }, error: null });
    await expect(
      resolveExternalReadOAuthClient('dynamic-client', redirect, clients),
    ).resolves.toBeNull();
  });

  it('rejects an ambiguous reviewed redirect template', async () => {
    await expect(
      resolveExternalReadOAuthClient('dynamic-client', redirect, [
        ...clients,
        { id: 'another-template', name: 'Grok', oauthRedirectUris: [redirect] },
      ]),
    ).resolves.toBeNull();
    expect(m.getClient).not.toHaveBeenCalled();
  });

  it('fails closed outside configured staging and on provider errors', async () => {
    m.env.mockReturnValue({ ...m.env(), APP_ENV: 'production' });
    await expect(
      resolveExternalReadOAuthClient('dynamic-client', redirect, clients),
    ).resolves.toBeNull();
    expect(m.warn).not.toHaveBeenCalled();
    m.env.mockReturnValue({
      APP_ENV: 'staging',
      EXTERNAL_READ_OAUTH_DYNAMIC_CLIENTS_ENABLED: 'true',
      SUPABASE_AUTH_ADMIN_URL: 'https://preview.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(40),
      SUPABASE_AUTH_ADMIN_ENV: 'staging',
    });
    m.getClient.mockRejectedValue(new Error('private provider failure'));
    await expect(
      resolveExternalReadOAuthClient('dynamic-client', redirect, clients),
    ).resolves.toBeNull();
    expect(m.warn).toHaveBeenCalledWith('External OAuth dynamic client rejected', {
      route: '/oauth/consent',
      errorCode: 'EXTERNAL_OAUTH_DYNAMIC_CLIENT_LOOKUP_FAILED',
    });
  });
});
