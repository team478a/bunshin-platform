import 'server-only';
import {
  AssignVideoDelivery,
  GetMyVideoDelivery,
  RecordVideoDeliveryAction,
  type VideoDeliveryAction,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  resolveManagedServiceContext,
  resolvePublicServiceContext,
} from '../services/public-service';
import { SupabaseVideoRenderOutputStorage } from '../video/video-render-output-storage';

const uuid = z.string().uuid();
const assignBody = z
  .object({
    membershipId: z.string().uuid(),
    programEnrollmentId: z.string().uuid().nullable(),
    videoProjectId: z.string().uuid(),
    videoRenderId: z.string().uuid(),
    usageMessage: z.string().trim().min(1).max(500),
    expiresAt: z.string().datetime().nullable(),
  })
  .strict();
const actions = ['VIEWED', 'ACCEPTED', 'DECLINED', 'POSTED'] as const;

function jsonError(error: unknown, requestId: string) {
  const mapped = toApiError(error, requestId);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { 'cache-control': 'private, no-store' },
  });
}

export async function assignServiceVideoDeliveryResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, input] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, actor.userId),
      assignBody.parseAsync(await request.json()),
    ]);
    const db = await import('@bunshin/database');
    const delivery = await new AssignVideoDelivery(new db.PrismaVideoDeliveryRepository()).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      groupMembershipId: input.membershipId,
      programEnrollmentId: input.programEnrollmentId,
      videoProjectId: input.videoProjectId,
      videoRenderId: input.videoRenderId,
      rightsSnapshot: { schemaVersion: 1, usageMessage: input.usageMessage },
      expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt),
    });
    return Response.json({ data: delivery, requestId }, { status: 201 });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function recordServiceVideoDeliveryActionResponse(
  request: Request,
  serviceSlug: string,
  deliveryId: string,
  action: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!actions.includes(action as (typeof actions)[number]))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid video delivery action');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolvePublicServiceContext(serviceSlug);
    const db = await import('@bunshin/database');
    const delivery = await new RecordVideoDeliveryAction(
      new db.PrismaVideoDeliveryRepository(),
    ).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: uuid.parse(deliveryId),
      action: action as VideoDeliveryAction,
      eventData: {},
    });
    return Response.json({ data: delivery, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function downloadServiceVideoDeliveryResponse(
  serviceSlug: string,
  deliveryId: string,
) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) return new Response(null, { status: 401 });
  try {
    const service = await resolvePublicServiceContext(serviceSlug);
    const db = await import('@bunshin/database');
    const deliveries = new db.PrismaVideoDeliveryRepository();
    const delivery = await new GetMyVideoDelivery(deliveries).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: uuid.parse(deliveryId),
    });
    if (!['ACCEPTED', 'POSTED'].includes(delivery.status))
      throw new ApplicationError('FORBIDDEN', 'video delivery must be accepted');
    await new RecordVideoDeliveryAction(deliveries).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: delivery.id,
      action: 'DOWNLOADED',
      eventData: {},
    });
    const render = await db.prisma.videoRender.findFirst({
      where: {
        id: delivery.videoRenderId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        ownerUserId: actor.userId,
        status: 'SUCCEEDED',
        outputStorageKey: { not: null },
      },
      select: { outputStorageKey: true },
    });
    if (!render?.outputStorageKey) return new Response(null, { status: 404 });
    return Response.redirect(
      await new SupabaseVideoRenderOutputStorage().createDownloadUrl(render.outputStorageKey),
      302,
    );
  } catch {
    return new Response(null, { status: 404 });
  }
}
