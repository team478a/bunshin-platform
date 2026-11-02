import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  env: vi.fn(),
  catalog: vi.fn(),
  sdk: vi.fn(),
  identity: vi.fn(),
  details: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: m.env }));
vi.mock('../src/services/external-read-client-catalog', () => ({
  externalReadClientCatalog: m.catalog,
}));
vi.mock('../src/auth/supabase', () => ({ createSupabaseServerClient: m.sdk }));
vi.mock('../src/auth/current-user', () => ({ verifiedFirstPartyIdentity: m.identity }));
import { loadOAuthConsent, decideOAuthConsent } from '../src/services/oauth-consent';
const id = 'synthetic-authorization';
function details() {
  return {
    authorization_id: id,
    redirect_uri: 'https://client.example.invalid/callback',
    client: { id: 'synthetic-client', name: 'Untrusted display name' },
    user: { id: 'provider-user' },
    scope: 'openid email profile',
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  m.env.mockReturnValue({ APP_ENV: 'development' });
  m.catalog.mockReturnValue([
    {
      id: 'synthetic-client',
      name: '確認済みアプリ',
      oauthRedirectUris: ['https://client.example.invalid/callback'],
    },
  ]);
  m.sdk.mockResolvedValue({
    auth: {
      oauth: {
        getAuthorizationDetails: m.details,
        approveAuthorization: m.approve,
        denyAuthorization: m.deny,
      },
    },
  });
  m.identity.mockResolvedValue({
    providerUserId: 'provider-user',
    email: 'synthetic@example.invalid',
  });
  m.details.mockResolvedValue({ data: details(), error: null });
  m.approve.mockResolvedValue({
    data: {
      redirect_url: 'https://client.example.invalid/callback?code=synthetic&state=preserved',
    },
    error: null,
  });
  m.deny.mockResolvedValue({
    data: {
      redirect_url: 'https://client.example.invalid/callback?error=access_denied&state=preserved',
    },
    error: null,
  });
});
describe('official OAuth consent service', () => {
  it.each(['empty', 'staging', 'callback-missing'])(
    'does not load SDK/auth when %s',
    async (condition) => {
      if (condition === 'empty') m.catalog.mockReturnValue([]);
      if (condition === 'staging') m.env.mockReturnValue({ APP_ENV: 'staging' });
      if (condition === 'callback-missing')
        m.catalog.mockReturnValue([{ id: 'synthetic-client', name: 'Synthetic' }]);
      expect(await loadOAuthConsent(id)).toEqual({ kind: 'unavailable' });
      expect(m.sdk).not.toHaveBeenCalled();
    },
  );
  it('keeps the request through login and never loads details before identity verification', async () => {
    m.identity.mockResolvedValue(null);
    expect(await loadOAuthConsent(id)).toEqual({
      kind: 'login',
      returnTo: `/oauth/consent?authorization_id=${id}`,
    });
    expect(m.details).not.toHaveBeenCalled();
    expect(m.approve).not.toHaveBeenCalled();
  });
  it('projects only reviewed client name, verified account and requested scopes', async () => {
    const result = await loadOAuthConsent(id);
    expect(result).toEqual({
      kind: 'consent',
      view: {
        authorizationId: id,
        clientName: '確認済みアプリ',
        account: 'synthetic@example.invalid',
        scopes: ['openid', 'email', 'profile'],
        callbackOrigin: 'https://client.example.invalid',
      },
    });
    expect(JSON.stringify(result)).not.toContain('provider-user');
    expect(m.approve).not.toHaveBeenCalled();
  });
  it.each(['approve', 'deny'] as const)(
    'rechecks current details and applies the explicit %s',
    async (decision) => {
      await loadOAuthConsent(id);
      await decideOAuthConsent(id, decision);
      expect(m.details).toHaveBeenCalledTimes(2);
      expect(decision === 'approve' ? m.approve : m.deny).toHaveBeenCalledWith(id, {
        skipBrowserRedirect: true,
      });
      expect(decision === 'approve' ? m.deny : m.approve).not.toHaveBeenCalled();
    },
  );
  it.each(['request', 'user', 'client', 'scope', 'callback', 'insecure', 'provider-error'])(
    'rejects changed/unavailable %s before any decision',
    async (change) => {
      const data = details();
      if (change === 'request') data.authorization_id = 'other';
      if (change === 'user') data.user.id = 'other';
      if (change === 'client') data.client.id = 'other';
      if (change === 'scope') data.scope = 'posts:write';
      if (change === 'callback') data.redirect_uri = 'https://evil.example.invalid/callback';
      if (change === 'insecure') {
        data.redirect_uri = 'http://client.example.invalid/callback';
        m.catalog.mockReturnValue([
          { id: data.client.id, name: 'Synthetic', oauthRedirectUris: [data.redirect_uri] },
        ]);
      }
      m.details.mockResolvedValue({
        data,
        error: change === 'provider-error' ? { message: 'private secret' } : null,
      });
      await expect(decideOAuthConsent(id, 'approve')).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'OAuth consent unavailable',
      });
      expect(m.approve).not.toHaveBeenCalled();
    },
  );
  it('resumes a previously approved request without another approval', async () => {
    m.details.mockResolvedValue({
      data: {
        redirect_url: 'https://client.example.invalid/callback?code=synthetic&state=preserved',
      },
      error: null,
    });
    expect(await loadOAuthConsent(id)).toEqual({
      kind: 'redirect',
      url: 'https://client.example.invalid/callback?code=synthetic&state=preserved',
    });
    expect(m.approve).not.toHaveBeenCalled();
    await expect(decideOAuthConsent(id, 'deny')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(m.deny).not.toHaveBeenCalled();
  });
  it.each([
    'https://evil.example.invalid/callback?code=synthetic',
    'https://client.example.invalid/other?code=synthetic',
    'javascript:alert(1)',
    'https://client.example.invalid/callback?returnTo=https://evil.example.invalid',
    'https://name:secret@client.example.invalid/callback?code=synthetic',
  ])('refuses unreviewed redirects: %s', async (url) => {
    m.approve.mockResolvedValue({ data: { redirect_url: url }, error: null });
    await expect(decideOAuthConsent(id, 'approve')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('preserves registered query parameters and rejects substitution', async () => {
    const data = details();
    data.redirect_uri += '?tenant=synthetic';
    m.catalog.mockReturnValue([
      { id: data.client.id, name: 'Synthetic', oauthRedirectUris: [data.redirect_uri] },
    ]);
    m.details.mockResolvedValue({ data, error: null });
    m.approve.mockResolvedValue({
      data: { redirect_url: `${data.redirect_uri}&code=synthetic&state=preserved` },
      error: null,
    });
    expect((await decideOAuthConsent(id, 'approve')).kind).toBe('redirect');
    m.approve.mockResolvedValue({
      data: { redirect_url: 'https://client.example.invalid/callback?tenant=other&code=synthetic' },
      error: null,
    });
    await expect(decideOAuthConsent(id, 'approve')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
