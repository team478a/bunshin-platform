import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SupabaseExternalReadCredentialVerifier } from '../src/auth/external-read-credential';
const subject = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const base = 'https://auth.example.invalid';
const clientId = '33333333-3333-4333-8333-333333333333';
let pair: CryptoKeyPair;
let publicKey: JsonWebKey;
const kid = crypto.randomUUID();
const requestUrl = (input: Parameters<typeof fetch>[0]) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
beforeAll(async () => {
  pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
});
async function token(change: Record<string, unknown> = {}, key?: CryptoKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' })).toString(
    'base64url',
  );
  const payload = Buffer.from(
    JSON.stringify({
      iss: base + '/auth/v1',
      aud: 'authenticated',
      role: 'authenticated',
      sub: subject,
      session_id: session,
      client_id: clientId,
      iat: now - 10,
      exp: now + 3600,
      ...change,
    }),
  ).toString('base64url');
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key ?? pair.privateKey,
    new TextEncoder().encode(header + '.' + payload),
  );
  return header + '.' + payload + '.' + Buffer.from(signature).toString('base64url');
}
function setup(userId = subject) {
  const calls: string[] = [];
  const request: typeof fetch = (input) => {
    const url = requestUrl(input);
    calls.push(url);
    if (url === base + '/auth/v1/.well-known/jwks.json')
      return Promise.resolve(
        Response.json({ keys: [{ ...publicKey, kid, alg: 'ES256', use: 'sig' }] }),
      );
    if (url === base + '/auth/v1/user')
      return Promise.resolve(
        Response.json({
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'synthetic@example.invalid',
          user_metadata: {},
          app_metadata: {},
          created_at: new Date().toISOString(),
        }),
      );
    return Promise.reject(new Error('unexpected verification endpoint'));
  };
  return {
    calls,
    verifier: new SupabaseExternalReadCredentialVerifier(
      {
        url: base,
        key: 'synthetic-publishable-key-only',
        environment: 'test',
        clientIds: [clientId],
      },
      request,
    ),
  };
}
describe('real SDK OAuth signature and identity verification', () => {
  it('verifies an ES256 signature through SDK JWKS and checks the auth user', async () => {
    const s = setup();
    const result = await s.verifier.verify(
      'Bearer ' + (await token()),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      issuer: base + '/auth/v1',
      subject,
      sessionId: session,
      clientId,
      environment: 'test',
    });
    expect(s.calls).toContain(base + '/auth/v1/user');
    expect(result).not.toHaveProperty('token');
    expect(result).not.toHaveProperty('email');
  });
  it('rejects an incorrectly signed token before user lookup', async () => {
    const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const s = setup();
    expect(
      await s.verifier.verify(
        'Bearer ' + (await token({}, other.privateKey)),
        new AbortController().signal,
      ),
    ).toBeNull();
    expect(s.calls).not.toContain(base + '/auth/v1/user');
  });
  it.each([
    { iss: 'https://foreign.example/auth/v1' },
    { aud: 'other' },
    { role: 'service_role' },
    { client_id: undefined },
    { client_id: 'unknown' },
    { session_id: undefined },
    { sub: 'invalid' },
    { exp: 1 },
    { iat: 9999999999 },
    { nbf: 9999999999 },
  ])('rejects claim substitution %j', async (change) => {
    const s = setup();
    expect(
      await s.verifier.verify('Bearer ' + (await token(change)), new AbortController().signal),
    ).toBeNull();
    expect(s.calls).not.toContain(base + '/auth/v1/user');
  });
  it('requires the remotely verified subject to match signed claims', async () => {
    const s = setup(session);
    expect(
      await s.verifier.verify('Bearer ' + (await token()), new AbortController().signal),
    ).toBeNull();
  });
  it.each(['', 'Bearer text', 'Basic token', 'Bearer a.b.c extra', 'Bearer ' + 'x'.repeat(9000)])(
    'rejects malformed or oversized bearer header',
    async (header) => {
      const s = setup();
      expect(await s.verifier.verify(header, new AbortController().signal)).toBeNull();
      expect(s.calls).toEqual([]);
    },
  );
  it('checks expiry again after remote verification', async () => {
    let at = new Date();
    const signed = await token();
    const request: typeof fetch = (input) => {
      if (requestUrl(input).endsWith('/user')) at = new Date(at.getTime() + 7200_000);
      return Promise.resolve(
        Response.json(
          requestUrl(input).endsWith('/user')
            ? { id: subject, aud: 'authenticated' }
            : { keys: [{ ...publicKey, kid, alg: 'ES256' }] },
        ),
      );
    };
    const verifier = new SupabaseExternalReadCredentialVerifier(
      {
        url: base,
        key: 'synthetic-only-publishable-key',
        environment: 'test',
        clientIds: [clientId],
      },
      request,
      () => at,
    );
    expect(await verifier.verify('Bearer ' + signed, new AbortController().signal)).toBeNull();
  });
  it('keeps a closed client list from causing any auth request', async () => {
    const request = vi.fn<typeof fetch>();
    const verifier = new SupabaseExternalReadCredentialVerifier(
      { url: base, key: 'synthetic', environment: 'test', clientIds: [] },
      request,
    );
    expect(
      await verifier.verify('Bearer ' + (await token()), new AbortController().signal),
    ).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
