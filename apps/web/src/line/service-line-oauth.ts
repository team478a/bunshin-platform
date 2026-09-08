import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const lineLinkCookie = 'service-line-link';
export const lineLinkLifetimeMs = 10 * 60_000;
export const hashLineState = (value: string) => createHash('sha256').update(value).digest('hex');
export function createLineLinkProof() {
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  return {
    state,
    nonce,
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}

export function lineLinkAuthorization(input: {
  channelId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  challenge: string;
}) {
  const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: input.channelId,
    redirect_uri: input.redirectUri,
    state: input.state,
    nonce: input.nonce,
    scope: 'openid profile',
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    bot_prompt: 'normal',
  }).toString();
  return url.toString();
}

/** LINE verifies the signature, issuer, audience and nonce; validate the returned claims too. */
export async function verifyServiceLineCode(
  input: {
    code: string;
    channelId: string;
    secret: string;
    redirectUri: string;
    nonce: string;
    verifier: string;
  },
  request: typeof fetch = fetch,
) {
  const post = async (path: string, body: Record<string, string>) => {
    const response = await request(`https://api.line.me${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('LINE verification failed');
    return response.json();
  };
  const token = z
    .object({ id_token: z.string().min(1).max(16000), access_token: z.string().min(1).max(4096) })
    .parse(
      await post('/oauth2/v2.1/token', {
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: input.redirectUri,
        client_id: input.channelId,
        client_secret: input.secret,
        code_verifier: input.verifier,
      }),
    );
  const identity = z
    .object({
      iss: z.literal('https://access.line.me'),
      aud: z.literal(input.channelId),
      nonce: z.literal(input.nonce),
      sub: z.string().regex(/^U[0-9a-f]{32}$/),
      exp: z.number(),
    })
    .parse(
      await post('/oauth2/v2.1/verify', {
        id_token: token.id_token,
        client_id: input.channelId,
        nonce: input.nonce,
      }),
    );
  if (identity.exp * 1000 <= Date.now()) throw new Error('Expired LINE identity');
  const friendResponse = await request('https://api.line.me/friendship/v1/status', {
    headers: { authorization: `Bearer ${token.access_token}` },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  if (!friendResponse.ok) throw new Error('LINE friendship unavailable');
  const friend = z.object({ friendFlag: z.boolean() }).parse(await friendResponse.json());
  return { providerUserId: identity.sub, following: friend.friendFlag };
}
