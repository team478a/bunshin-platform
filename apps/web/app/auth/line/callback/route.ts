import { NextResponse } from 'next/server';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { createSupabaseServerClient } from '../../../../src/auth/supabase';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';
import {
  LINE_AUTH_RETURN_COOKIE,
  lineAuthReturnFromCookie,
} from '../../../../src/auth/line-return';

function clearReturnCookie(response: NextResponse): NextResponse {
  response.cookies.set(LINE_AUTH_RETURN_COOKIE, '', { maxAge: 0, path: '/' });
  return response;
}

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
  try {
    const url = new URL(request.url);
    const returnTo = lineAuthReturnFromCookie(request.headers.get('cookie'));
    const code = url.searchParams.get('code');
    if (url.searchParams.has('error') || code === null || code.length > 2048)
      throw new Error('LINE callback rejected');

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error !== null) throw error;

    const currentUser = await (await currentUserProvider()).getCurrentUser();
    if (currentUser === null) throw new Error('user unavailable');
    const providerUserId = data.user ? lineProviderUserId(data.user) : null;
    if (!providerUserId) throw new Error('verified LINE identity unavailable');

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
    const required = await new db.PrismaLegalConsentRepository().findRequiredForUser(
      currentUser.userId,
    );
    if (required.some((item) => !item.consentedAt))
      return NextResponse.redirect(new URL('/consent', request.url), 303);
    const registration = await db.prisma.userRegistrationProfile.findUnique({
      where: { userId: currentUser.userId },
      select: { status: true },
    });
    if (registration?.status !== 'COMPLETED') {
      const onboarding = new URL('/onboarding', request.url);
      if (returnTo) onboarding.searchParams.set('returnTo', returnTo);
      return clearReturnCookie(NextResponse.redirect(onboarding, 303));
    }
    return clearReturnCookie(
      NextResponse.redirect(new URL(returnTo ?? '/bunshins', request.url), 303),
    );
  } catch {
    return clearReturnCookie(NextResponse.redirect(new URL('/login?error=1', request.url), 303));
  }
}
