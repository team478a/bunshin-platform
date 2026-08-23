import { NextResponse } from 'next/server';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { createSupabaseServerClient } from '../../../../src/auth/supabase';

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (url.searchParams.has('error') || code === null || code.length > 2048)
      throw new Error('LINE callback rejected');

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
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
