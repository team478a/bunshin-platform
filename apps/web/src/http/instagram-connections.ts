import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { NextResponse } from 'next/server';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { instagramLoginAdapter } from '../providers/instagram-login';
import {
  socialAccountConnectionOwner,
  socialAccountConnections,
} from '../services/social-account-connection-owner';

const ATTEMPT_LIFETIME_MS = 10 * 60 * 1000;
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function hash(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function cookieName(stateHash: string) {
  return `instagram_oauth_${stateHash.slice(0, 20)}`;
}

function destination(serviceSlug: string, bunshinId: string, result: string) {
  return `/s/${serviceSlug}/bunshins/${bunshinId}/connections?instagramResult=${result}`;
}

function redirectTo(request: Request, path: string, status: 302 | 303 = 303) {
  void request;
  return NextResponse.redirect(new URL(path, getServerEnvironment().APP_URL), status);
}

function clearAttemptCookie(response: NextResponse, stateHash: string) {
  response.cookies.set(cookieName(stateHash), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(getServerEnvironment().APP_URL).protocol === 'https:',
    path: '/auth/instagram/callback',
    maxAge: 0,
  });
}

export async function startInstagramConnection(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  requireSameOrigin(request);
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'Authentication required');
  const target = await socialAccountConnectionOwner(serviceSlug, bunshinId, actor.userId);
  await (await socialAccountConnections()).list(actor.userId, target.owner);
  let adapter;
  try {
    adapter = instagramLoginAdapter();
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'CONFIGURATION_ERROR')
      return redirectTo(request, destination(serviceSlug, bunshinId, 'unavailable'));
    throw error;
  }
  const state = randomBytes(32).toString('base64url');
  const stateHash = hash(state);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ATTEMPT_LIFETIME_MS);
  const db = await import('@bunshin/database');
  await db.prisma.$transaction(async (tx) => {
    await tx.socialOAuthAttempt.deleteMany({
      where: {
        workspaceId: target.owner.workspaceId,
        groupId: target.owner.serviceId,
        groupMembershipId: target.owner.groupMembershipId,
        userId: actor.userId,
        bunshinId,
        expiresAt: { lte: now },
      },
    });
    await tx.socialOAuthAttempt.create({
      data: {
        stateHash,
        workspaceId: target.owner.workspaceId,
        groupId: target.owner.serviceId,
        groupMembershipId: target.owner.groupMembershipId,
        userId: actor.userId,
        bunshinId,
        platform: 'INSTAGRAM',
        expiresAt,
      },
    });
  });
  const response = NextResponse.redirect(adapter.authorizationUrl(state), 303);
  response.cookies.set(cookieName(stateHash), state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(getServerEnvironment().APP_URL).protocol === 'https:',
    path: '/auth/instagram/callback',
    maxAge: ATTEMPT_LIFETIME_MS / 1000,
  });
  return response;
}

export async function finishInstagramConnection(request: Request) {
  const url = new URL(request.url);
  const states = url.searchParams.getAll('state');
  const state = states.length === 1 ? states[0] : null;
  const stateHash = state && /^[A-Za-z0-9_-]{43}$/.test(state) ? hash(state) : null;
  const fallback = redirectTo(request, '/?instagramResult=expired', 302);
  if (!state || !stateHash) return fallback;
  const db = await import('@bunshin/database');
  const attempt = await db.prisma.socialOAuthAttempt.findUnique({ where: { stateHash } });
  if (!attempt || attempt.platform !== 'INSTAGRAM') return fallback;
  const configuration = await db.prisma.serviceConfiguration.findFirst({
    where: { workspaceId: attempt.workspaceId, groupId: attempt.groupId },
    select: { slug: true },
  });
  if (!configuration) return fallback;
  const finish = (result: string) => {
    const response = redirectTo(
      request,
      destination(configuration.slug, attempt.bunshinId, result),
      302,
    );
    clearAttemptCookie(response, stateHash);
    return response;
  };
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === cookieName(stateHash))?.[1];
  if (cookie !== state) return finish('expired');
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor || actor.userId !== attempt.userId) return finish('expired');
  try {
    const target = await socialAccountConnectionOwner(
      configuration.slug,
      attempt.bunshinId,
      actor.userId,
    );
    if (
      target.owner.workspaceId !== attempt.workspaceId ||
      target.owner.serviceId !== attempt.groupId ||
      target.owner.groupMembershipId !== attempt.groupMembershipId ||
      target.owner.userId !== attempt.userId ||
      target.owner.bunshinId !== attempt.bunshinId
    )
      return finish('expired');
    const connections = await socialAccountConnections();
    await connections.list(actor.userId, target.owner);
    const now = new Date();
    const claimed = await db.prisma.socialOAuthAttempt.updateMany({
      where: { stateHash, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) return finish('expired');
    const errors = url.searchParams.getAll('error');
    const codes = url.searchParams.getAll('code');
    if (errors.length === 1 && codes.length === 0) return finish('cancelled');
    if (errors.length !== 0 || codes.length !== 1 || !codes[0]) return finish('unavailable');
    const credential = await instagramLoginAdapter().exchangeCode({ code: codes[0] });
    await connections.save(actor.userId, target.owner, credential);
    return finish('connected');
  } catch {
    return finish('unavailable');
  }
}

export async function disconnectInstagramConnection(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  connectionId: string,
) {
  requireSameOrigin(request);
  if (!uuidPattern.test(connectionId))
    throw new ApplicationError('NOT_FOUND', 'SNS connection unavailable');
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'Authentication required');
  const target = await socialAccountConnectionOwner(serviceSlug, bunshinId, actor.userId);
  await (await socialAccountConnections()).disconnect(actor.userId, target.owner, connectionId);
  return redirectTo(request, destination(serviceSlug, bunshinId, 'disconnected'));
}

export function instagramConnectionErrorResponse(error: unknown) {
  const status =
    error instanceof ApplicationError
      ? error.code === 'UNAUTHENTICATED'
        ? 401
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'CONFLICT'
            ? 409
            : 403
      : 500;
  return Response.json({ error: 'Instagram connection unavailable' }, { status });
}
