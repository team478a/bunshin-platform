import { NextResponse } from 'next/server';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { createSupabaseAttemptClient } from '../../../../../src/auth/supabase';
import { loginErrorResponse } from '../../../../../src/auth/login-error';
import {
  singleAuthAttemptId,
  readAuthReturnContext,
  claimAuthReturnAttempt,
  authenticateAuthReturnAttempt,
  consumeAuthReturnAttempt,
  cancelAuthReturnAttempt,
  clearAuthReturnCookie,
  AuthReturnContextError,
  type AuthReturnContext,
} from '../../../../../src/auth/auth-return-attempt';

function lineProviderUserId(user: {
  identities?: Array<{
    id: string;
    provider: string;
    identity_data?: Record<string, unknown> | null;
  }> | null;
}): string | null {
  const identity = user.identities?.find(
    ({ provider }) => provider === 'custom:line' || provider === 'line',
  );
  if (!identity) return null;
  const subject = identity.identity_data?.['sub'];
  const userId = identity.identity_data?.['user_id'];
  const value =
    typeof subject === 'string' ? subject : typeof userId === 'string' ? userId : identity.id;
  return /^[\x21-\x7e]{1,255}$/.test(value) ? value : null;
}

function destination(returnTo: string | null, requestUrl: string): URL {
  return new URL(returnTo ?? '/account', requestUrl);
}

export async function GET(request: Request): Promise<Response> {
  let context: AuthReturnContext | null = null;
  let claimed = false;
  let ownedStage: 'PENDING' | 'CLAIMED' | 'AUTHENTICATED' = 'PENDING';
  try {
    const url = new URL(request.url);
    const id = singleAuthAttemptId(url.searchParams.getAll('authAttempt'));
    const db = await import('@bunshin/database');
    const initial = await readAuthReturnContext(request, id, { method: 'LINE_LINK' });
    if (!initial.attempt?.actorUserId) throw new AuthReturnContextError();
    context = await readAuthReturnContext(request, id, {
      method: 'LINE_LINK',
      actorUserId: initial.attempt.actorUserId,
    });
    const attempt = context.attempt;
    if (!attempt?.actorUserId) throw new AuthReturnContextError();
    const code = url.searchParams.get('code');
    if (url.searchParams.has('error') || !code || code.length > 2048)
      throw new Error('LINE link callback rejected');

    await claimAuthReturnAttempt(context);
    claimed = true;
    ownedStage = 'CLAIMED';
    if (!attempt.pkceFlowId) throw new AuthReturnContextError();
    const buffered = await createSupabaseAttemptClient();
    const { data, error } = await buffered.client.auth.exchangeCodeForSession(code, {
      flowId: attempt.pkceFlowId,
    });
    if (error || !data.user) throw error ?? new Error('LINE-linked session unavailable');

    const providerUserId = lineProviderUserId(data.user);
    if (!providerUserId) throw new Error('verified LINE identity unavailable');

    // The callback must still resolve to the exact platform account that started linking.
    // Looking up the EMAIL identity first avoids provisioning a new user on a mismatched session.
    const existingSessionIdentity = await db.prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: { provider: 'EMAIL', providerUserId: data.user.id },
      },
      select: { userId: true },
    });
    if (!existingSessionIdentity || existingSessionIdentity.userId !== attempt.actorUserId)
      throw new AuthReturnContextError();
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor || actor.userId !== attempt.actorUserId) throw new AuthReturnContextError();

    await db.prisma.$transaction(async (tx) => {
      const existing = await tx.authIdentity.findUnique({
        where: { provider_providerUserId: { provider: 'LINE', providerUserId } },
        select: { userId: true },
      });
      if (existing && existing.userId !== actor.userId)
        throw new Error('LINE identity already belongs to another user');
      if (!existing)
        await tx.authIdentity.create({
          data: { userId: actor.userId, provider: 'LINE', providerUserId },
        });
    });

    await buffered.commitCookies();
    await authenticateAuthReturnAttempt(context, actor.userId);
    ownedStage = 'AUTHENTICATED';
    await consumeAuthReturnAttempt(context, actor.userId);
    const response = NextResponse.redirect(destination(context.returnTo, request.url), 303);
    response.headers.set('cache-control', 'no-store');
    return clearAuthReturnCookie(response, context);
  } catch (error) {
    const cancelled =
      claimed || !(error instanceof AuthReturnContextError)
        ? await cancelAuthReturnAttempt(context, ownedStage)
        : false;
    const response = loginErrorResponse(
      request,
      error instanceof AuthReturnContextError ? 'auth-context' : 'line-link',
      context?.returnTo ?? null,
    );
    return clearAuthReturnCookie(response, claimed || cancelled ? context : null);
  }
}
