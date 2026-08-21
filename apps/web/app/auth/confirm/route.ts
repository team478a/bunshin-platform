import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUserProvider } from '../../../src/auth/current-user';
import { requireSameOrigin } from '../../../src/auth/request-security';
import { createSupabaseServerClient } from '../../../src/auth/supabase';

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (tokenHash === null || !/^[A-Za-z0-9_-]+$/.test(tokenHash) || type !== 'email') {
    return NextResponse.redirect(new URL('/login?error=1', request.url), 303);
  }
  const body = `<!doctype html><html lang="ja"><body><main><h1>ログイン確認</h1><p>このブラウザでBUNSHINへログインします。</p><form method="post"><input type="hidden" name="token_hash" value="${tokenHash}"><input type="hidden" name="type" value="email"><button type="submit">ログインする</button></form></main></body></html>`;
  return new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const data = await request.formData();
    const tokenHash = data.get('token_hash');
    const type = data.get('type');
    if (typeof tokenHash !== 'string' || !/^[A-Za-z0-9_-]+$/.test(tokenHash) || type !== 'email')
      throw new Error('invalid callback');
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error !== null) throw error;
    const currentUser = await (await currentUserProvider()).getCurrentUser();
    if (currentUser === null) throw new Error('user unavailable');
    const { PrismaLegalConsentRepository } = await import('@bunshin/database');
    const required = await new PrismaLegalConsentRepository().findRequiredForUser(
      currentUser.userId,
    );
    if (required.some((item) => !item.consentedAt))
      return NextResponse.redirect(new URL('/consent', request.url), 303);
    return NextResponse.redirect(new URL('/bunshins', request.url), 303);
  } catch {
    return NextResponse.redirect(new URL('/login?error=1', request.url), 303);
  }
}
