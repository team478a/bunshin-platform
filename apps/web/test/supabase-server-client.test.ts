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

import { createSupabaseServerClient } from '../src/auth/supabase';

describe('Supabase server cookie adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.adapter = null;
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-key-with-safe-length');
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
