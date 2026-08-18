import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { ApplicationError } from '@bunshin/shared';

function authConfiguration(): { url: string; key: string } {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (url === undefined || key === undefined) {
    throw new ApplicationError('CONFIGURATION_ERROR', 'Authentication is not configured');
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
        for (const { name, value, options } of values) store.set(name, value, options);
      },
    },
  });
}
