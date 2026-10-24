import { AcceptRequiredLegalConsents } from '@bunshin/application';
import { NextResponse } from 'next/server';
import { currentUserProvider } from '../../../src/auth/current-user';
import { requireSameOrigin } from '../../../src/auth/request-security';
import {
  singleAuthAttemptId,
  readAuthReturnContext,
  consumeAuthReturnAttempt,
  clearAuthReturnCookie,
  authReturnDestination,
  authConsentPath,
  authReturnAttemptsEnabled,
  AuthReturnContextError,
  type AuthReturnContext,
} from '../../../src/auth/auth-return-attempt';
import { loginErrorResponse } from '../../../src/auth/login-error';
import { safeLineAuthReturnPath } from '../../../src/auth/line-return';

export async function POST(request: Request) {
  let context: AuthReturnContext | null = null;
  let legacyReturnTo: string | null = null;
  try {
    requireSameOrigin(request);
    const form = await request.formData();
    const submittedReturnTo = form.get('returnTo');
    const candidateReturnTo =
      typeof submittedReturnTo === 'string' ? safeLineAuthReturnPath(submittedReturnTo) : null;
    if (submittedReturnTo !== null && (!candidateReturnTo || authReturnAttemptsEnabled()))
      throw new AuthReturnContextError();
    legacyReturnTo = candidateReturnTo;
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user)
      return NextResponse.redirect(
        new URL(
          legacyReturnTo ? `/login?returnTo=${encodeURIComponent(legacyReturnTo)}` : '/login',
          request.url,
        ),
        303,
      );
    context = await readAuthReturnContext(
      request,
      singleAuthAttemptId(form.getAll('authAttempt')),
      { actorUserId: user.userId, allowUnscoped: true },
    );
    const values = form.getAll('documentId');
    if (values.some((value) => typeof value !== 'string')) throw new Error('invalid consent');
    const db = await import('@bunshin/database');
    await new AcceptRequiredLegalConsents(new db.PrismaLegalConsentRepository()).execute({
      userId: user.userId,
      documentIds: values as string[],
    });
    const registration = await db.prisma.userRegistrationProfile.findUnique({
      where: { userId: user.userId },
      select: { status: true },
    });
    await consumeAuthReturnAttempt(context, user.userId);
    return clearAuthReturnCookie(
      NextResponse.redirect(
        new URL(authReturnDestination(context, registration?.status, legacyReturnTo), request.url),
        303,
      ),
      context,
    );
  } catch (error) {
    if (error instanceof AuthReturnContextError)
      return loginErrorResponse(
        request,
        'auth-context',
        legacyReturnTo ?? context?.returnTo ?? null,
      );
    return NextResponse.redirect(
      new URL(
        `${context ? authConsentPath(context, legacyReturnTo) : legacyReturnTo ? `/consent?returnTo=${encodeURIComponent(legacyReturnTo)}` : '/consent'}${context?.attempt || legacyReturnTo ? '&' : '?'}error=1`,
        request.url,
      ),
      303,
    );
  }
}
