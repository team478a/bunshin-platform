import { getServerEnvironment } from '@bunshin/config';
import { NextResponse } from 'next/server';
import { requireSameOrigin } from '../../../src/auth/request-security';
import { createSupabaseServerClient } from '../../../src/auth/supabase';

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const environment = getServerEnvironment();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'custom:line',
      options: {
        redirectTo: `${environment.APP_URL}/auth/line/callback`,
        scopes: 'openid profile',
      },
    });
    if (error !== null || !data.url) throw error ?? new Error('LINE authorization URL unavailable');
    return NextResponse.redirect(data.url, 303);
  } catch {
    return NextResponse.redirect(new URL('/login?error=1', request.url), 303);
  }
}
