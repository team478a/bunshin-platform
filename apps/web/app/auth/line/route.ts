import { getServerEnvironment } from '@bunshin/config';
import { NextResponse } from 'next/server';
import { requireSameOrigin, trustedRequestOrigin } from '../../../src/auth/request-security';
import {
  LINE_AUTH_RETURN_COOKIE,
  LINE_AUTH_RETURN_MAX_AGE_SECONDS,
  safeLineAuthReturnPath,
} from '../../../src/auth/line-return';
import { createSupabaseServerClient } from '../../../src/auth/supabase';
import { loginErrorResponse } from '../../../src/auth/login-error';

export async function POST(request: Request): Promise<Response> {
  let returnTo: string | null = null;
  try {
    requireSameOrigin(request);
    const environment = getServerEnvironment();
    const contentType = request.headers.get('content-type') ?? '';
    const form = contentType.includes('application/x-www-form-urlencoded')
      ? await request.formData()
      : null;
    const returnValue = form?.get('returnTo');
    returnTo = safeLineAuthReturnPath(typeof returnValue === 'string' ? returnValue : null);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'custom:line',
      options: {
        redirectTo: `${trustedRequestOrigin(request)}/auth/line/callback`,
        scopes: 'openid profile',
        queryParams: { bot_prompt: 'aggressive' },
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
    } else {
      response.cookies.set(LINE_AUTH_RETURN_COOKIE, '', { maxAge: 0, path: '/' });
    }
    return response;
  } catch {
    return loginErrorResponse(request, '1', returnTo);
  }
}
