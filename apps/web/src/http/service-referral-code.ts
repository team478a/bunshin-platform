import 'server-only';

import { createHash } from 'node:crypto';
import QRCode from 'qrcode';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';

function referralCodeFor(input: { workspaceId: string; groupId: string; membershipId: string }) {
  return createHash('sha256')
    .update(`service-referral:${input.workspaceId}:${input.groupId}:${input.membershipId}`)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
}

export async function ensureServiceReferralCodeResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolvePublicServiceContext(serviceSlug).catch(() => null);
    if (!service) throw new ApplicationError('NOT_FOUND', 'service not found');
    const db = await import('@bunshin/database');
    const code = await db.prisma.$transaction(async (tx) => {
      const membership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          userId: actor.userId,
          status: 'ACTIVE',
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
        },
        select: { id: true },
      });
      if (!membership || !service.configuration.registration.referralEnabled) return null;
      const existing = await tx.serviceReferralCode.findFirst({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          groupMembershipId: membership.id,
          userId: actor.userId,
        },
        select: { code: true, status: true },
      });
      if (existing?.status === 'ACTIVE') return existing.code;
      if (existing) return null;
      const generated = referralCodeFor({
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        membershipId: membership.id,
      });
      await tx.serviceReferralCode.createMany({
        data: [
          {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            groupMembershipId: membership.id,
            userId: actor.userId,
            code: generated,
          },
        ],
        skipDuplicates: true,
      });
      return (
        await tx.serviceReferralCode.findFirst({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            groupMembershipId: membership.id,
            userId: actor.userId,
            status: 'ACTIVE',
          },
          select: { code: true },
        })
      )?.code;
    });
    if (!code) throw new ApplicationError('FORBIDDEN', 'service referral is unavailable');
    const referralUrl = new URL(`/r/${code}`, request.url).toString();
    const qrDataUrl = await QRCode.toDataURL(referralUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
    });
    return Response.json(
      { data: { code, referralUrl, qrDataUrl }, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
