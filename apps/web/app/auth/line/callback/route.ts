import { NextResponse } from 'next/server';
import { currentUserProvider } from '../../../../src/auth/current-user';
import {
  createSupabaseServerClient,
  createSupabaseAttemptClient,
} from '../../../../src/auth/supabase';
import { loginErrorResponse } from '../../../../src/auth/login-error';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';
import { recordAuthenticatedRegistrationEvent } from '../../../../src/registration/funnel';
import {
  singleAuthAttemptId,
  readAuthReturnContext,
  claimAuthReturnAttempt,
  authenticateAuthReturnAttempt,
  consumeAuthReturnAttempt,
  cancelAuthReturnAttempt,
  clearAuthReturnCookie,
  authConsentPath,
  authReturnDestination,
  AuthReturnContextError,
  type AuthReturnContext,
} from '../../../../src/auth/auth-return-attempt';

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

async function lineFriendshipStatus(providerToken: string | null | undefined) {
  if (!providerToken || providerToken.length > 4096) return null;
  try {
    const response = await fetch('https://api.line.me/friendship/v1/status', {
      headers: { authorization: `Bearer ${providerToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const value = (await response.json()) as { friendFlag?: unknown };
    return typeof value.friendFlag === 'boolean' ? value.friendFlag : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  let context: AuthReturnContext | null = null;
  let ownedStage: 'PENDING' | 'CLAIMED' | 'AUTHENTICATED' = 'PENDING';
  let claimed = false;
  try {
    const url = new URL(request.url);
    const id = singleAuthAttemptId(url.searchParams.getAll('authAttempt'));
    context = await readAuthReturnContext(request, id, { method: 'LINE' });
    const code = url.searchParams.get('code');
    if (url.searchParams.has('error') || code === null || code.length > 2048)
      throw new Error('LINE callback rejected');

    await claimAuthReturnAttempt(context);
    claimed = true;
    ownedStage = 'CLAIMED';
    if (context.attempt && !context.attempt.pkceFlowId) throw new AuthReturnContextError();
    const buffered = context.attempt ? await createSupabaseAttemptClient() : null;
    const supabase = buffered?.client ?? (await createSupabaseServerClient());
    const { data, error } = context.attempt
      ? await supabase.auth.exchangeCodeForSession(code, { flowId: context.attempt.pkceFlowId! })
      : await supabase.auth.exchangeCodeForSession(code);
    if (error !== null) throw error;
    const providerUserId = data.user ? lineProviderUserId(data.user) : null;
    if (!providerUserId) throw new Error('verified LINE identity unavailable');
    if (buffered) await buffered.commitCookies();

    const currentUser = await (await currentUserProvider()).getCurrentUser();
    if (currentUser === null) throw new Error('user unavailable');

    const db = await import('@bunshin/database');
    await db.prisma.$transaction(async (tx) => {
      const existing = await tx.authIdentity.findUnique({
        where: { provider_providerUserId: { provider: 'LINE', providerUserId } },
        select: { userId: true },
      });
      if (existing && existing.userId !== currentUser.userId)
        throw new Error('LINE identity already belongs to another user');
      if (!existing)
        await tx.authIdentity.create({
          data: { userId: currentUser.userId, provider: 'LINE', providerUserId },
        });
    });
    const workspaces = await db.listActiveWorkspacesForUser(currentUser.userId);
    const connect = new (await import('@bunshin/application')).ConnectLineMessagingAccount(
      new db.PrismaLineConnectionRepository(),
    );
    await Promise.all(
      workspaces.map(({ id }) =>
        connect.execute({
          environment: currentLineEnvironment(),
          workspaceId: id,
          actorUserId: currentUser.userId,
          verifiedProviderUserId: providerUserId,
          consentGranted: false,
        }),
      ),
    );
    const friend = await lineFriendshipStatus(data.session?.provider_token);
    if (friend !== null) {
      const changedAt = new Date();
      await db.prisma.lineConnection.updateMany({
        where: {
          environment: currentLineEnvironment(),
          userId: currentUser.userId,
          providerUserId,
          status: 'ACTIVE',
        },
        data: {
          friendshipStatus: friend ? 'FOLLOWING' : 'UNFOLLOWED',
          followedAt: friend ? changedAt : null,
          unfollowedAt: friend ? null : changedAt,
        },
      });
    }
    await recordAuthenticatedRegistrationEvent({
      eventType: 'LINE_AUTHENTICATED',
      userId: currentUser.userId,
      source: 'LINE_OAUTH',
    });
    await authenticateAuthReturnAttempt(context, currentUser.userId);
    ownedStage = 'AUTHENTICATED';
    const required = await new db.PrismaLegalConsentRepository().findRequiredForUser(
      currentUser.userId,
    );
    if (required.some((item) => !item.consentedAt))
      return NextResponse.redirect(new URL(authConsentPath(context), request.url), 303);
    const registration = await db.prisma.userRegistrationProfile.findUnique({
      where: { userId: currentUser.userId },
      select: { status: true },
    });
    await consumeAuthReturnAttempt(context, currentUser.userId);
    return clearAuthReturnCookie(
      NextResponse.redirect(
        new URL(authReturnDestination(context, registration?.status), request.url),
        303,
      ),
      context,
    );
  } catch (error) {
    const cancelled =
      claimed || !(error instanceof AuthReturnContextError)
        ? await cancelAuthReturnAttempt(context, ownedStage)
        : false;
    return clearAuthReturnCookie(
      loginErrorResponse(
        request,
        error instanceof AuthReturnContextError ? 'auth-context' : '1',
        context?.returnTo ?? null,
      ),
      claimed || cancelled ? context : null,
    );
  }
}
