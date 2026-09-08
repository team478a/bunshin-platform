import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createLineLinkProof,
  hashLineState,
  lineLinkAuthorization,
  verifyServiceLineCode,
} from '../src/line/service-line-oauth';

const input = {
  code: 'code',
  channelId: '123',
  secret: 'secret',
  redirectUri: 'https://example.com/auth/service-line/callback',
  nonce: 'nonce',
  verifier: 'verifier',
};
const claims = {
  iss: 'https://access.line.me',
  aud: '123',
  nonce: 'nonce',
  sub: `U${'a'.repeat(32)}`,
  exp: Math.floor(Date.now() / 1000) + 600,
};
function provider(identity: unknown = claims, friendFlag = true) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id_token: 'id-token', access_token: 'access-token' }))
    .mockResolvedValueOnce(Response.json(identity))
    .mockResolvedValueOnce(Response.json({ friendFlag }));
}
describe('service LINE proof verification', () => {
  it('uses fresh independent state, nonce and S256 PKCE', () => {
    const proof = createLineLinkProof();
    expect(
      new Set([proof.state, proof.nonce, proof.verifier, createLineLinkProof().state]).size,
    ).toBe(4);
    expect(proof.state).toMatch(/^[\w-]{43}$/);
    expect(proof.challenge).toBe(createHash('sha256').update(proof.verifier).digest('base64url'));
    expect(hashLineState(proof.state)).toHaveLength(64);
    const url = new URL(lineLinkAuthorization({ ...input, ...proof }));
    expect(url.origin).toBe('https://access.line.me');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe(proof.state);
    expect(url.searchParams.get('nonce')).toBe(proof.nonce);
  });
  it('verifies the code with PKCE and the identity with nonce before checking friendship', async () => {
    const request = provider();
    await expect(verifyServiceLineCode(input, request)).resolves.toEqual({
      providerUserId: claims.sub,
      following: true,
    });
    expect(String(request.mock.calls[0]?.[1]?.body)).toContain('code_verifier=verifier');
    expect(String(request.mock.calls[1]?.[1]?.body)).toContain('nonce=nonce');
    expect(request.mock.calls[2]?.[1]?.headers).toEqual({ authorization: 'Bearer access-token' });
  });
  it.each([
    { aud: 'other-channel' },
    { nonce: 'other-attempt' },
    { iss: 'https://attacker.example' },
    { exp: 0 },
    { sub: 'invalid' },
  ])('rejects invalid claims %j before any connection can be made', async (override) => {
    const request = provider({ ...claims, ...override });
    await expect(verifyServiceLineCode(input, request)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not infer following when the user has not added the official account', async () => {
    await expect(verifyServiceLineCode(input, provider(claims, false))).resolves.toEqual({
      providerUserId: claims.sub,
      following: false,
    });
  });
  it('fails closed when the token endpoint rejects the authorization code', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    await expect(verifyServiceLineCode(input, request)).rejects.toThrow('LINE verification failed');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
