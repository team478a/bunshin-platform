import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ decide: vi.fn() }));
vi.mock('../src/services/oauth-consent', () => ({ decideOAuthConsent: m.decide }));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://bunshin.example.invalid' }),
}));
import { POST } from '../app/api/oauth/decision/route';
import { oauthConsentPath, safeOAuthConsentReturn } from '../src/auth/oauth-consent-path';
import { safeLineAuthReturnPath, requiresPlatformOnboarding } from '../src/auth/line-return';
import config from '../next.config';
const id = 'synthetic-authorization';
const request = (
  body = `authorization_id=${id}&decision=approve`,
  origin = 'https://bunshin.example.invalid',
) =>
  new Request('https://bunshin.example.invalid/api/oauth/decision', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.decide.mockResolvedValue({
    kind: 'redirect',
    url: 'https://client.example.invalid/callback?code=synthetic&state=preserved',
  });
});
describe('OAuth decision HTTP and existing login return', () => {
  it('returns native form errors to a readable page without exposing raw errors', async () => {
    m.decide.mockRejectedValue(new Error('private provider token'));
    const form = request();
    form.headers.set('accept', 'text/html');
    const response = await POST(form);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`/oauth/consent?authorization_id=${id}&error=1`);
  });
  it.each(['approve', 'deny'])('returns a non-cacheable 303 for explicit %s', async (decision) => {
    const response = await POST(request(`authorization_id=${id}&decision=${decision}`));
    expect(m.decide).toHaveBeenCalledWith(id, decision);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('state=preserved');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });
  it('blocks cross-origin approval before SDK work', async () => {
    expect((await POST(request(undefined, 'https://evil.example.invalid'))).status).toBe(403);
    expect(m.decide).not.toHaveBeenCalled();
  });
  it.each([
    'decision=approve',
    `authorization_id=${id}&decision=unknown`,
    `authorization_id=${id}&decision=approve&decision=deny`,
    `authorization_id=${id}&decision=approve&redirect_url=https://evil.example.invalid`,
  ])('rejects malformed decisions: %s', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(m.decide).not.toHaveBeenCalled();
  });
  it('returns to existing login if the first-party session expired', async () => {
    m.decide.mockResolvedValue({ kind: 'login', returnTo: oauthConsentPath(id) });
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      `/login?returnTo=${encodeURIComponent(oauthConsentPath(id)!)}`,
    );
  });
  it('never exposes raw SDK errors or codes in errors', async () => {
    m.decide.mockRejectedValue(new Error('private provider token'));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('private provider token');
  });
  it('allows only the opaque authorization request as a new login destination', () => {
    const path = oauthConsentPath(id)!;
    expect(safeLineAuthReturnPath(path)).toBe(path);
    expect(requiresPlatformOnboarding('PENDING', path)).toBe(false);
    for (const value of [
      path + '&redirect_url=https://evil.example.invalid',
      path + '&authorization_id=other',
      path + '#x',
      '/oauth/consent?authorization_id=../x',
      '/oauth/consent?authorization_id=%61',
      '//evil.example.invalid/oauth/consent?authorization_id=x',
    ])
      expect(safeLineAuthReturnPath(value)).toBeNull();
    expect(safeOAuthConsentReturn(path)).toBe(path);
    expect(oauthConsentPath('a&redirect_url=evil')).toBeNull();
  });
  it('adds no-store/no-referrer only to the new OAuth paths while retaining anti-framing headers', async () => {
    const rules = await config.headers!();
    expect(rules.find((r) => r.source === '/oauth/:path*')?.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'private, no-store',
    });
    expect(rules.find((r) => r.source === '/oauth/:path*')?.headers).toContainEqual({
      key: 'Referrer-Policy',
      value: 'same-origin',
    });
    expect(rules.find((r) => r.source === '/(.*)')?.headers).toContainEqual({
      key: 'X-Frame-Options',
      value: 'DENY',
    });
  });
});
