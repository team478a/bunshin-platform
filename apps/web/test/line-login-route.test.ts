import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  requiredConsents: [] as Array<{ consentedAt: Date | null }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://bunshin.example' }),
}));
vi.mock('../src/auth/supabase', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        signInWithOAuth: state.signInWithOAuth,
        exchangeCodeForSession: state.exchangeCodeForSession,
      },
    }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve({ userId: 'user-1' }) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaLegalConsentRepository: class {
    findRequiredForUser() {
      return Promise.resolve(state.requiredConsents);
    }
  },
}));

import { GET as completeLineLogin } from '../app/auth/line/callback/route';
import { POST as startLineLogin } from '../app/auth/line/route';

describe('LINE login routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.requiredConsents = [];
    state.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://access.line.me/oauth2/v2.1/authorize?state=opaque' },
      error: null,
    });
    state.exchangeCodeForSession.mockResolvedValue({ error: null });
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

  it('exchanges a valid callback code and enters the application', async () => {
    const response = await completeLineLogin(
      new Request('https://bunshin.example/auth/line/callback?code=one-time-code'),
    );

    expect(state.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://bunshin.example/bunshins');
  });

  it('rejects provider errors without exchanging a session', async () => {
    const response = await completeLineLogin(
      new Request('https://bunshin.example/auth/line/callback?error=access_denied'),
    );

    expect(state.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://bunshin.example/login?error=1');
  });
});
