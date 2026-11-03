import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attemptRows, attemptTable } from './fixtures/auth-attempt-table';
const state = vi.hoisted(() => ({
  oauth: vi.fn(),
  linkIdentity: vi.fn(),
  unlinkIdentity: vi.fn(),
  logError: vi.fn(),
  getUser: vi.fn(),
  exchange: vi.fn(),
  otp: vi.fn(),
  email: vi.fn(),
  commit: vi.fn(),
  accept: vi.fn(),
  activateNotifications: vi.fn(),
  friendshipStatus: vi.fn(),
  actor: '11111111-1111-4111-8111-111111111111',
  identityOwner: '11111111-1111-4111-8111-111111111111',
  lineIdentityOwner: null as string | null,
  required: false,
  registrationStatus: 'COMPLETED',
  cookie: '',
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/observability', () => ({
  createLogger: () => ({ error: state.logError }),
}));
vi.mock('../src/line/friendship-status', () => ({
  lineFriendshipStatus: state.friendshipStatus,
}));
vi.mock('../src/line/enable-service-bunshin-notifications', () => ({
  enableServiceBunshinNotifications: state.activateNotifications,
}));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ cookie: state.cookie })),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://bunshin.example', APP_ENV: 'development' }),
}));
vi.mock('@bunshin/application', () => ({
  GetRequiredLegalConsents: class {
    execute = () => Promise.resolve([]);
  },
  AcceptRequiredLegalConsents: class {
    execute = state.accept;
  },
  ConnectLineMessagingAccount: class {
    execute = vi.fn().mockResolvedValue({});
  },
}));
vi.mock('../src/auth/supabase', () => {
  const client = () => ({
    auth: {
      signInWithOAuth: state.oauth,
      linkIdentity: state.linkIdentity,
      unlinkIdentity: state.unlinkIdentity,
      getUser: state.getUser,
      exchangeCodeForSession: state.exchange,
      verifyOtp: state.otp,
      signInWithOtp: state.email,
    },
  });
  return {
    createSupabaseServerClient: () => Promise.resolve(client()),
    createSupabaseAttemptClient: () =>
      Promise.resolve({ client: client(), commitCookies: state.commit }),
  };
});
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve({ userId: state.actor }) }),
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    authReturnAttempt: attemptTable,
    authIdentity: {
      findUnique: ({ where }: { where: { provider_providerUserId: { provider: string } } }) =>
        Promise.resolve(
          where.provider_providerUserId.provider === 'EMAIL'
            ? { userId: state.identityOwner }
            : state.lineIdentityOwner
              ? { userId: state.lineIdentityOwner }
              : null,
        ),
    },
    $transaction: async (operation: (tx: object) => Promise<unknown>) =>
      operation({
        authIdentity: {
          findUnique: ({ where }: { where: { provider_providerUserId: { provider: string } } }) =>
            Promise.resolve(
              where.provider_providerUserId.provider === 'EMAIL'
                ? { userId: state.identityOwner }
                : state.lineIdentityOwner
                  ? { userId: state.lineIdentityOwner }
                  : null,
            ),
          create: () => Promise.resolve({}),
        },
      }),
    userRegistrationProfile: {
      findUnique: () => Promise.resolve({ status: state.registrationStatus }),
    },
    registrationFunnelEvent: { upsert: () => Promise.resolve({}) },
  },
  listActiveWorkspacesForUser: () => Promise.resolve([]),
  PrismaLineConnectionRepository: class {},
  PrismaLegalConsentRepository: class {
    findRequiredForUser = () => Promise.resolve(state.required ? [{ consentedAt: null }] : []);
  },
}));
import { POST as startLine } from '../app/auth/line/route';
import { GET as finishLine } from '../app/auth/line/callback/route';
import { POST as startLineLink } from '../app/auth/line/link/route';
import { GET as finishLineLink } from '../app/auth/line/link/callback/route';
import { POST as startEmail } from '../app/auth/email/route';
import { GET as emailLanding, POST as finishEmail } from '../app/auth/confirm/route';
import { POST as acceptConsent } from '../app/consent/accept/route';
import { AUTH_ATTEMPT_COOKIE_PREFIX } from '../src/auth/auth-return-attempt';
import type { NextResponse } from 'next/server';
import ConsentPage from '../app/consent/page';

const origin = 'https://bunshin.example';
const post = (path: string, fields: Record<string, string>, cookie = '') =>
  new Request(`${origin}${path}`, {
    method: 'POST',
    headers: { origin, cookie },
    body: new URLSearchParams(fields),
  });
function proof(response: Response) {
  const found = (response as NextResponse).cookies
    .getAll()
    .find((cookie) => cookie.name.startsWith(AUTH_ATTEMPT_COOKIE_PREFIX) && cookie.value);
  if (!found) throw new Error('missing browser proof');
  return {
    id: found.name.slice(AUTH_ATTEMPT_COOKIE_PREFIX.length),
    cookie: `${found.name}=${found.value}`,
    name: found.name,
  };
}
const location = (response: Response) => new URL(response.headers.get('location')!);
const lineSuccess = {
  data: {
    user: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      identities: [
        {
          id: 'line-identity',
          identity_id: 'line-identity-subject',
          provider: 'custom:line',
          identity_data: { sub: 'U1234567890' },
        },
      ],
    },
  },
  error: null,
};

describe('attempt-scoped route contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attemptRows.clear();
    vi.stubEnv('AUTH_RETURN_ATTEMPTS_ENABLED', 'true');
    vi.stubEnv('LINE_IDENTITY_LINKING_ENABLED', 'false');
    state.actor = '11111111-1111-4111-8111-111111111111';
    state.identityOwner = state.actor;
    state.lineIdentityOwner = null;
    state.required = false;
    state.registrationStatus = 'COMPLETED';
    state.cookie = '';
    state.oauth.mockImplementation(() =>
      Promise.resolve({
        data: {
          url: 'https://access.line.me/authorize',
          flowId: `flow-${attemptRows.size}-12345678`,
        },
        error: null,
      }),
    );
    state.linkIdentity.mockImplementation(() =>
      Promise.resolve({
        data: { url: 'https://access.line.me/authorize', flowId: 'line-link-flow-12345678' },
        error: null,
      }),
    );
    state.getUser.mockResolvedValue({
      data: { user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } },
      error: null,
    });
    state.exchange.mockResolvedValue(lineSuccess);
    state.unlinkIdentity.mockResolvedValue({ error: null });
    state.email.mockResolvedValue({ error: null });
    state.otp.mockResolvedValue({ data: { user: { email: 'member@example.com' } }, error: null });
    state.commit.mockResolvedValue(undefined);
    state.accept.mockResolvedValue(undefined);
    state.activateNotifications.mockResolvedValue('ENABLED');
    state.friendshipStatus.mockResolvedValue(null);
  });

  it('completes projects in reverse order using their own native PKCE flow IDs', async () => {
    const a = proof(await startLine(post('/auth/line', { returnTo: '/s/media/line' })));
    const b = proof(
      await startLine(post('/auth/line', { returnTo: '/s/training/home' }, a.cookie)),
    );
    const cookies = `${a.cookie}; ${b.cookie}`;
    for (const [attempt, path, flow] of [
      [b, '/s/training/home', 'flow-2-12345678'],
      [a, '/s/media/line', 'flow-1-12345678'],
    ] as const) {
      const response = await finishLine(
        new Request(
          `${origin}/auth/line/callback?code=code-${attempt.id}&authAttempt=${attempt.id}`,
          { headers: { cookie: cookies } },
        ),
      );
      expect(location(response).pathname).toBe(path);
      expect(state.exchange).toHaveBeenLastCalledWith(`code-${attempt.id}`, { flowId: flow });
      expect((response as NextResponse).cookies.get(attempt.name)?.value).toBe('');
      expect(
        (response as NextResponse).cookies.get(attempt === a ? b.name : a.name),
      ).toBeUndefined();
    }
  });

  it('links LINE only to the same verified account and returns to its service account page', async () => {
    vi.stubEnv('LINE_IDENTITY_LINKING_ENABLED', 'true');
    const started = await startLineLink(
      post('/auth/line/link', { returnTo: '/account?service=manaberu-style' }),
    );
    const attempt = proof(started);
    expect(location(started).origin).toBe('https://access.line.me');
    expect(state.linkIdentity).toHaveBeenCalledTimes(1);
    expect(state.oauth).not.toHaveBeenCalled();
    expect(attemptRows.get(attempt.id)).toMatchObject({
      method: 'LINE_LINK',
      actorUserId: state.actor,
      stage: 'PENDING',
    });

    const completed = await finishLineLink(
      new Request(`${origin}/auth/line/link/callback?code=linked-code&authAttempt=${attempt.id}`, {
        headers: { cookie: attempt.cookie },
      }),
    );
    expect(location(completed).pathname).toBe('/account');
    expect(location(completed).searchParams.get('service')).toBe('manaberu-style');
    expect(state.exchange).toHaveBeenCalledWith('linked-code', {
      flowId: 'line-link-flow-12345678',
    });
    expect(attemptRows.get(attempt.id)?.stage).toBe('CONSUMED');
  });

  it('binds the explicit service-wide notification choice to the LINE link attempt', async () => {
    vi.stubEnv('LINE_IDENTITY_LINKING_ENABLED', 'true');
    const started = await startLineLink(
      post('/auth/line/link', {
        returnTo: '/account?service=manaberu-style',
        lineNotifications: 'all',
      }),
    );
    const attempt = proof(started);
    expect(attemptRows.get(attempt.id)?.returnPath).toBe(
      '/account?service=manaberu-style&lineNotifications=all',
    );
    state.exchange.mockResolvedValueOnce({
      ...lineSuccess,
      data: { ...lineSuccess.data, session: { provider_token: 'provider-token' } },
    });
    state.friendshipStatus.mockResolvedValueOnce(true);

    const completed = await finishLineLink(
      new Request(`${origin}/auth/line/link/callback?code=linked-code&authAttempt=${attempt.id}`, {
        headers: { cookie: attempt.cookie },
      }),
    );

    expect(location(completed).pathname).toBe('/s/manaberu-style/line');
    expect(location(completed).searchParams.get('lineResult')).toBe('ENABLED');
    expect(state.activateNotifications).toHaveBeenCalledWith({
      serviceSlug: 'manaberu-style',
      actorUserId: state.actor,
      verifiedProviderUserId: 'U1234567890',
      friendshipConfirmed: true,
    });
  });

  it('does not enable notifications when the user links LINE without opting in', async () => {
    vi.stubEnv('LINE_IDENTITY_LINKING_ENABLED', 'true');
    const started = await startLineLink(
      post('/auth/line/link', { returnTo: '/account?service=manaberu-style' }),
    );
    const attempt = proof(started);
    const completed = await finishLineLink(
      new Request(`${origin}/auth/line/link/callback?code=linked-code&authAttempt=${attempt.id}`, {
        headers: { cookie: attempt.cookie },
      }),
    );
    expect(location(completed).pathname).toBe('/account');
    expect(state.activateNotifications).not.toHaveBeenCalled();
  });

  it('keeps LINE identity linking disabled until its explicit environment gate is enabled', async () => {
    const response = await startLineLink(post('/auth/line/link', {}));
    expect(location(response).searchParams.get('error')).toBe('auth-context');
    expect(state.linkIdentity).not.toHaveBeenCalled();
    expect(attemptRows.size).toBe(0);
  });

  it('rejects LINE linking when the callback session resolves to another platform user', async () => {
    vi.stubEnv('LINE_IDENTITY_LINKING_ENABLED', 'true');
    const started = await startLineLink(post('/auth/line/link', {}));
    const attempt = proof(started);
    state.actor = '22222222-2222-4222-8222-222222222222';
    const completed = await finishLineLink(
      new Request(`${origin}/auth/line/link/callback?code=linked-code&authAttempt=${attempt.id}`, {
        headers: { cookie: attempt.cookie },
      }),
    );
    expect(location(completed).pathname).toBe('/login');
    expect(location(completed).searchParams.get('error')).toBe('auth-context');
    expect(attemptRows.get(attempt.id)?.stage).toBe('CONSUMED');
    expect(state.unlinkIdentity).toHaveBeenCalledWith(lineSuccess.data.user.identities[0]);
  });

  it('compensates a successful Supabase link when its EMAIL identity belongs to another user', async () => {
    vi.stubEnv('LINE_IDENTITY_LINKING_ENABLED', 'true');
    const started = await startLineLink(post('/auth/line/link', {}));
    const attempt = proof(started);
    state.identityOwner = '22222222-2222-4222-8222-222222222222';

    const completed = await finishLineLink(
      new Request(`${origin}/auth/line/link/callback?code=linked-code&authAttempt=${attempt.id}`, {
        headers: { cookie: attempt.cookie },
      }),
    );

    expect(location(completed).searchParams.get('error')).toBe('auth-context');
    expect(state.unlinkIdentity).toHaveBeenCalledWith(lineSuccess.data.user.identities[0]);
  });

  it('compensates when the LINE subject is already owned by another platform user', async () => {
    vi.stubEnv('LINE_IDENTITY_LINKING_ENABLED', 'true');
    const started = await startLineLink(post('/auth/line/link', {}));
    const attempt = proof(started);
    state.lineIdentityOwner = '22222222-2222-4222-8222-222222222222';

    const completed = await finishLineLink(
      new Request(`${origin}/auth/line/link/callback?code=linked-code&authAttempt=${attempt.id}`, {
        headers: { cookie: attempt.cookie },
      }),
    );

    expect(location(completed).searchParams.get('error')).toBe('line-link');
    expect(state.unlinkIdentity).toHaveBeenCalledWith(lineSuccess.data.user.identities[0]);
  });

  it('does not unlink if Supabase identity exchange did not succeed', async () => {
    vi.stubEnv('LINE_IDENTITY_LINKING_ENABLED', 'true');
    const started = await startLineLink(post('/auth/line/link', {}));
    const attempt = proof(started);
    state.exchange.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('exchange failed'),
    });

    const completed = await finishLineLink(
      new Request(`${origin}/auth/line/link/callback?code=linked-code&authAttempt=${attempt.id}`, {
        headers: { cookie: attempt.cookie },
      }),
    );

    expect(location(completed).searchParams.get('error')).toBe('line-link');
    expect(state.unlinkIdentity).not.toHaveBeenCalled();
  });

  it('logs a failed compensation with a hashed LINE subject and keeps the line-link error screen', async () => {
    vi.stubEnv('LINE_IDENTITY_LINKING_ENABLED', 'true');
    const started = await startLineLink(post('/auth/line/link', {}));
    const attempt = proof(started);
    state.actor = '22222222-2222-4222-8222-222222222222';
    state.unlinkIdentity.mockResolvedValueOnce({ error: { code: 'unlink_failed' } });

    const completed = await finishLineLink(
      new Request(`${origin}/auth/line/link/callback?code=linked-code&authAttempt=${attempt.id}`, {
        headers: { cookie: attempt.cookie },
      }),
    );

    expect(location(completed).searchParams.get('error')).toBe('line-link');
    expect(state.logError).toHaveBeenCalledWith(
      'line identity compensation failed',
      expect.objectContaining({ lineSubjectHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    );
    expect(JSON.stringify(state.logError.mock.calls)).not.toContain('U1234567890');
  });

  it('rejects missing proof, selectors and replay before calling the provider', async () => {
    const a = proof(await startLine(post('/auth/line', { returnTo: '/s/media/line' })));
    for (const [query, cookie] of [
      [`?code=code&authAttempt=${a.id}`, ''],
      ['?code=code', a.cookie],
    ]) {
      expect(
        location(
          await finishLine(
            new Request(`${origin}/auth/line/callback${query}`, {
              headers: { cookie: cookie ?? '' },
            }),
          ),
        ).searchParams.get('error'),
      ).toBe('auth-context');
    }
    expect(state.exchange).not.toHaveBeenCalled();
    await finishLine(
      new Request(`${origin}/auth/line/callback?code=code&authAttempt=${a.id}`, {
        headers: { cookie: a.cookie },
      }),
    );
    expect(state.exchange).toHaveBeenCalledTimes(1);
    await finishLine(
      new Request(`${origin}/auth/line/callback?code=code&authAttempt=${a.id}`, {
        headers: { cookie: a.cookie },
      }),
    );
    expect(state.exchange).toHaveBeenCalledTimes(1);
  });

  it('a losing callback cannot clear or cancel the winning callback', async () => {
    const a = proof(await startLine(post('/auth/line', { returnTo: '/s/media/line' })));
    let release!: (value: typeof lineSuccess) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    state.exchange.mockImplementation(() => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const request = () =>
      new Request(`${origin}/auth/line/callback?code=code&authAttempt=${a.id}`, {
        headers: { cookie: a.cookie },
      });
    const winning = finishLine(request());
    await started;
    const losing = await finishLine(request());
    expect((losing as NextResponse).cookies.get(a.name)).toBeUndefined();
    expect(attemptRows.get(a.id)?.stage).toBe('CLAIMED');
    release(lineSuccess);
    expect(location(await winning).pathname).toBe('/s/media/line');
    expect(state.exchange).toHaveBeenCalledTimes(1);
  });

  it('keeps email metadata through the landing form and refuses a different email before cookie commit', async () => {
    const a = proof(
      await startEmail(
        post('/auth/email', { email: 'member@example.com', returnTo: '/s/media/line' }),
      ),
    );
    const callback = new URL(`${origin}/auth/confirm?token_hash=token&type=email`);
    callback.searchParams.set(
      'redirect_to',
      `${origin}/auth/confirm?authAttempt=${a.id}&returnTo=%2Fs%2Ftraining%2Fhome`,
    );
    const landing = await emailLanding(new Request(callback));
    expect(location(landing).searchParams.get('authAttempt')).toBe(a.id);
    expect(location(landing).searchParams.get('returnTo')).toBe('/s/training/home');
    state.otp.mockResolvedValue({ data: { user: { email: 'other@example.com' } }, error: null });
    const response = await finishEmail(
      post('/auth/confirm', { token_hash: 'token', type: 'email', authAttempt: a.id }, a.cookie),
    );
    expect(location(response).searchParams.get('error')).toBe('auth-context');
    expect(location(response).searchParams.get('returnTo')).toBe('/s/media/line');
    expect(state.commit).not.toHaveBeenCalled();
    expect(attemptRows.get(a.id)?.stage).toBe('CONSUMED');
  });

  it('sends validated service navigation context with the email callback without changing the auth proof', async () => {
    const attempt = proof(
      await startEmail(
        post('/auth/email', {
          email: 'member@example.com',
          returnTo: '/s/manaberu-style/home',
        }),
      ),
    );
    const emailOptions = state.email.mock.calls[0]?.[0] as {
      options: { emailRedirectTo: string };
    };
    const callback = new URL(emailOptions.options.emailRedirectTo);

    expect(callback.pathname).toBe('/auth/confirm');
    expect(callback.searchParams.get('authAttempt')).toBe(attempt.id);
    expect(callback.searchParams.get('returnTo')).toBe('/s/manaberu-style/home');
    expect(attemptRows.get(attempt.id)?.returnPath).toBe('/s/manaberu-style/home');
  });

  it('returns legacy email auth to the service instead of the platform questionnaire', async () => {
    vi.stubEnv('AUTH_RETURN_ATTEMPTS_ENABLED', 'false');
    state.registrationStatus = 'IN_PROGRESS';
    const response = await finishEmail(
      post('/auth/confirm', {
        token_hash: 'token',
        type: 'email',
        returnTo: '/s/manaberu-style/home',
      }),
    );

    expect(location(response).pathname).toBe('/s/manaberu-style/home');
    expect(location(response).pathname).not.toBe('/onboarding');
  });

  it('exchanges a PKCE email callback code and returns legacy auth to the service', async () => {
    vi.stubEnv('AUTH_RETURN_ATTEMPTS_ENABLED', 'false');
    state.registrationStatus = 'IN_PROGRESS';
    state.exchange.mockResolvedValue({
      data: { user: { email: 'member@example.com' } },
      error: null,
    });

    const response = await emailLanding(
      new Request(`${origin}/auth/confirm?code=pkce-code&returnTo=%2Fs%2Fmanaberu-style`),
    );

    expect(state.exchange).toHaveBeenCalledWith('pkce-code');
    expect(location(response).pathname).toBe('/s/manaberu-style');
    expect(location(response).pathname).not.toBe('/onboarding');
  });

  it('completes a PKCE email callback within its auth attempt and preserves the service', async () => {
    const a = proof(
      await startEmail(
        post('/auth/email', { email: 'member@example.com', returnTo: '/s/manaberu-style/home' }),
      ),
    );
    state.exchange.mockResolvedValue({
      data: { user: { email: 'member@example.com' } },
      error: null,
    });

    const response = await emailLanding(
      new Request(
        `${origin}/auth/confirm?code=pkce-code&authAttempt=${a.id}&returnTo=%2Fs%2Fmanaberu-style%2Fhome`,
        { headers: { cookie: a.cookie } },
      ),
    );

    expect(state.exchange).toHaveBeenCalledWith('pkce-code');
    expect(location(response).pathname).toBe('/s/manaberu-style/home');
    expect(attemptRows.get(a.id)?.stage).toBe('CONSUMED');
  });

  it('explains a different email browser and keeps the service on the retry screen', async () => {
    const a = proof(
      await startEmail(
        post('/auth/email', {
          email: 'member@example.com',
          returnTo: '/s/manaberu-style/home',
        }),
      ),
    );
    const response = await finishEmail(
      post('/auth/confirm', {
        token_hash: 'token',
        type: 'email',
        authAttempt: a.id,
        returnTo: '/s/manaberu-style/home',
      }),
    );

    expect(location(response).searchParams.get('error')).toBe('auth-context');
    expect(location(response).searchParams.get('returnTo')).toBe('/s/manaberu-style/home');
    expect(state.otp).not.toHaveBeenCalled();
    expect(attemptRows.get(a.id)?.stage).toBe('PENDING');
  });

  it('continues email consent only as the authenticated actor and preserves the project', async () => {
    const a = proof(
      await startEmail(
        post('/auth/email', { email: 'member@example.com', returnTo: '/s/media/line' }),
      ),
    );
    state.required = true;
    const response = await finishEmail(
      post('/auth/confirm', { token_hash: 'token', type: 'email', authAttempt: a.id }, a.cookie),
    );
    expect(location(response).pathname).toBe('/consent');
    expect(location(response).searchParams.get('authAttempt')).toBe(a.id);
    const original = state.actor;
    state.actor = '22222222-2222-4222-8222-222222222222';
    const bad = await acceptConsent(
      post('/consent/accept', { authAttempt: a.id, documentId: 'terms' }, a.cookie),
    );
    expect(location(bad).searchParams.get('error')).toBe('auth-context');
    expect(state.accept).not.toHaveBeenCalled();
    state.actor = original;
    const good = await acceptConsent(
      post('/consent/accept', { authAttempt: a.id, documentId: 'terms' }, a.cookie),
    );
    expect(location(good).pathname).toBe('/s/media/line');
    expect(state.accept).toHaveBeenCalledTimes(1);
  });

  it('returns an already-consented page to its project and rejects actor changes before consuming', async () => {
    const a = proof(
      await startEmail(
        post('/auth/email', { email: 'member@example.com', returnTo: '/s/media/line' }),
      ),
    );
    state.required = true;
    await finishEmail(
      post('/auth/confirm', { token_hash: 'token', type: 'email', authAttempt: a.id }, a.cookie),
    );
    state.cookie = a.cookie;
    const original = state.actor;
    state.actor = '22222222-2222-4222-8222-222222222222';
    await expect(
      ConsentPage({ searchParams: Promise.resolve({ authAttempt: a.id }) }),
    ).rejects.toThrow('REDIRECT:/login?error=auth-context');
    expect(attemptRows.get(a.id)?.stage).toBe('AUTHENTICATED');
    state.actor = original;
    await expect(
      ConsentPage({ searchParams: Promise.resolve({ authAttempt: a.id }) }),
    ).rejects.toThrow('REDIRECT:/s/media/line');
    expect(attemptRows.get(a.id)?.stage).toBe('CONSUMED');
  });

  it('shows a restart for a consent-page consume race but does not hide database errors', async () => {
    const a = proof(
      await startEmail(
        post('/auth/email', { email: 'member@example.com', returnTo: '/s/media/line' }),
      ),
    );
    state.required = true;
    await finishEmail(
      post('/auth/confirm', { token_hash: 'token', type: 'email', authAttempt: a.id }, a.cookie),
    );
    state.cookie = a.cookie;
    attemptTable.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      ConsentPage({ searchParams: Promise.resolve({ authAttempt: a.id }) }),
    ).rejects.toThrow('REDIRECT:/login?error=auth-context');
    attemptTable.updateMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      ConsentPage({ searchParams: Promise.resolve({ authAttempt: a.id }) }),
    ).rejects.toThrow('database unavailable');
  });
});
