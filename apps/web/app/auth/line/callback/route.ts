import { NextResponse } from 'next/server';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { createSupabaseServerClient } from '../../../../src/auth/supabase';
import {
  LINE_AUTH_RETURN_COOKIE,
  lineAuthReturnFromCookie,
} from '../../../../src/auth/line-return';

function clearReturnCookie(response: NextResponse): NextResponse {
  response.cookies.set(LINE_AUTH_RETURN_COOKIE, '', { maxAge: 0, path: '/' });
  return response;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const returnTo = lineAuthReturnFromCookie(request.headers.get('cookie'));
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
    return clearReturnCookie(
      NextResponse.redirect(new URL(returnTo ?? '/bunshins', request.url), 303),
    );
  } catch {
    return clearReturnCookie(NextResponse.redirect(new URL('/login?error=1', request.url), 303));
  }
}
