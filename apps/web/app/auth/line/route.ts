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
import {
  authReturnAttemptsEnabled,
  createAuthReturnAttempt,
  attachAuthAttemptCookie,
  attemptCallbackUrl,
  setAuthAttemptPkceFlow,
  cancelAuthReturnAttempt,
  clearAuthReturnCookie,
  AuthReturnContextError,
  type NewAuthReturnAttempt,
} from '../../../src/auth/auth-return-attempt';

export async function POST(request: Request): Promise<Response> {
  let returnTo: string | null = null;
  let context: NewAuthReturnAttempt | null = null;
  try {
    requireSameOrigin(request);
    const environment = getServerEnvironment();
    const contentType = request.headers.get('content-type') ?? '';
    const form = contentType.includes('application/x-www-form-urlencoded')
      ? await request.formData()
      : null;
    const returnValue = form?.get('returnTo');
    returnTo = safeLineAuthReturnPath(typeof returnValue === 'string' ? returnValue : null);
    if (authReturnAttemptsEnabled() && returnValue && !returnTo) throw new AuthReturnContextError();
    if (authReturnAttemptsEnabled())
      context = await createAuthReturnAttempt(request, 'LINE', returnTo);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'custom:line',
      options: {
        redirectTo: context
          ? attemptCallbackUrl(context.attempt.origin, '/auth/line/callback', context)
          : `${trustedRequestOrigin(request)}/auth/line/callback`,
        scopes: 'openid profile',
        queryParams: { bot_prompt: 'aggressive' },
      },
    });
    if (error !== null || !data.url) throw error ?? new Error('LINE authorization URL unavailable');
    const response = NextResponse.redirect(data.url, 303);
    if (context) {
      await setAuthAttemptPkceFlow(context, data.flowId);
      return attachAuthAttemptCookie(response, context);
    }
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
    await cancelAuthReturnAttempt(context);
    return clearAuthReturnCookie(
      loginErrorResponse(request, authReturnAttemptsEnabled() ? 'auth-context' : '1', returnTo),
      context,
    );
  }
}
