import { getServerEnvironment } from '@bunshin/config';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin, trustedRequestOrigin } from '../../../src/auth/request-security';
import {
  LINE_AUTH_RETURN_COOKIE,
  LINE_AUTH_RETURN_MAX_AGE_SECONDS,
  safeLineAuthReturnPath,
} from '../../../src/auth/line-return';
import { createSupabaseServerClient } from '../../../src/auth/supabase';
import { loginErrorResponse } from '../../../src/auth/login-error';

const inputSchema = z.object({ email: z.email().max(320) });

export async function POST(request: Request): Promise<Response> {
  let returnTo: string | null = null;
  try {
    requireSameOrigin(request);
    const form = await request.formData();
    const returnValue = form.get('returnTo');
    returnTo = safeLineAuthReturnPath(typeof returnValue === 'string' ? returnValue : null);
    const input = inputSchema.safeParse(Object.fromEntries(form));
    if (!input.success) return loginErrorResponse(request, '1', returnTo);
    const supabase = await createSupabaseServerClient();
    const environment = getServerEnvironment();
    const { error } = await supabase.auth.signInWithOtp({
      email: input.data.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${trustedRequestOrigin(request)}/auth/confirm`,
      },
    });
    if (error) {
      const rateLimited = error.status === 429 || error.code === 'over_email_send_rate_limit';
      return loginErrorResponse(request, rateLimited ? 'rate-limit' : 'email', returnTo);
    }
    const sentUrl = new URL('/login?sent=1', request.url);
    if (returnTo) sentUrl.searchParams.set('returnTo', returnTo);
    const response = NextResponse.redirect(sentUrl, 303);
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
