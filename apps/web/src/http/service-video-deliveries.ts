import 'server-only';
import {
  AssignVideoDelivery,
  evaluateLineQuota,
  GetMyVideoDelivery,
  RecordVideoDeliveryAction,
  RecordVideoDeliveryNotification,
  RevokeVideoDelivery,
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
import { ActiveLineDeliveryConfigurationAdapter } from '../line/delivery-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';
import { currentLineEnvironment, lineEndpointUrls } from '../line/secure-configuration';
import { csv } from './admin-report-export';

const uuid = z.string().uuid();
const assignBody = z
  .object({
    membershipId: z.string().uuid(),
    programEnrollmentId: z.string().uuid().nullable(),
    videoProjectId: z.string().uuid(),
    videoRenderId: z.string().uuid(),
    replacesVideoDeliveryId: z.string().uuid().nullable(),
    usageMessage: z.string().trim().min(1).max(500),
    expiresAt: z.string().datetime().nullable(),
  })
  .strict();
const actions = ['VIEWED', 'ACCEPTED', 'DECLINED', 'POSTED'] as const;
const revokeBody = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

type DeliveryNoticeResult =
  | 'SENT'
  | 'NOT_CONFIGURED'
  | 'PAUSED'
  | 'NOT_ALLOWED'
  | 'RECIPIENT_UNAVAILABLE'
  | 'QUOTA_UNAVAILABLE'
  | 'FAILED';

function notificationOutcome(value: DeliveryNoticeResult) {
  if (value === 'SENT') return { status: 'SENT' as const, errorCode: null };
  if (value === 'FAILED') return { status: 'FAILED' as const, errorCode: value };
  return { status: 'CANCELLED' as const, errorCode: value };
}

async function sendDeliveryNotice(input: {
  serviceSlug: string;
  workspaceId: string;
  groupId: string;
  ownerUserId: string;
  videoProjectId: string;
}): Promise<DeliveryNoticeResult> {
  const db = await import('@bunshin/database');
  const project = await db.prisma.videoProject.findFirst({
    where: {
      id: input.videoProjectId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      ownerUserId: input.ownerUserId,
    },
    select: { bunshinId: true, title: true },
  });
  if (!project) return 'FAILED';
  const environment = currentLineEnvironment();
  const configuration = await new ActiveLineDeliveryConfigurationAdapter().getActive(environment, {
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    userId: input.ownerUserId,
  });
  if (!configuration) return 'NOT_CONFIGURED';
  if (configuration.globallyPaused) return 'PAUSED';
  const preference = new db.PrismaLineDeliveryPreferenceRepository();
  if (
    !(await preference.isAllowed({
      workspaceId: input.workspaceId,
      bunshinId: project.bunshinId,
      userId: input.ownerUserId,
      at: new Date(),
    }))
  )
    return 'NOT_ALLOWED';
  const recipientId = await new db.PrismaLineConnectionRepository().resolve({
    environment,
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    bunshinId: project.bunshinId,
    userId: input.ownerUserId,
  });
  if (!recipientId) return 'RECIPIENT_UNAVAILABLE';
  const messaging = new LineMessagingApiAdapter();
  const quota = await messaging.getQuota(configuration.accessToken);
  if (!quota.ok) return 'QUOTA_UNAVAILABLE';
  const quotaPolicy = evaluateLineQuota({
    kind: 'DAILY_MISSION',
    limit: quota.limit,
    consumption: quota.consumption,
    warningPercent: configuration.quotaWarningPercent,
    lowPriorityStopPercent: configuration.quotaLowPriorityStop,
  });
  if (!quotaPolicy.allowed) return 'QUOTA_UNAVAILABLE';
  const reviewUrl = new URL(lineEndpointUrls().missionDeepLinkBaseUrl);
  reviewUrl.pathname = `/groups/${input.groupId}/videos/${input.videoProjectId}`;
  reviewUrl.search = `service=${encodeURIComponent(input.serviceSlug)}`;
  const result = await messaging.pushVideoCompletion({
    accessToken: configuration.accessToken,
    recipientId,
    projectTitle: project.title,
    reviewUrl: reviewUrl.toString(),
  });
  return result.ok ? 'SENT' : 'FAILED';
}

function jsonError(error: unknown, requestId: string) {
  const mapped = toApiError(error, requestId);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { 'cache-control': 'private, no-store' },
  });
}

const deliveryStatusLabel: Record<string, string> = {
  ASSIGNED: '未確認',
  VIEWED: '確認中',
  ACCEPTED: '採用済み',
  DECLINED: '今回は使わない',
  POSTED: '投稿完了',
  EXPIRED: '利用期限切れ',
  REVOKED: '利用停止',
};

const deliveryNotificationLabel: Record<string, string> = {
  PENDING: '未送信',
  SENT: 'LINEでお知らせ済み',
  FAILED: '送信に失敗',
  CANCELLED: '送信していません',
};

type VideoDeliveryCsvRow = {
  groupMembershipId: string;
  videoProjectId: string;
  status: string;
  notificationStatus: string;
  notificationAttemptCount: number;
  createdAt: Date;
  notifiedAt: Date | null;
  viewedAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  postedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

type VideoDeliveryCsvMembership = {
  id: string;
  user: { displayName: string | null };
};

type VideoDeliveryCsvProject = { id: string; title: string };

export async function exportServiceVideoDeliveriesCsvResponse(serviceSlug: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) {
    return new Response(null, { status: 401, headers: { 'cache-control': 'private, no-store' } });
  }
  try {
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const deliveries: VideoDeliveryCsvRow[] = await db.prisma.videoDelivery.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      select: {
        groupMembershipId: true,
        videoProjectId: true,
        status: true,
        notificationStatus: true,
        notificationAttemptCount: true,
        createdAt: true,
        notifiedAt: true,
        viewedAt: true,
        acceptedAt: true,
        declinedAt: true,
        postedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });
    const [memberships, projects]: [VideoDeliveryCsvMembership[], VideoDeliveryCsvProject[]] =
      await Promise.all([
        db.prisma.groupMembership.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            id: { in: [...new Set(deliveries.map((delivery) => delivery.groupMembershipId))] },
          },
          select: { id: true, user: { select: { displayName: true } } },
        }),
        db.prisma.videoProject.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            id: { in: [...new Set(deliveries.map((delivery) => delivery.videoProjectId))] },
          },
          select: { id: true, title: true },
        }),
      ]);
    const memberNameById = new Map(
      memberships.map((membership) => [membership.id, membership.user.displayName]),
    );
    const projectTitleById = new Map(projects.map((project) => [project.id, project.title]));
    const headers = [
      '参加者',
      '動画名',
      '利用者の状態',
      'LINE通知',
      '通知の試行回数',
      '確認依頼',
      'LINE通知の確認',
      '動画を確認',
      '採用',
      '今回は使わない',
      '投稿完了',
      '利用期限',
      '利用停止',
    ];
    const rows: Array<Array<string | number | null>> = [
      headers,
      ...deliveries.map((delivery) => [
        memberNameById.get(delivery.groupMembershipId) ?? '参加者',
        projectTitleById.get(delivery.videoProjectId) ?? '動画',
        deliveryStatusLabel[delivery.status] ?? delivery.status,
        deliveryNotificationLabel[delivery.notificationStatus] ?? delivery.notificationStatus,
        delivery.notificationAttemptCount,
        delivery.createdAt.toISOString(),
        delivery.notifiedAt?.toISOString() ?? null,
        delivery.viewedAt?.toISOString() ?? null,
        delivery.acceptedAt?.toISOString() ?? null,
        delivery.declinedAt?.toISOString() ?? null,
        delivery.postedAt?.toISOString() ?? null,
        delivery.expiresAt?.toISOString() ?? null,
        delivery.revokedAt?.toISOString() ?? null,
      ]),
    ];
    return new Response(csv(rows), {
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': 'attachment; filename="video-deliveries.csv"',
        'content-type': 'text/csv; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: { 'cache-control': 'private, no-store' } });
  }
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
      replacesVideoDeliveryId: input.replacesVideoDeliveryId,
      rightsSnapshot: { schemaVersion: 1, usageMessage: input.usageMessage },
      expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt),
    });
    const notification = await sendDeliveryNotice({
      serviceSlug,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      ownerUserId: delivery.ownerUserId,
      videoProjectId: delivery.videoProjectId,
    }).catch(() => 'FAILED' as const);
    const outcome = notificationOutcome(notification);
    await new RecordVideoDeliveryNotification(new db.PrismaVideoDeliveryRepository()).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: delivery.id,
      status: outcome.status,
      errorCode: outcome.errorCode,
      attemptedAt: new Date(),
    });
    return Response.json({ data: delivery, notification, requestId }, { status: 201 });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function retryServiceVideoDeliveryNotificationResponse(
  request: Request,
  serviceSlug: string,
  deliveryId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const delivery = await db.prisma.videoDelivery.findFirst({
      where: {
        id: uuid.parse(deliveryId),
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: { not: 'REVOKED' },
        notificationStatus: { not: 'SENT' },
      },
      select: { id: true, ownerUserId: true, videoProjectId: true },
    });
    if (!delivery)
      throw new ApplicationError('NOT_FOUND', 'video delivery notification unavailable');
    const notification = await sendDeliveryNotice({
      serviceSlug,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      ownerUserId: delivery.ownerUserId,
      videoProjectId: delivery.videoProjectId,
    }).catch(() => 'FAILED' as const);
    const outcome = notificationOutcome(notification);
    await new RecordVideoDeliveryNotification(new db.PrismaVideoDeliveryRepository()).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: delivery.id,
      status: outcome.status,
      errorCode: outcome.errorCode,
      attemptedAt: new Date(),
    });
    return Response.json({ data: { notification }, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function revokeServiceVideoDeliveryResponse(
  request: Request,
  serviceSlug: string,
  deliveryId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, input] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, actor.userId),
      revokeBody.parseAsync(await request.json()),
    ]);
    const db = await import('@bunshin/database');
    const delivery = await new RevokeVideoDelivery(new db.PrismaVideoDeliveryRepository()).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      videoDeliveryId: uuid.parse(deliveryId),
      reason: input.reason,
    });
    return Response.json({ data: delivery, requestId });
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
