import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attemptRows, attemptTable } from './fixtures/auth-attempt-table';
const state = vi.hoisted(() => ({
  oauth: vi.fn(),
  exchange: vi.fn(),
  otp: vi.fn(),
  email: vi.fn(),
  commit: vi.fn(),
  accept: vi.fn(),
  actor: '11111111-1111-4111-8111-111111111111',
  required: false,
  cookie: '',
}));
vi.mock('server-only', () => ({}));
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
    $transaction: async (operation: (tx: object) => Promise<unknown>) =>
      operation({
        authIdentity: {
          findUnique: () => Promise.resolve(null),
          create: () => Promise.resolve({}),
        },
      }),
    userRegistrationProfile: { findUnique: () => Promise.resolve({ status: 'COMPLETED' }) },
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
      identities: [
        { id: 'line-identity', provider: 'custom:line', identity_data: { sub: 'U1234567890' } },
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
    state.actor = '11111111-1111-4111-8111-111111111111';
    state.required = false;
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
    state.exchange.mockResolvedValue(lineSuccess);
    state.email.mockResolvedValue({ error: null });
    state.otp.mockResolvedValue({ data: { user: { email: 'member@example.com' } }, error: null });
    state.commit.mockResolvedValue(undefined);
    state.accept.mockResolvedValue(undefined);
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
    callback.searchParams.set('redirect_to', `${origin}/auth/confirm?authAttempt=${a.id}`);
    expect(location(emailLanding(new Request(callback))).searchParams.get('authAttempt')).toBe(
      a.id,
    );
    state.otp.mockResolvedValue({ data: { user: { email: 'other@example.com' } }, error: null });
    const response = await finishEmail(
      post('/auth/confirm', { token_hash: 'token', type: 'email', authAttempt: a.id }, a.cookie),
    );
    expect(location(response).searchParams.get('error')).toBe('auth-context');
    expect(location(response).searchParams.get('returnTo')).toBe('/s/media/line');
    expect(state.commit).not.toHaveBeenCalled();
    expect(attemptRows.get(a.id)?.stage).toBe('CONSUMED');
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
