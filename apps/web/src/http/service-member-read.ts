import 'server-only';
import type { MemberUsageRequest } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { resolveMemberServiceContext } from '../services/public-service';
import type { PublicServiceContext } from '../services/public-service';
import { memberUsageReadLimit } from './member-usage-read-limit';

const headers = { 'cache-control': 'private, no-store', vary: 'Cookie, Authorization' };
const bunshinIdSchema = z.string().uuid();

function storedTimezone(value: string | undefined) {
  const timezone = value === undefined ? 'Asia/Tokyo' : value;
  try {
    if (!timezone || timezone.length > 64) throw new Error('invalid timezone');
    new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(0);
  } catch {
    throw new ApplicationError('CONFIGURATION_ERROR', 'invalid stored usage timezone');
  }
  return timezone;
}

export async function getServiceMemberReadResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  read: (input: MemberUsageRequest, service: PublicServiceContext) => Promise<unknown>,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  let release: (() => void) | undefined;
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (!bunshinIdSchema.safeParse(bunshinId).success || new URL(request.url).searchParams.size)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid member read request');
    const permit = memberUsageReadLimit.reserve(actor.userId);
    if (!permit.allowed) {
      return Response.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: '少し時間をおいてからお試しください。',
            requestId,
          },
        },
        { status: 429, headers: { ...headers, 'retry-after': String(permit.retryAfterSeconds) } },
      );
    }
    release = permit.release;
    const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const [membership, bunshin] = await Promise.all([
      db.prisma.groupMembership.findFirst({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          userId: actor.userId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
      db.prisma.bunshin.findFirst({
        where: {
          id: bunshinId,
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          ownerUserId: actor.userId,
          status: { not: 'ARCHIVED' },
        },
        select: {
          id: true,
          lineNotificationPreferences: {
            where: { workspaceId: service.workspaceId, userId: actor.userId },
            select: { timezone: true },
            take: 1,
          },
        },
      }),
    ]);
    if (!membership || !bunshin) throw new ApplicationError('NOT_FOUND', 'member data unavailable');
    const timezone = storedTimezone(bunshin.lineNotificationPreferences[0]?.timezone);
    let data: unknown;
    try {
      data = await read(
        {
          actorUserId: actor.userId,
          scope: {
            workspaceId: service.workspaceId,
            serviceId: service.serviceId,
            groupMembershipId: membership.id,
            userId: actor.userId,
            bunshinId,
          },
          asOf: new Date(),
          timezone,
        },
        service,
      );
    } catch (error) {
      if (error instanceof ApplicationError && error.code === 'VALIDATION_ERROR')
        throw new ApplicationError('DATABASE_UNAVAILABLE', 'member read source unavailable');
      throw error;
    }
    return Response.json({ data, requestId }, { headers });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  } finally {
    release?.();
  }
}
