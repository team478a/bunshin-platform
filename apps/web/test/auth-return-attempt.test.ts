import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { attemptRows, attemptTable } from './fixtures/auth-attempt-table';
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://bunshin.example', APP_ENV: 'development' }),
}));
vi.mock('@bunshin/database', () => ({ prisma: { authReturnAttempt: attemptTable } }));
import {
  createAuthReturnAttempt,
  attachAuthAttemptCookie,
  attemptCallbackUrl,
  readAuthReturnContext,
  setAuthAttemptPkceFlow,
  claimAuthReturnAttempt,
  authenticateAuthReturnAttempt,
  consumeAuthReturnAttempt,
  cancelAuthReturnAttempt,
  clearAuthReturnCookie,
  singleAuthAttemptId,
  authEmailHash,
  emailAuthAttemptId,
  type NewAuthReturnAttempt,
} from '../src/auth/auth-return-attempt';

const origin = 'https://bunshin.example';
const actor = '11111111-1111-4111-8111-111111111111';
const start = (cookie?: string) =>
  new Request(`${origin}/auth/line`, { headers: { origin, ...(cookie ? { cookie } : {}) } });
const proofCookie = (context: NewAuthReturnAttempt) =>
  `bunshin_auth_attempt_${context.attempt.id}=${context.proof}`;
const callback = (contexts: NewAuthReturnAttempt[], hostname = origin) =>
  new Request(`${hostname}/auth/line/callback`, {
    headers: { cookie: contexts.map(proofCookie).join('; ') },
  });

describe('attempt-scoped authentication return records', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attemptRows.clear();
    vi.stubEnv('AUTH_RETURN_ATTEMPTS_ENABLED', 'true');
  });

  it('keeps two projects independent when completed in reverse order', async () => {
    const a = await createAuthReturnAttempt(start(), 'LINE', '/s/media/line');
    const b = await createAuthReturnAttempt(start(proofCookie(a)), 'LINE', '/s/training/home');
    for (const context of [b, a]) {
      await setAuthAttemptPkceFlow(context, `flow-${context.attempt.id}`);
      const loaded = await readAuthReturnContext(callback([a, b]), context.attempt.id, {
        method: 'LINE',
      });
      expect(loaded.returnTo).toBe(context.returnTo);
      await claimAuthReturnAttempt(loaded);
      await authenticateAuthReturnAttempt(loaded, actor);
      await consumeAuthReturnAttempt(loaded, actor);
      const response = clearAuthReturnCookie(
        NextResponse.redirect(new URL(loaded.returnTo!, origin)),
        loaded,
      );
      expect(response.cookies.get(`bunshin_auth_attempt_${context.attempt.id}`)?.value).toBe('');
      const other = context === a ? b : a;
      expect(response.cookies.get(`bunshin_auth_attempt_${other.attempt.id}`)).toBeUndefined();
    }
    expect(
      [...attemptRows.values()].every((row) => row.stage === 'CONSUMED' && row.returnPath === null),
    ).toBe(true);
  });

  it('uses CAS to reject a simultaneous second claim without cancelling its winner', async () => {
    const context = await createAuthReturnAttempt(start(), 'LINE', '/s/media/line');
    const results = await Promise.allSettled([
      claimAuthReturnAttempt(context),
      claimAuthReturnAttempt(context),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await cancelAuthReturnAttempt(context)).toBe(false);
    expect(attemptRows.get(context.attempt.id)?.stage).toBe('CLAIMED');
    await authenticateAuthReturnAttempt(context, actor);
    const consumed = await Promise.allSettled([
      consumeAuthReturnAttempt(context, actor),
      consumeAuthReturnAttempt(context, actor),
    ]);
    expect(consumed.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('binds consent to the authenticated user rather than the latest browser session', async () => {
    const context = await createAuthReturnAttempt(start(), 'LINE', '/s/media/line');
    await claimAuthReturnAttempt(context);
    await authenticateAuthReturnAttempt(context, actor);
    await expect(
      readAuthReturnContext(callback([context]), context.attempt.id, {
        actorUserId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toThrow();
    await expect(
      consumeAuthReturnAttempt(context, '22222222-2222-4222-8222-222222222222'),
    ).rejects.toThrow();
    expect(attemptRows.get(context.attempt.id)?.stage).toBe('AUTHENTICATED');
    await expect(
      readAuthReturnContext(callback([context]), context.attempt.id, { actorUserId: actor }),
    ).resolves.toMatchObject({ returnTo: '/s/media/line' });
  });

  it('rejects another browser, another origin, wrong provider and expired proofs', async () => {
    const context = await createAuthReturnAttempt(start(), 'LINE', '/s/media/line');
    await expect(
      readAuthReturnContext(callback([]), context.attempt.id, { method: 'LINE' }),
    ).rejects.toThrow();
    await expect(
      readAuthReturnContext(callback([context], 'https://other.example'), context.attempt.id, {
        method: 'LINE',
      }),
    ).rejects.toThrow();
    await expect(
      readAuthReturnContext(callback([context]), context.attempt.id, { method: 'EMAIL' }),
    ).rejects.toThrow();
    attemptRows.get(context.attempt.id)!.expiresAt = new Date(Date.now() - 1);
    await expect(
      readAuthReturnContext(callback([context]), context.attempt.id, { method: 'LINE' }),
    ).rejects.toThrow();
    await expect(claimAuthReturnAttempt(context)).rejects.toThrow();
  });

  it('never borrows a shared cookie or another attempt when the selector/proof is missing', async () => {
    const context = await createAuthReturnAttempt(start(), 'LINE', '/s/media/line');
    const request = new Request(`${origin}/auth/line/callback`, {
      headers: { cookie: `${proofCookie(context)}; bunshin_line_auth_return=%2Fs%2Fother%2Fline` },
    });
    await expect(readAuthReturnContext(request, null)).rejects.toThrow();
    await expect(readAuthReturnContext(request, null, { allowUnscoped: true })).rejects.toThrow();
    await expect(
      readAuthReturnContext(request, '33333333-3333-4333-8333-333333333333'),
    ).rejects.toThrow();
    const duplicated = new Request(request.url, {
      headers: { cookie: `${proofCookie(context)}; ${proofCookie(context)}` },
    });
    await expect(readAuthReturnContext(duplicated, context.attempt.id)).rejects.toThrow();
  });

  it('rejects duplicate, malformed selectors and unsafe destinations', async () => {
    expect(singleAuthAttemptId([])).toBeNull();
    expect(() => singleAuthAttemptId(['invalid'])).toThrow();
    expect(() => singleAuthAttemptId([actor, actor])).toThrow();
    await expect(
      createAuthReturnAttempt(start(), 'LINE', '/s/media/../training/line'),
    ).rejects.toThrow();
    expect(attemptTable.create).not.toHaveBeenCalled();
  });

  it('extracts only the same-origin attempt from email template redirect metadata', () => {
    const url = new URL(`${origin}/auth/confirm?token_hash=token&type=email`);
    url.searchParams.set('redirect_to', `${origin}/auth/confirm?authAttempt=${actor}`);
    expect(emailAuthAttemptId(url)).toBe(actor);
    for (const invalid of [
      'https://other.example/auth/confirm',
      `${origin}/s/other/line`,
      `${origin}/auth/confirm?returnTo=/s/other/line`,
      `${origin}/auth/confirm?authAttempt=${actor}&authAttempt=${actor}`,
    ]) {
      url.searchParams.set('redirect_to', invalid);
      expect(() => emailAuthAttemptId(url)).toThrow();
    }
  });

  it('keeps proof out of the URL and uses separate short-lived HttpOnly cookies', async () => {
    const context = await createAuthReturnAttempt(
      start(),
      'EMAIL',
      '/s/media/line',
      'Member@Example.COM',
    );
    const url = attemptCallbackUrl(origin, '/auth/confirm', context);
    expect(new URL(url).searchParams.get('authAttempt')).toBe(context.attempt.id);
    expect(url).not.toContain(context.proof);
    expect(context.attempt.loginIdentityHash).toBe(
      authEmailHash('member@example.com', context.attempt.proofHash),
    );
    const response = attachAuthAttemptCookie(
      NextResponse.redirect(new URL('/login', origin)),
      context,
    );
    const cookie = response.cookies.get(`bunshin_auth_attempt_${context.attempt.id}`)!;
    expect(cookie).toMatchObject({
      value: context.proof,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
    });
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('limits observed active attempts and cleans stale cookies and expired rows', async () => {
    const contexts: NewAuthReturnAttempt[] = [];
    for (let i = 0; i < 4; i++)
      contexts.push(
        await createAuthReturnAttempt(
          start(contexts.map(proofCookie).join('; ')),
          'LINE',
          `/s/service-${i}/line`,
        ),
      );
    await expect(
      createAuthReturnAttempt(start(contexts.map(proofCookie).join('; ')), 'LINE', '/s/fifth/line'),
    ).rejects.toThrow();
    attemptRows.get(contexts[0]!.attempt.id)!.expiresAt = new Date(Date.now() - 1);
    const next = await createAuthReturnAttempt(
      start(contexts.map(proofCookie).join('; ')),
      'LINE',
      '/s/fifth/line',
    );
    expect(next.staleCookieIds).toContain(contexts[0]!.attempt.id);
    expect(attemptRows.has(contexts[0]!.attempt.id)).toBe(false);
    expect(attemptRows.has(contexts[1]!.attempt.id)).toBe(true);
  });

  it('retains strict callbacks when the start flag is switched off', async () => {
    const context = await createAuthReturnAttempt(start(), 'LINE', '/s/media/line');
    vi.stubEnv('AUTH_RETURN_ATTEMPTS_ENABLED', 'false');
    await expect(
      readAuthReturnContext(callback([context]), context.attempt.id, { method: 'LINE' }),
    ).resolves.toMatchObject({ returnTo: '/s/media/line' });
    await expect(readAuthReturnContext(callback([]), context.attempt.id)).rejects.toThrow();
    await expect(
      readAuthReturnContext(
        new Request(`${origin}/auth/line/callback`, {
          headers: { cookie: 'bunshin_line_auth_return=%2Fs%2Flegacy%2Fline' },
        }),
        null,
      ),
    ).resolves.toMatchObject({ attempt: null, returnTo: '/s/legacy/line' });
  });
});
