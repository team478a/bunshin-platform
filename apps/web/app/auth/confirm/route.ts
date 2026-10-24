import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { currentUserProvider } from '../../../src/auth/current-user';
import { requireSameOrigin } from '../../../src/auth/request-security';
import {
  createSupabaseServerClient,
  createSupabaseAttemptClient,
} from '../../../src/auth/supabase';
import { loginErrorResponse } from '../../../src/auth/login-error';
import { safeLineAuthReturnPath } from '../../../src/auth/line-return';
import {
  singleAuthAttemptId,
  emailAuthAttemptId,
  readAuthReturnContext,
  claimAuthReturnAttempt,
  authenticateAuthReturnAttempt,
  consumeAuthReturnAttempt,
  cancelAuthReturnAttempt,
  clearAuthReturnCookie,
  emailAuthReturnTo,
  authConsentPath,
  authReturnDestination,
  authEmailHash,
  AuthReturnContextError,
  type AuthReturnContext,
} from '../../../src/auth/auth-return-attempt';

export function GET(request: Request): Response | Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code !== null) return completePkceEmailCallback(request, url, code);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (tokenHash === null || !/^[A-Za-z0-9_-]+$/.test(tokenHash) || type !== 'email') {
    return NextResponse.redirect(new URL('/login?error=1', request.url), 303);
  }
  const confirmation = new URL('/login/confirm', request.url);
  confirmation.searchParams.set('token_hash', tokenHash);
  confirmation.searchParams.set('type', type);
  try {
    const id = emailAuthAttemptId(url);
    if (id) confirmation.searchParams.set('authAttempt', id);
    const returnTo = emailAuthReturnTo(url);
    if (returnTo) confirmation.searchParams.set('returnTo', returnTo);
  } catch {
    return loginErrorResponse(request, 'auth-context', null);
  }
  const response = NextResponse.redirect(confirmation, 303);
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}

async function completePkceEmailCallback(
  request: Request,
  url: URL,
  code: string,
): Promise<Response> {
  let context: AuthReturnContext | null = null;
  let displayReturnTo: string | null = null;
  let ownedStage: 'CLAIMED' | 'AUTHENTICATED' = 'CLAIMED';
  let claimed = false;
  try {
    displayReturnTo = emailAuthReturnTo(url);
    context = await readAuthReturnContext(
      request,
      singleAuthAttemptId(url.searchParams.getAll('authAttempt')),
      { method: 'EMAIL' },
    );
    if (url.searchParams.has('error') || code.length === 0 || code.length > 2048)
      throw new Error('email callback rejected');
    await claimAuthReturnAttempt(context);
    claimed = true;
    const buffered = context.attempt ? await createSupabaseAttemptClient() : null;
    const supabase = buffered?.client ?? (await createSupabaseServerClient());
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    if (exchanged.error !== null) throw exchanged.error;
    assertEmailIdentity(context, exchanged.data?.user);
    if (buffered) await buffered.commitCookies();
    return await completeEmailSession(request, context, displayReturnTo, (stage) => {
      ownedStage = stage;
    });
  } catch (error) {
    if (claimed) await cancelAuthReturnAttempt(context, ownedStage);
    return clearAuthReturnCookie(
      loginErrorResponse(
        request,
        error instanceof AuthReturnContextError ? 'auth-context' : '1',
        displayReturnTo ?? context?.returnTo,
      ),
      claimed ? context : null,
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  let context: AuthReturnContext | null = null;
  let displayReturnTo: string | null = null;
  let ownedStage: 'CLAIMED' | 'AUTHENTICATED' = 'CLAIMED';
  let claimed = false;
  try {
    requireSameOrigin(request);
    const data = await request.formData();
    const submittedReturnTo = data.get('returnTo');
    displayReturnTo = safeLineAuthReturnPath(
      typeof submittedReturnTo === 'string' ? submittedReturnTo : null,
    );
    context = await readAuthReturnContext(
      request,
      singleAuthAttemptId(data.getAll('authAttempt')),
      { method: 'EMAIL' },
    );
    const tokenHash = data.get('token_hash');
    const type = data.get('type');
    if (typeof tokenHash !== 'string' || !/^[A-Za-z0-9_-]+$/.test(tokenHash) || type !== 'email')
      throw new Error('invalid callback');
    await claimAuthReturnAttempt(context);
    claimed = true;
    const buffered = context.attempt ? await createSupabaseAttemptClient() : null;
    const supabase = buffered?.client ?? (await createSupabaseServerClient());
    const verified = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (verified.error !== null) throw verified.error;
    assertEmailIdentity(context, verified.data?.user);
    if (buffered) await buffered.commitCookies();
    return await completeEmailSession(request, context, displayReturnTo, (stage) => {
      ownedStage = stage;
    });
  } catch (error) {
    if (claimed) await cancelAuthReturnAttempt(context, ownedStage);
    return clearAuthReturnCookie(
      loginErrorResponse(
        request,
        error instanceof AuthReturnContextError ? 'auth-context' : '1',
        displayReturnTo ?? context?.returnTo,
      ),
      claimed ? context : null,
    );
  }
}

function assertEmailIdentity(
  context: AuthReturnContext,
  user: { email?: string | null } | null | undefined,
): void {
  if (
    context.attempt &&
    (!user?.email ||
      authEmailHash(user.email, context.attempt.proofHash) !== context.attempt.loginIdentityHash)
  )
    throw new AuthReturnContextError();
}

async function completeEmailSession(
  request: Request,
  context: AuthReturnContext,
  displayReturnTo: string | null,
  onStageChange: (stage: 'CLAIMED' | 'AUTHENTICATED') => void,
): Promise<Response> {
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  if (currentUser === null) throw new Error('user unavailable');
  const db = await import('@bunshin/database');
  await authenticateAuthReturnAttempt(context, currentUser.userId);
  onStageChange('AUTHENTICATED');
  const required = await new db.PrismaLegalConsentRepository().findRequiredForUser(
    currentUser.userId,
  );
  if (required.some((item) => !item.consentedAt))
    return NextResponse.redirect(
      new URL(authConsentPath(context, displayReturnTo), request.url),
      303,
    );
  const registration = await db.prisma.userRegistrationProfile.findUnique({
    where: { userId: currentUser.userId },
    select: { status: true },
  });
  await consumeAuthReturnAttempt(context, currentUser.userId);
  return clearAuthReturnCookie(
    NextResponse.redirect(
      new URL(authReturnDestination(context, registration?.status, displayReturnTo), request.url),
      303,
    ),
    context,
  );
}
