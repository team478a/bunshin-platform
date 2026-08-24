import { getServerEnvironment } from '@bunshin/config';
import { NextResponse } from 'next/server';
import { requireSameOrigin } from '../../../src/auth/request-security';
import {
  LINE_AUTH_RETURN_COOKIE,
  LINE_AUTH_RETURN_MAX_AGE_SECONDS,
  safeLineAuthReturnPath,
} from '../../../src/auth/line-return';
import { createSupabaseServerClient } from '../../../src/auth/supabase';

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const environment = getServerEnvironment();
    const contentType = request.headers.get('content-type') ?? '';
    const form = contentType.includes('application/x-www-form-urlencoded')
      ? await request.formData()
      : null;
    const returnValue = form?.get('returnTo');
    const returnTo = safeLineAuthReturnPath(typeof returnValue === 'string' ? returnValue : null);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'custom:line',
      options: {
        redirectTo: `${environment.APP_URL}/auth/line/callback`,
        scopes: 'openid profile',
      },
    });
    if (error !== null || !data.url) throw error ?? new Error('LINE authorization URL unavailable');
    const response = NextResponse.redirect(data.url, 303);
    if (returnTo) {
      response.cookies.set(LINE_AUTH_RETURN_COOKIE, returnTo, {
        httpOnly: true,
        sameSite: 'lax',
        secure: new URL(environment.APP_URL).protocol === 'https:',
        maxAge: LINE_AUTH_RETURN_MAX_AGE_SECONDS,
        path: '/',
      });
    }
    return response;
  } catch {
    return NextResponse.redirect(new URL('/login?error=1', request.url), 303);
  }
}
