import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
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

export async function createSupabaseServerClient() {
  const { url, key } = authConfiguration();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          for (const { name, value, options } of values) store.set(name, value, options);
        } catch {
          // Server Components cannot write cookies. The refreshed credentials remain
          // valid for this request; Route Handlers can still persist them normally.
        }
      },
    },
  });
}
