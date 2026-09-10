import 'server-only';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger } from '@bunshin/observability';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from '../line/secure-configuration';
import {
  createLineLinkProof,
  hashLineState,
  lineLinkAuthorization,
  verifyServiceLineCode,
} from '../line/service-line-oauth';
import { SupabaseVideoRenderOutputStorage } from '../video/video-render-output-storage';

const proofCookie = 'video-line-proof';
const viewerCookie = (id: string) => `video-view-${id}`;
const viewPath = (id: string) => `/video-access/${id}`;
const callbackUrl = () =>
  new URL('/auth/video-line/callback', getServerEnvironment().APP_URL).toString();
const cookieOptions = () => ({
  httpOnly: true,
  secure: new URL(callbackUrl()).protocol === 'https:',
  sameSite: 'lax' as const,
});
const logger = createLogger();
function redirectTo(path: string) {
  const response = NextResponse.redirect(new URL(path, getServerEnvironment().APP_URL), 303);
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}

/** The LINE proof authorizes only viewing this project; it never changes the app login. */
export async function videoViewScope(id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const db = await import('@bunshin/database');
  const project = await db.prisma.videoProject.findFirst({
    where: {
      id,
      status: { not: 'CANCELLED' },
      workspace: { status: 'ACTIVE' },
      group: { status: 'ACTIVE' },
      ownerUser: { status: 'ACTIVE' },
      groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
      bunshin: { status: { not: 'ARCHIVED' } },
    },
    select: {
      id: true,
      workspaceId: true,
      groupId: true,
      ownerUserId: true,
      title: true,
      reviewDecision: true,
      reviewedAt: true,
      renderAttempts: {
        where: {
          status: 'SUCCEEDED',
          deletedAt: null,
          outputStorageKey: { not: null },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { completedAt: 'desc' },
        take: 1,
        select: { id: true, outputStorageKey: true },
      },
    },
  });
  if (!project) return null;
  const connection = await db.prisma.groupLineConnection.findFirst({
    where: {
      workspaceId: project.workspaceId,
      groupId: project.groupId,
      userId: project.ownerUserId,
      status: 'ACTIVE',
      notificationConsentAt: { not: null },
      groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
      configuration: {
        environment: currentLineEnvironment(),
        status: 'ACTIVE',
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
        group: {
          lineRoutingPolicies: {
            some: { environment: currentLineEnvironment(), mode: 'DEDICATED', pilotEnabled: true },
          },
        },
      },
    },
    include: { configuration: true },
  });
  return { db, project, connection };
}

export async function authorizedVideoView(id: string) {
  const scope = await videoViewScope(id);
  if (!scope) return null;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (actor?.userId === scope.project.ownerUserId) return { ...scope, appOwner: true };
  const token = (await cookies()).get(viewerCookie(id))?.value;
  if (!token || !/^[\w-]{43}$/.test(token) || !scope.connection) return null;
  const ticket = await scope.db.prisma.videoLineAccess.findUnique({
    where: { sessionHash: hashLineState(token) },
  });
  if (
    !ticket ||
    ticket.projectId !== id ||
    ticket.ownerUserId !== scope.project.ownerUserId ||
    ticket.configurationId !== scope.connection.configurationId ||
    ticket.providerHash !== hashLineState(scope.connection.providerUserId) ||
    !ticket.consumedAt ||
    !ticket.sessionExpiresAt ||
    ticket.sessionExpiresAt <= new Date()
  )
    return null;
  return { ...scope, appOwner: false };
}

export async function startVideoLineAccess(request: Request) {
  let destination = '/video-access/unavailable';
  try {
    requireSameOrigin(request);
    const id = z
      .string()
      .uuid()
      .parse((await request.formData()).get('projectId'));
    destination = viewPath(id);
    const scope = await videoViewScope(id);
    if (!scope?.connection || !scope.project.renderAttempts.length) throw new Error('Unavailable');
    const proof = createLineLinkProof();
    await scope.db.prisma.videoLineAccess.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
        OR: [{ sessionExpiresAt: null }, { sessionExpiresAt: { lt: new Date() } }],
      },
    });
    await scope.db.prisma.videoLineAccess.create({
      data: {
        stateHash: hashLineState(proof.state),
        projectId: id,
        ownerUserId: scope.project.ownerUserId,
        configurationId: scope.connection.configurationId,
        providerHash: hashLineState(scope.connection.providerUserId),
        nonce: proof.nonce,
        verifier: proof.verifier,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const response = redirectTo(
      lineLinkAuthorization({
        ...proof,
        channelId: scope.connection.configuration.loginChannelId,
        redirectUri: callbackUrl(),
      }),
    );
    response.cookies.set(proofCookie, proof.state, {
      ...cookieOptions(),
      path: '/auth/video-line',
      maxAge: 600,
    });
    return response;
  } catch {
    logger.warn('video_line_access_failed', { operation: 'start' });
    return redirectTo(`${destination}?result=failed`);
  }
}

export async function finishVideoLineAccess(request: Request) {
  let destination = '/video-access/unavailable';
  let response: NextResponse;
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (
      !state ||
      !/^[\w-]{43}$/.test(state) ||
      state !== (await cookies()).get(proofCookie)?.value ||
      !code ||
      code.length > 2048 ||
      url.searchParams.has('error')
    )
      throw new Error('Invalid callback');
    const db = await import('@bunshin/database');
    const attempt = await db.prisma.videoLineAccess.findUnique({
      where: { stateHash: hashLineState(state) },
    });
    if (!attempt || attempt.consumedAt || attempt.expiresAt <= new Date())
      throw new Error('Invalid attempt');
    destination = viewPath(attempt.projectId);
    const scope = await videoViewScope(attempt.projectId);
    if (
      !scope?.connection ||
      scope.project.ownerUserId !== attempt.ownerUserId ||
      scope.connection.configurationId !== attempt.configurationId ||
      hashLineState(scope.connection.providerUserId) !== attempt.providerHash
    )
      throw new Error('Scope changed');
    const claimed = await db.prisma.videoLineAccess.updateMany({
      where: { stateHash: attempt.stateHash, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date(), nonce: '', verifier: '' },
    });
    if (claimed.count !== 1) throw new Error('Already consumed');
    const verified = await verifyServiceLineCode({
      code,
      nonce: attempt.nonce,
      verifier: attempt.verifier,
      channelId: scope.connection.configuration.loginChannelId,
      secret: new AesGcmLineSecretCrypto().decrypt(
        scope.connection.configuration.encryptedLoginSecret,
      ),
      redirectUri: callbackUrl(),
    });
    if (hashLineState(verified.providerUserId) !== attempt.providerHash)
      throw new Error('Recipient mismatch');
    const token = randomBytes(32).toString('base64url');
    await db.prisma.videoLineAccess.update({
      where: { stateHash: attempt.stateHash },
      data: {
        sessionHash: hashLineState(token),
        sessionExpiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    response = redirectTo(destination);
    response.cookies.set(viewerCookie(attempt.projectId), token, {
      ...cookieOptions(),
      path: destination,
      maxAge: 1800,
    });
  } catch {
    logger.warn('video_line_access_failed', { operation: 'callback' });
    response = redirectTo(`${destination}?result=failed`);
  }
  response.cookies.set(proofCookie, '', {
    ...cookieOptions(),
    path: '/auth/video-line',
    maxAge: 0,
  });
  return response;
}

export async function downloadVideoView(id: string) {
  const scope = await authorizedVideoView(id);
  const render = scope?.project.renderAttempts[0];
  if (
    !scope ||
    !render?.outputStorageKey ||
    render.outputStorageKey !==
      `${scope.project.workspaceId}/${scope.project.ownerUserId}/${render.id}.mp4`
  )
    return new Response('動画を開くには、通知を受け取ったLINEで本人確認してください。', {
      status: 403,
      headers: { 'cache-control': 'no-store' },
    });
  return redirectTo(
    await new SupabaseVideoRenderOutputStorage().createDownloadUrl(render.outputStorageKey),
  );
}

export async function recordVideoReviewDecision(request: Request, id: string) {
  const destination = viewPath(id);
  try {
    requireSameOrigin(request);
    const scope = await authorizedVideoView(id);
    if (!scope?.project.renderAttempts.length) throw new Error('Unavailable');
    const decision = z
      .enum(['ADOPTED', 'REJECTED'])
      .parse((await request.formData()).get('decision'));
    const changed = await scope.db.prisma.videoProject.updateMany({
      where: {
        id: scope.project.id,
        workspaceId: scope.project.workspaceId,
        groupId: scope.project.groupId,
        ownerUserId: scope.project.ownerUserId,
        status: { in: ['READY_FOR_REVIEW', 'COMPLETED'] },
      },
      data: { reviewDecision: decision, reviewedAt: new Date() },
    });
    if (changed.count !== 1) throw new Error('Unavailable');
    return redirectTo(`${destination}?decision=${decision.toLowerCase()}`);
  } catch {
    logger.warn('video_review_decision_failed', { operation: 'review', projectId: id });
    return redirectTo(`${destination}?result=decision-failed`);
  }
}
