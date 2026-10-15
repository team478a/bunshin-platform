import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createLogger } from '@bunshin/observability';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { lineFriendshipStatus } from '../../../../../src/line/friendship-status';
import { enableServiceBunshinNotifications } from '../../../../../src/line/enable-service-bunshin-notifications';
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

type LineProviderIdentity = {
  id: string;
  provider: string;
  identity_data?: Record<string, unknown> | null;
};

function lineProviderIdentity(user: {
  identities?: Array<{
    id: string;
    provider: string;
    identity_data?: Record<string, unknown> | null;
  }> | null;
}): LineProviderIdentity | null {
  return (
    user.identities?.find(({ provider }) => provider === 'custom:line' || provider === 'line') ??
    null
  );
}

function lineProviderUserId(user: { identities?: LineProviderIdentity[] | null }): string | null {
  const identity = lineProviderIdentity(user);
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
  let compensateLinkedIdentity:
    (() => Promise<{ error: { code?: string | undefined } | null }>) | null = null;
  let lineSubjectHash: string | null = null;
  let compensationFailed = false;
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

    const linkedLineIdentity = data.user.identities?.find(
      ({ provider }) => provider === 'custom:line' || provider === 'line',
    );
    if (linkedLineIdentity) {
      lineSubjectHash = createHash('sha256')
        .update(linkedLineIdentity.identity_id, 'utf8')
        .digest('hex');
      compensateLinkedIdentity = async () => {
        const { error: unlinkError } =
          await buffered.client.auth.unlinkIdentity(linkedLineIdentity);
        return { error: unlinkError ? { code: unlinkError.code } : null };
      };
    }

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

    // Both identity stores now agree. A later session-cookie/attempt error must not undo only
    // the Supabase half of this successfully reconciled pair.
    compensateLinkedIdentity = null;

    await buffered.commitCookies();
    await authenticateAuthReturnAttempt(context, actor.userId);
    ownedStage = 'AUTHENTICATED';
    await consumeAuthReturnAttempt(context, actor.userId);
    const returnUrl = context.returnTo ? new URL(context.returnTo, request.url) : null;
    const requestedServiceSlug =
      returnUrl?.pathname === '/account' &&
      returnUrl.searchParams.get('lineNotifications') === 'all'
        ? returnUrl.searchParams.get('service')
        : null;
    let notificationResult: string | null = null;
    if (requestedServiceSlug) {
      const friendshipConfirmed =
        (await lineFriendshipStatus(data.session?.provider_token)) === true;
      try {
        notificationResult = await enableServiceBunshinNotifications({
          serviceSlug: requestedServiceSlug,
          actorUserId: actor.userId,
          verifiedProviderUserId: providerUserId,
          friendshipConfirmed,
        });
      } catch (notificationError) {
        // Identity linking has already succeeded. Keep that success and direct the user to
        // the service's LINE settings instead of presenting a misleading login failure.
        notificationResult = 'ACTIVATION_FAILED';
        createLogger().error('service line notification activation failed', {
          serviceSlug: requestedServiceSlug,
          errorCode:
            notificationError instanceof Error &&
            /^[A-Z0-9_]{1,64}$/.test(notificationError.message)
              ? notificationError.message
              : 'ACTIVATION_FAILED',
        });
      }
    }
    const serviceLineReturn = requestedServiceSlug
      ? new URL(
          `/s/${requestedServiceSlug}/line?lineResult=${notificationResult ?? 'ACTIVATION_FAILED'}`,
          request.url,
        )
      : null;
    const response = NextResponse.redirect(
      serviceLineReturn ?? destination(context.returnTo, request.url),
      303,
    );
    response.headers.set('cache-control', 'no-store');
    return clearAuthReturnCookie(response, context);
  } catch (error) {
    if (compensateLinkedIdentity) {
      try {
        const { error: unlinkError } = await compensateLinkedIdentity();
        if (unlinkError) {
          compensationFailed = true;
          const code = unlinkError.code;
          createLogger().error('line identity compensation failed', {
            lineSubjectHash,
            errorCode:
              typeof code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(code)
                ? code
                : 'UNLINK_FAILED',
          });
        }
      } catch {
        compensationFailed = true;
        createLogger().error('line identity compensation failed', {
          lineSubjectHash,
          errorCode: 'UNLINK_THROWN',
        });
      }
    }
    const cancelled =
      claimed || !(error instanceof AuthReturnContextError)
        ? await cancelAuthReturnAttempt(context, ownedStage)
        : false;
    const response = loginErrorResponse(
      request,
      compensationFailed
        ? 'line-link'
        : error instanceof AuthReturnContextError
          ? 'auth-context'
          : 'line-link',
      context?.returnTo ?? null,
    );
    return clearAuthReturnCookie(response, claimed || cancelled ? context : null);
  }
}
