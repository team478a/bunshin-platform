import { describe, expect, it, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { createHash } from 'node:crypto';

describe('installed Supabase native multi-flow PKCE contract', () => {
  it('exchanges independent flow slots in reverse order and never borrows the latest verifier', async () => {
    const jar = new Map<string, string>();
    const tokenBodies: Array<{ auth_code: string; code_verifier: string }> = [];
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const endpoint =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!endpoint.includes('/token?grant_type=pkce'))
        throw new Error('unexpected network endpoint');
      if (typeof init?.body !== 'string') throw new Error('unexpected request body');
      tokenBodies.push(JSON.parse(init.body) as { auth_code: string; code_verifier: string });
      const payload = Buffer.from(
        JSON.stringify({
          sub: '11111111-1111-4111-8111-111111111111',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url');
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: `eyJhbGciOiJub25lIn0.${payload}.signature`,
            refresh_token: 'refresh',
            token_type: 'bearer',
            expires_in: 3600,
            user: {
              id: '11111111-1111-4111-8111-111111111111',
              aud: 'authenticated',
              role: 'authenticated',
              email: 'member@example.com',
              app_metadata: {},
              user_metadata: {},
              created_at: new Date().toISOString(),
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      );
    });
    const client = () =>
      createServerClient('https://project.supabase.co', 'safe-public-test-key', {
        global: { fetch: fetcher },
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (writes) => {
            for (const { name, value } of writes) {
              if (value) jar.set(name, value);
              else jar.delete(name);
            }
          },
        },
      });
    const a = await client().auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: 'https://bunshin.example/auth/line/callback?authAttempt=first' },
    });
    const b = await client().auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: 'https://bunshin.example/auth/line/callback?authAttempt=second' },
    });
    expect(a.data.flowId).toBeTruthy();
    expect(b.data.flowId).not.toBe(a.data.flowId);
    const slotA = `sb-project-auth-token-flow-${a.data.flowId}-code-verifier`;
    const slotB = `sb-project-auth-token-flow-${b.data.flowId}-code-verifier`;
    expect(jar.has(slotA)).toBe(true);
    expect(jar.has(slotB)).toBe(true);
    expect(
      (await client().auth.exchangeCodeForSession('code-b', { flowId: b.data.flowId! })).error,
    ).toBeNull();
    expect(jar.has(slotA)).toBe(true);
    expect(
      (await client().auth.exchangeCodeForSession('code-a', { flowId: a.data.flowId! })).error,
    ).toBeNull();
    expect(tokenBodies.map((body) => body.auth_code)).toEqual(['code-b', 'code-a']);
    expect(tokenBodies[0]?.code_verifier).not.toBe(tokenBodies[1]?.code_verifier);
    for (const [body, started] of [
      [tokenBodies[0]!, b],
      [tokenBodies[1]!, a],
    ] as const) {
      expect(createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(
        new URL(started.data.url!).searchParams.get('code_challenge'),
      );
    }
    const c = await client().auth.signInWithOAuth({ provider: 'github' });
    expect(c.data.flowId).toBeTruthy();
    expect(
      (await client().auth.exchangeCodeForSession('replay-a', { flowId: a.data.flowId! })).error,
    ).not.toBeNull();
    expect(
      (await client().auth.exchangeCodeForSession('missing', { flowId: 'unknown-flow-123' })).error,
    ).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
