import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { ApplicationError } from '@bunshin/shared';

export function authConfiguration(): { url: string; key: string } {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (url === undefined || key === undefined || !url.trim() || !key.trim()) {
    throw new ApplicationError('CONFIGURATION_ERROR', 'Authentication is not configured');
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApplicationError('CONFIGURATION_ERROR', 'Authentication configuration is invalid');
  }
  const environment = process.env['APP_ENV'] ?? 'development';
  const localhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.protocol !== 'https:' && !(environment === 'development' && localhost)) ||
    (localhost && environment !== 'development') ||
    key.trim().length < 20
  ) {
    throw new ApplicationError('CONFIGURATION_ERROR', 'Authentication configuration is invalid');
  }
  return { url, key };
}

interface CookieWrite {
  name: string;
  value: string;
  options?: CookieOptions;
}

export async function createSupabaseServerClient(pendingCookies?: CookieWrite[]) {
  const { url, key } = authConfiguration();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        const writes = values.map(({ name, value, options }) => ({
          name,
          value,
          options: /-code-verifier(?:\.\d+)?$/.test(name)
            ? {
                ...options,
                maxAge: value ? 600 : 0,
                httpOnly: true,
                sameSite: 'lax' as const,
                secure: new URL(process.env['APP_URL'] ?? url).protocol === 'https:',
              }
            : options,
        }));
        if (pendingCookies) {
          pendingCookies.push(...writes);
          return;
        }
        try {
          for (const { name, value, options } of writes) store.set(name, value, options);
        } catch {
          // Server Components cannot write cookies. The refreshed credentials remain
          // valid for this request; Route Handlers can still persist them normally.
        }
      },
    },
  });
}

/** Do not persist a new session until the attempt and intended identity are verified. */
export async function createSupabaseAttemptClient() {
  const pending: CookieWrite[] = [];
  const client = await createSupabaseServerClient(pending);
  return {
    client,
    commitCookies: async () => {
      const store = await cookies();
      for (const { name, value, options } of pending) store.set(name, value, options ?? {});
      pending.length = 0;
    },
  };
}
