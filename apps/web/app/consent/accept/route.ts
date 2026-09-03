import { AcceptRequiredLegalConsents } from '@bunshin/application';
import { NextResponse } from 'next/server';
import { currentUserProvider } from '../../../src/auth/current-user';
import { requireSameOrigin } from '../../../src/auth/request-security';
import { LINE_AUTH_RETURN_COOKIE, lineAuthReturnFromCookie } from '../../../src/auth/line-return';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) return NextResponse.redirect(new URL('/login', request.url), 303);
    const values = (await request.formData()).getAll('documentId');
    if (values.some((value) => typeof value !== 'string')) throw new Error('invalid consent');
    const db = await import('@bunshin/database');
    await new AcceptRequiredLegalConsents(new db.PrismaLegalConsentRepository()).execute({
      userId: user.userId,
      documentIds: values as string[],
    });
    const returnTo = lineAuthReturnFromCookie(request.headers.get('cookie'));
    const registration = await db.prisma.userRegistrationProfile.findUnique({
      where: { userId: user.userId },
      select: { status: true },
    });
    const destination =
      registration?.status === 'COMPLETED'
        ? new URL(returnTo ?? '/bunshins', request.url)
        : new URL('/onboarding', request.url);
    if (registration?.status !== 'COMPLETED' && returnTo)
      destination.searchParams.set('returnTo', returnTo);
    const response = NextResponse.redirect(destination, 303);
    response.cookies.set(LINE_AUTH_RETURN_COOKIE, '', { maxAge: 0, path: '/' });
    return response;
  } catch {
    return NextResponse.redirect(new URL('/consent?error=1', request.url), 303);
  }
}
