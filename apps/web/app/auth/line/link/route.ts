import { NextResponse } from 'next/server';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { createSupabaseServerClient } from '../../../../src/auth/supabase';
import { requireSameOrigin } from '../../../../src/auth/request-security';
import { loginErrorResponse } from '../../../../src/auth/login-error';
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
} from '../../../../src/auth/auth-return-attempt';
import { safeLineAuthReturnPath } from '../../../../src/auth/line-return';

export async function POST(request: Request): Promise<Response> {
  let context: NewAuthReturnAttempt | null = null;
  let returnTo: string | null = null;
  try {
    requireSameOrigin(request);
    if (process.env['LINE_IDENTITY_LINKING_ENABLED'] !== 'true' || !authReturnAttemptsEnabled())
      throw new AuthReturnContextError();

    const form = await request.formData();
    const returnToValues = form.getAll('returnTo');
    if (returnToValues.length > 1) throw new AuthReturnContextError();
    const requestedReturnTo = returnToValues[0] ?? null;
    returnTo = safeLineAuthReturnPath(
      typeof requestedReturnTo === 'string' ? requestedReturnTo : null,
    );
    if (requestedReturnTo && !returnTo) throw new AuthReturnContextError();

    const supabase = await createSupabaseServerClient();
    const { data: verified, error: verificationError } = await supabase.auth.getUser();
    if (verificationError || !verified.user) throw new AuthReturnContextError();
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new AuthReturnContextError();
    const db = await import('@bunshin/database');
    const sessionIdentity = await db.prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: { provider: 'EMAIL', providerUserId: verified.user.id },
      },
      select: { userId: true },
    });
    if (!sessionIdentity || sessionIdentity.userId !== actor.userId)
      throw new AuthReturnContextError();

    context = await createAuthReturnAttempt(
      request,
      'LINE_LINK',
      returnTo,
      undefined,
      actor.userId,
    );
    const { data, error } = await supabase.auth.linkIdentity({
      provider: 'custom:line',
      options: {
        redirectTo: attemptCallbackUrl(context.attempt.origin, '/auth/line/link/callback', context),
        scopes: 'openid profile',
        queryParams: { bot_prompt: 'aggressive' },
      },
    });
    if (error || !data.url) throw error ?? new Error('LINE link unavailable');
    if (data.flowId) await setAuthAttemptPkceFlow(context, data.flowId);
    else throw new Error('LINE link transaction unavailable');
    return attachAuthAttemptCookie(NextResponse.redirect(data.url, 303), context);
  } catch (error) {
    await cancelAuthReturnAttempt(context);
    return clearAuthReturnCookie(
      loginErrorResponse(
        request,
        error instanceof AuthReturnContextError ? 'auth-context' : 'line-link',
        returnTo,
      ),
      context,
    );
  }
}
