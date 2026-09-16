import 'server-only';
import {
  SERVICE_NOTIFICATION_CHANNELS,
  ServiceNotificationPreferenceService,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const channelSchema = z.enum(SERVICE_NOTIFICATION_CHANNELS);
const bodySchema = z.object({ channel: channelSchema, enabled: z.boolean() }).strict();

async function service() {
  const db = await import('@bunshin/database');
  return new ServiceNotificationPreferenceService(
    new db.PrismaServiceNotificationPreferenceRepository(db.prisma),
  );
}

async function actorUserId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

export async function getServiceNotificationPreferenceResponse(
  request: Request,
  slug: string,
  topic: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const channel = channelSchema.parse(new URL(request.url).searchParams.get('channel') ?? 'LINE');
    const preference = await (
      await service()
    ).get({ slug, topic, channel, actorUserId: await actorUserId() });
    return Response.json(
      {
        data: preference ?? { topic, channel, enabled: false, consentedAt: null, optedOutAt: null },
        requestId,
      },
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

export async function updateServiceNotificationPreferenceResponse(
  request: Request,
  slug: string,
  topic: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const body = bodySchema.parse(await request.json());
    const preference = await (
      await service()
    ).update({ slug, topic, ...body, actorUserId: await actorUserId() });
    return Response.json(
      { data: preference, requestId },
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
