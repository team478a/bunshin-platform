import { getServerEnvironment } from '@bunshin/config';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin } from '../../../src/auth/request-security';
import { createSupabaseServerClient } from '../../../src/auth/supabase';

const inputSchema = z.object({ email: z.email().max(320) });

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const input = inputSchema.safeParse(Object.fromEntries(await request.formData()));
    if (!input.success) return NextResponse.redirect(new URL('/login?error=1', request.url), 303);
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
    return NextResponse.redirect(new URL('/login?sent=1', request.url), 303);
  } catch {
    return NextResponse.redirect(new URL('/login?error=1', request.url), 303);
  }
}
