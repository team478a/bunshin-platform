import { getServerEnvironment } from '@bunshin/config';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../src/auth/request-security';
import {
  LINE_AUTH_RETURN_COOKIE,
  LINE_AUTH_RETURN_MAX_AGE_SECONDS,
  safeLineAuthReturnPath,
} from '../../../src/auth/line-return';
import { createSupabaseServerClient } from '../../../src/auth/supabase';

const inputSchema = z.object({ email: z.email().max(320) });

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const form = await request.formData();
    const input = inputSchema.safeParse(Object.fromEntries(form));
    if (!input.success) return NextResponse.redirect(new URL('/login?error=1', request.url), 303);
    const returnValue = form.get('returnTo');
    const returnTo = safeLineAuthReturnPath(typeof returnValue === 'string' ? returnValue : null);
    const supabase = await createSupabaseServerClient();
    const environment = getServerEnvironment();
    const { error } = await supabase.auth.signInWithOtp({
      email: input.data.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${environment.APP_URL}/auth/confirm`,
      },
    });
    if (error) {
      const rateLimited = error.status === 429 || error.code === 'over_email_send_rate_limit';
      return NextResponse.redirect(
        new URL(`/login?error=${rateLimited ? 'rate-limit' : 'email'}`, request.url),
        303,
      );
    }
    const response = NextResponse.redirect(new URL('/login?sent=1', request.url), 303);
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
