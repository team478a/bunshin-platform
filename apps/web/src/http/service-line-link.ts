import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from '../line/secure-configuration';
import {
  createLineLinkProof,
  hashLineState,
  lineLinkAuthorization,
  lineLinkCookie,
  lineLinkLifetimeMs,
  verifyServiceLineCode,
} from '../line/service-line-oauth';

const logger = createLogger();
export class ServiceLineLinkUnavailable extends Error {}
const scopeSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  bunshinId: z.string().uuid(),
});
function reportFailure(request: Request, operation: string) {
  logger.error('service_line_link_failed', {
    requestId: requestIdFromHeader(request.headers.get('x-request-id')),
    operation,
  });
}

export async function serviceLineLinkScope(slug: string, bunshinId: string) {
  if (!scopeSchema.safeParse({ slug, bunshinId }).success)
    throw new ServiceLineLinkUnavailable('Invalid scope');
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ServiceLineLinkUnavailable('Session required');
  const service = await resolvePublicServiceContext(slug);
  const db = await import('@bunshin/database');
  const bunshin = await db.prisma.bunshin.findFirst({
    where: {
      id: bunshinId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      ownerUserId: actor.userId,
      status: { not: 'ARCHIVED' },
      ownerUser: { status: 'ACTIVE' },
      workspace: { status: 'ACTIVE' },
      group: { status: 'ACTIVE' },
    },
    select: { id: true, name: true },
  });
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      status: 'ACTIVE',
      consentedAt: { not: null },
    },
    select: { id: true },
  });
  const configuration = await db.prisma.groupLineChannelConfiguration.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
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
  });
  if (!bunshin || !membership || !configuration)
    throw new ServiceLineLinkUnavailable('Service LINE unavailable');
  return { db, actor, service, bunshin, membership, configuration };
}

const returnPath = (slug: string, id: string) =>
  `/s/${encodeURIComponent(slug)}/bunshins/${encodeURIComponent(id)}/line`;
const callbackUrl = () =>
  new URL('/auth/service-line/callback', getServerEnvironment().APP_URL).toString();
function redirectTo(path: string) {
  const response = NextResponse.redirect(new URL(path, getServerEnvironment().APP_URL), 303);
  response.headers.set('cache-control', 'no-store');
  return response;
}

export async function startServiceLineLink(request: Request) {
  let destination = '/account';
  try {
    requireSameOrigin(request);
    const form = await request.formData();
    const slug = String(form.get('serviceSlug') ?? '');
    const id = String(form.get('bunshinId') ?? '');
    const scope = await serviceLineLinkScope(slug, id);
    destination = returnPath(slug, id);
    if (form.get('consent') !== 'yes') throw new Error('Consent required');
    const proof = createLineLinkProof();
    await scope.db.prisma.serviceLineLinkAttempt.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await scope.db.prisma.serviceLineLinkAttempt.create({
      data: {
        stateHash: hashLineState(proof.state),
        actorUserId: scope.actor.userId,
        bunshinId: id,
        configurationId: scope.configuration.id,
        serviceSlug: slug,
        nonce: proof.nonce,
        verifier: proof.verifier,
        expiresAt: new Date(Date.now() + lineLinkLifetimeMs),
      },
    });
    const response = NextResponse.redirect(
      lineLinkAuthorization({
        ...proof,
        channelId: scope.configuration.loginChannelId,
        redirectUri: callbackUrl(),
      }),
      303,
    );
    response.cookies.set(lineLinkCookie, proof.state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(callbackUrl()).protocol === 'https:',
      path: '/auth/service-line',
      maxAge: lineLinkLifetimeMs / 1000,
    });
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch {
    reportFailure(request, 'start');
    return redirectTo(`${destination}?lineResult=failed`);
  }
}

export async function finishServiceLineLink(request: Request) {
  let destination = '/account';
  let result = 'failed';
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const browserState = (await cookies()).get(lineLinkCookie)?.value;
    if (
      !state ||
      !/^[\w-]{43}$/.test(state) ||
      state !== browserState ||
      !code ||
      code.length > 2048 ||
      url.searchParams.has('error')
    )
      throw new Error('Invalid callback');
    const db = await import('@bunshin/database');
    const attempt = await db.prisma.serviceLineLinkAttempt.findUnique({
      where: { stateHash: hashLineState(state) },
    });
    if (!attempt || attempt.consumedAt || attempt.expiresAt <= new Date())
      throw new Error('Expired attempt');
    const scope = await serviceLineLinkScope(attempt.serviceSlug, attempt.bunshinId);
    if (
      scope.actor.userId !== attempt.actorUserId ||
      scope.configuration.id !== attempt.configurationId
    )
      throw new Error('Session or configuration changed');
    destination = returnPath(attempt.serviceSlug, attempt.bunshinId);
    const claimed = await db.prisma.serviceLineLinkAttempt.updateMany({
      where: { stateHash: attempt.stateHash, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date(), verifier: '', nonce: '' },
    });
    if (claimed.count !== 1) throw new Error('Already consumed');
    const verified = await verifyServiceLineCode({
      code,
      nonce: attempt.nonce,
      verifier: attempt.verifier,
      channelId: scope.configuration.loginChannelId,
      secret: new AesGcmLineSecretCrypto().decrypt(scope.configuration.encryptedLoginSecret),
      redirectUri: callbackUrl(),
    });
    // The unique configuration/provider-subject constraint rejects a destination owned by another member.
    const connected = await new db.PrismaGroupLineConnectionRepository().connectVerified({
      environment: currentLineEnvironment(),
      workspaceId: scope.service.workspaceId,
      groupId: scope.service.serviceId,
      configurationId: scope.configuration.id,
      groupMembershipId: scope.membership.id,
      actorUserId: scope.actor.userId,
      verifiedProviderUserId: verified.providerUserId,
      consentGranted: true,
    });
    if (!connected) throw new Error('Connection scope changed');
    await db.prisma.$transaction(async (tx) => {
      const updated = await tx.groupLineConnection.updateMany({
        where: {
          configurationId: scope.configuration.id,
          userId: scope.actor.userId,
          providerUserId: verified.providerUserId,
          status: 'ACTIVE',
          groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
        },
        data: {
          friendshipStatus: verified.following ? 'FOLLOWING' : 'UNFOLLOWED',
          ...(verified.following
            ? { followedAt: new Date(), unfollowedAt: null }
            : { unfollowedAt: new Date() }),
        },
      });
      if (updated.count !== 1) throw new Error('Connection changed');
      await tx.lineNotificationPreference.upsert({
        where: {
          workspaceId_userId_bunshinId: {
            workspaceId: scope.service.workspaceId,
            userId: scope.actor.userId,
            bunshinId: scope.bunshin.id,
          },
        },
        create: {
          workspaceId: scope.service.workspaceId,
          userId: scope.actor.userId,
          bunshinId: scope.bunshin.id,
          enabled: true,
          notificationConsentAt: new Date(),
        },
        update: { enabled: true, notificationConsentAt: new Date() },
      });
    });
    result = verified.following ? 'connected' : 'follow-required';
  } catch {
    // No provider token, code, subject or callback URL is logged.
    reportFailure(request, 'callback');
  }
  const response = redirectTo(`${destination}?lineResult=${result}`);
  response.cookies.set(lineLinkCookie, '', { maxAge: 0, path: '/auth/service-line' });
  return response;
}

export async function retryCompletedVideoNotice(request: Request) {
  let destination = '/account';
  try {
    requireSameOrigin(request);
    const form = await request.formData();
    const slug = String(form.get('serviceSlug') ?? '');
    const id = String(form.get('bunshinId') ?? '');
    const scope = await serviceLineLinkScope(slug, id);
    destination = returnPath(slug, id);
    const renderId = z.string().uuid().parse(form.get('renderId'));
    const now = new Date();
    const allowed = await new scope.db.PrismaLineDeliveryPreferenceRepository().isAllowed({
      workspaceId: scope.service.workspaceId,
      bunshinId: id,
      userId: scope.actor.userId,
      at: now,
    });
    const recipient = await new scope.db.PrismaLineConnectionRepository().resolve({
      workspaceId: scope.service.workspaceId,
      groupId: scope.service.serviceId,
      bunshinId: id,
      userId: scope.actor.userId,
      environment: currentLineEnvironment(),
    });
    if (!allowed || !recipient || scope.configuration.globallyPaused)
      throw new Error('Notification unavailable');
    await scope.db.prisma.$transaction(async (tx) => {
      const changed = await tx.videoRender.updateMany({
        where: {
          id: renderId,
          workspaceId: scope.service.workspaceId,
          groupId: scope.service.serviceId,
          ownerUserId: scope.actor.userId,
          status: 'SUCCEEDED',
          deletedAt: null,
          outputStorageKey: { not: null },
          notificationStatus: 'CANCELLED',
          notificationErrorCode: 'NOTIFICATION_SUPPRESSED',
          notifiedAt: null,
          completedAt: { gt: new Date(now.getTime() - 23 * 60 * 60_000) },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          project: { bunshinId: id, ownerUserId: scope.actor.userId, status: { not: 'CANCELLED' } },
        },
        data: { notificationStatus: 'PENDING', notificationErrorCode: null },
      });
      if (changed.count !== 1) throw new Error('Notification not retryable');
      await tx.job.create({
        data: {
          id: randomUUID(),
          environment: currentLineEnvironment(),
          workspaceId: scope.service.workspaceId,
          bunshinId: id,
          jobType: 'VIDEO_RENDER_PROCESS',
          payloadReference: `video-render:${renderId}`,
          idempotencyKey: `video-notice-recovery:${renderId}`,
          correlationId: `video-notice-recovery:${renderId}`,
          requestedBy: scope.actor.userId,
          scheduledAt: now,
        },
      });
    });
    return redirectTo(`${destination}?lineResult=queued`);
  } catch {
    reportFailure(request, 'retry-video');
    return redirectTo(`${destination}?lineResult=failed`);
  }
}
