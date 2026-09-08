import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  requiredConsents: [] as Array<{ consentedAt: Date | null }>,
  registrationStatus: 'COMPLETED',
  connect: vi.fn(),
  identityCreate: vi.fn(),
  verifyOtp: vi.fn(),
  acceptConsents: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://bunshin.example', APP_ENV: 'development' }),
}));
vi.mock('@bunshin/application', () => ({
  AcceptRequiredLegalConsents: class {
    execute = state.acceptConsents;
  },
  ConnectLineMessagingAccount: class {
    execute = state.connect;
  },
}));
vi.mock('../src/auth/supabase', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        signInWithOAuth: state.signInWithOAuth,
        exchangeCodeForSession: state.exchangeCodeForSession,
        verifyOtp: state.verifyOtp,
      },
    }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve({ userId: 'user-1' }) }),
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    $transaction: (operation: (tx: object) => Promise<unknown>) =>
      operation({
        authIdentity: {
          findUnique: () => Promise.resolve(null),
          create: state.identityCreate,
        },
      }),
    userRegistrationProfile: {
      findUnique: () =>
        Promise.resolve(
          state.registrationStatus === null ? null : { status: state.registrationStatus },
        ),
    },
    registrationFunnelEvent: {
      upsert: () => Promise.resolve({ id: 'event-1' }),
    },
  },
  listActiveWorkspacesForUser: () => Promise.resolve([{ id: 'workspace-1', name: 'Personal' }]),
  PrismaLineConnectionRepository: class {},
  PrismaLegalConsentRepository: class {
    findRequiredForUser() {
      return Promise.resolve(state.requiredConsents);
    }
  },
}));

import { GET as completeLineLogin } from '../app/auth/line/callback/route';
import { POST as startLineLogin } from '../app/auth/line/route';
import { POST as completeEmailLogin } from '../app/auth/confirm/route';
import { POST as acceptConsents } from '../app/consent/accept/route';

describe('LINE login routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.requiredConsents = [];
    state.registrationStatus = 'COMPLETED';
    state.verifyOtp.mockResolvedValue({ error: null });
    state.acceptConsents.mockResolvedValue(undefined);
    state.connect.mockResolvedValue({ id: 'connection-1' });
    state.identityCreate.mockResolvedValue({ id: 'identity-1' });
    state.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://access.line.me/oauth2/v2.1/authorize?state=opaque' },
      error: null,
    });
    state.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: {
          identities: [
            {
              id: 'line-identity',
              provider: 'custom:line',
              identity_data: { sub: 'U1234567890' },
            },
          ],
        },
      },
      error: null,
    });
  });

  it('starts custom:line OAuth with the production application callback', async () => {
    const response = await startLineLogin(
      new Request('https://bunshin.example/auth/line', {
        method: 'POST',
        headers: { origin: 'https://bunshin.example' },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('https://access.line.me/');
    expect(state.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'custom:line',
      options: {
        redirectTo: 'https://bunshin.example/auth/line/callback',
        scopes: 'openid profile',
      },
    });
  });

  it('stores only an allowed Mission return path in a short-lived secure cookie', async () => {
    const response = await startLineLogin(
      new Request('https://bunshin.example/auth/line', {
        method: 'POST',
        headers: {
          origin: 'https://bunshin.example',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ returnTo: '/today?state=mission-token' }),
      }),
    );

    expect(response.headers.get('set-cookie')).toContain('bunshin_line_auth_return=');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('Secure');
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax');
  });

  it('does not store an external return URL', async () => {
    const response = await startLineLogin(
      new Request('https://bunshin.example/auth/line', {
        method: 'POST',
        headers: {
          origin: 'https://bunshin.example',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ returnTo: 'https://evil.example/today?state=stolen' }),
      }),
    );

    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('exchanges a valid callback code and enters the application', async () => {
    const response = await completeLineLogin(
      new Request('https://bunshin.example/auth/line/callback?code=one-time-code'),
    );

    expect(state.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://bunshin.example/bunshins');
    expect(state.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        verifiedProviderUserId: 'U1234567890',
        consentGranted: false,
      }),
    );
  });

  it('sends an incomplete account to the resumable onboarding flow', async () => {
    state.registrationStatus = 'IN_PROGRESS';
    const response = await completeLineLogin(
      new Request('https://bunshin.example/auth/line/callback?code=one-time-code'),
    );

    expect(response.headers.get('location')).toBe('https://bunshin.example/onboarding');
  });

  const videoPath = '/video-access/11111111-1111-4111-8111-111111111111';
  const returnCookie = `bunshin_line_auth_return=${encodeURIComponent(videoPath)}`;
  const callbackRequest = () =>
    new Request('https://bunshin.example/auth/line/callback?code=one-time-code', {
      headers: { cookie: returnCookie },
    });
  const emailRequest = () =>
    new Request('https://bunshin.example/auth/confirm', {
      method: 'POST',
      headers: { origin: 'https://bunshin.example', cookie: returnCookie },
      body: new URLSearchParams({ token_hash: 'valid-token', type: 'email' }),
    });

  it('returns incomplete LINE accounts to the protected viewer without requiring industry setup', async () => {
    state.registrationStatus = 'IN_PROGRESS';
    const response = await completeLineLogin(callbackRequest());
    expect(response.headers.get('location')).toBe(`https://bunshin.example${videoPath}`);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('returns incomplete email accounts to the protected viewer', async () => {
    state.registrationStatus = 'IN_PROGRESS';
    const response = await completeEmailLogin(emailRequest());
    expect(response.headers.get('location')).toBe(`https://bunshin.example${videoPath}`);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('preserves required legal consent and the video return cookie for both login methods', async () => {
    state.registrationStatus = 'IN_PROGRESS';
    state.requiredConsents = [{ consentedAt: null }];
    for (const response of [
      await completeLineLogin(callbackRequest()),
      await completeEmailLogin(emailRequest()),
    ]) {
      expect(response.headers.get('location')).toBe('https://bunshin.example/consent');
      expect(response.headers.get('set-cookie')).toBeNull();
    }
  });

  it('returns to the protected viewer after consent without forcing industry setup', async () => {
    state.registrationStatus = 'IN_PROGRESS';
    const response = await acceptConsents(
      new Request('https://bunshin.example/consent/accept', {
        method: 'POST',
        headers: { origin: 'https://bunshin.example', cookie: returnCookie },
        body: new URLSearchParams({ documentId: 'required-document' }),
      }),
    );
    expect(state.acceptConsents).toHaveBeenCalledWith({
      userId: 'user-1',
      documentIds: ['required-document'],
    });
    expect(response.headers.get('location')).toBe(`https://bunshin.example${videoPath}`);
  });

  it('returns to the Mission landing after successful authentication', async () => {
    const response = await completeLineLogin(
      new Request('https://bunshin.example/auth/line/callback?code=one-time-code', {
        headers: {
          cookie: `bunshin_line_auth_return=${encodeURIComponent('/today?state=mission-token')}`,
        },
      }),
    );

    expect(response.headers.get('location')).toBe(
      'https://bunshin.example/today?state=mission-token',
    );
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('rejects provider errors without exchanging a session', async () => {
    const response = await completeLineLogin(
      new Request('https://bunshin.example/auth/line/callback?error=access_denied'),
    );

    expect(state.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://bunshin.example/login?error=1');
  });
});
