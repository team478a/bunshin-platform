import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  set: vi.fn(),
  adapter: null as null | {
    getAll: () => unknown[];
    setAll: (values: Array<{ name: string; value: string; options?: object }>) => void;
  },
}));

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ getAll: () => [], set: state.set }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url, _key, options) => {
    state.adapter = options.cookies;
    return { auth: {} };
  }),
}));

import { createSupabaseServerClient, createSupabaseAttemptClient } from '../src/auth/supabase';

describe('Supabase server cookie adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.set.mockReset();
    state.adapter = null;
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://bunshin.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-key-with-safe-length');
  });

  it('expires every native PKCE slot after ten minutes without changing session cookies', async () => {
    await createSupabaseServerClient();
    state.adapter?.setAll([
      {
        name: 'sb-project-auth-token-flow-12345678-code-verifier',
        value: 'proof',
        options: { maxAge: 86400 },
      },
      {
        name: 'sb-project-auth-token-flows-code-verifier.0',
        value: '',
        options: { maxAge: 86400 },
      },
      { name: 'session', value: 'new', options: { maxAge: 86400 } },
    ]);
    expect(state.set).toHaveBeenCalledWith(
      'sb-project-auth-token-flow-12345678-code-verifier',
      'proof',
      expect.objectContaining({ maxAge: 600, httpOnly: true, sameSite: 'lax', secure: true }),
    );
    expect(state.set).toHaveBeenCalledWith(
      'sb-project-auth-token-flows-code-verifier.0',
      '',
      expect.objectContaining({ maxAge: 0 }),
    );
    expect(state.set).toHaveBeenCalledWith('session', 'new', { maxAge: 86400 });
  });

  it('does not persist an unverified session until an explicit commit', async () => {
    const buffered = await createSupabaseAttemptClient();
    state.adapter?.setAll([{ name: 'session', value: 'candidate' }]);
    expect(state.set).not.toHaveBeenCalled();
    await buffered.commitCookies();
    expect(state.set).toHaveBeenCalledTimes(1);
    await buffered.commitCookies();
    expect(state.set).toHaveBeenCalledTimes(1);
  });

  it('keeps development HTTP PKCE cookies usable without weakening HTTPS cookies', async () => {
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    await createSupabaseServerClient();
    state.adapter?.setAll([
      { name: 'sb-project-auth-token-flow-12345678-code-verifier', value: 'proof' },
    ]);
    expect(state.set).toHaveBeenCalledWith(
      'sb-project-auth-token-flow-12345678-code-verifier',
      'proof',
      expect.objectContaining({ maxAge: 600, httpOnly: true, secure: false }),
    );
  });

  it('does not hide commit failures in route handlers', async () => {
    const buffered = await createSupabaseAttemptClient();
    state.adapter?.setAll([{ name: 'session', value: 'candidate' }]);
    state.set.mockImplementation(() => {
      throw new Error('write unavailable');
    });
    await expect(buffered.commitCookies()).rejects.toThrow('write unavailable');
  });

  it('Route Handlerでは更新された認証Cookieを保存する', async () => {
    await createSupabaseServerClient();
    state.adapter?.setAll([{ name: 'session', value: 'updated', options: { httpOnly: true } }]);
    expect(state.set).toHaveBeenCalledWith('session', 'updated', { httpOnly: true });
  });

  it('Server Componentの読み取り中はCookie書込制限で画面を500にしない', async () => {
    state.set.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler');
    });
    await createSupabaseServerClient();
    expect(() => state.adapter?.setAll([{ name: 'session', value: 'updated' }])).not.toThrow();
  });
});
