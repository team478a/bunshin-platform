import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  socialAccountConnectionOwner,
  socialAccountConnections,
} from '../services/social-account-connection-owner';
import { InstagramDirectPublishingAdapter } from '../providers/instagram-direct-publishing';
import { SupabaseSocialImageStorage } from '../social-image-storage';

const uuid = z.string().uuid();
const approval = z
  .object({
    socialProfileId: uuid,
    dailyMissionId: uuid,
    contentVariantId: uuid,
    connectionId: uuid,
    mediaId: uuid,
    caption: z.string().trim().min(1).max(2200),
    scheduledAt: z.iso.datetime({ offset: true }),
    idempotencyKey: z.string().trim().min(1).max(200),
  })
  .strict();
const environment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const;

async function actor() {
  const value = await (await currentUserProvider()).getCurrentUser();
  if (!value) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return value.userId;
}

function dto(value: {
  id: string;
  status: string;
  scheduledAt: Date;
  externalPostId: string | null;
  failureCategory: string | null;
  publishedAt: Date | null;
}) {
  return {
    id: value.id,
    status: value.status,
    scheduledAt: value.scheduledAt.toISOString(),
    externalPostId: value.externalPostId,
    failureCategory: value.failureCategory,
    publishedAt: value.publishedAt?.toISOString() ?? null,
  };
}

export async function approveSocialPublication(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
    }
    const parsed = approval.safeParse(body);
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const actorUserId = await actor();
    const target = await socialAccountConnectionOwner(serviceSlug, bunshinId, actorUserId);
    const db = await import('@bunshin/database');
    const value = await new db.PrismaSocialPublicationIntents(db.prisma).approve({
      ...target.owner,
      actorUserId,
      ...parsed.data,
      scheduledAt: new Date(parsed.data.scheduledAt),
      correlationId: requestId,
      environment: environment[getServerEnvironment().APP_ENV],
    });
    return Response.json(
      { data: dto(value), requestId },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

export async function getSocialPublication(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  intentId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const parsedId = uuid.safeParse(intentId);
    if (!parsedId.success)
      throw new ApplicationError('NOT_FOUND', 'social publication unavailable');
    const actorUserId = await actor();
    const target = await socialAccountConnectionOwner(serviceSlug, bunshinId, actorUserId);
    const db = await import('@bunshin/database');
    const value = await new db.PrismaSocialPublicationIntents(db.prisma).get(
      actorUserId,
      target.owner,
      parsedId.data,
    );
    return Response.json(
      { data: dto(value), requestId },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

export async function reconcileSocialPublication(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  intentId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const parsedId = uuid.safeParse(intentId);
    if (!parsedId.success)
      throw new ApplicationError('NOT_FOUND', 'social publication unavailable');
    const actorUserId = await actor();
    const target = await socialAccountConnectionOwner(serviceSlug, bunshinId, actorUserId);
    const db = await import('@bunshin/database');
    const repository = new db.PrismaSocialPublicationIntents(db.prisma);
    const intent = await repository.getUnknownForReconciliation(
      actorUserId,
      target.owner,
      parsedId.data,
    );
    const runtime = getServerEnvironment();
    if (!runtime.INSTAGRAM_GRAPH_API_VERSION)
      throw new ApplicationError('CONFIGURATION_ERROR', 'Instagram publishing is not configured');
    const token = await (
      await socialAccountConnections()
    ).getUsableAccessToken(actorUserId, target.owner, intent.connectionId);
    const containerStatus = await new InstagramDirectPublishingAdapter(
      runtime.INSTAGRAM_GRAPH_API_VERSION,
    ).inspectContainer({ containerId: intent.containerId, accessToken: token });
    const value = await repository.recordReconciliation(intent.id, containerStatus);
    if (['FINISHED', 'PUBLISHED', 'ERROR', 'EXPIRED'].includes(containerStatus))
      await new SupabaseSocialImageStorage()
        .removePublishingJpeg(intent.completedStorageKey, intent.id)
        .catch(() => undefined);
    return Response.json({ data: value, requestId }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
