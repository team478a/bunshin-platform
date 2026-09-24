import 'server-only';
import { evaluateLineQuota } from '@bunshin/application';
import { ActiveLineDeliveryConfigurationAdapter } from '../line/delivery-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';
import { currentLineEnvironment, lineEndpointUrls } from '../line/secure-configuration';
import { videoDeliveryMessaging } from '../line/video-delivery-messaging';

export type DeliveryNoticeResult =
  | 'SENT'
  | 'NOT_CONFIGURED'
  | 'PAUSED'
  | 'NOT_ALLOWED'
  | 'RECIPIENT_UNAVAILABLE'
  | 'QUOTA_UNAVAILABLE'
  | 'FAILED'
  | 'RETRY_WINDOW_EXPIRED';

export function notificationOutcome(value: DeliveryNoticeResult) {
  if (value === 'SENT') return { status: 'SENT' as const, errorCode: null };
  if (value === 'FAILED') return { status: 'FAILED' as const, errorCode: value };
  return { status: 'CANCELLED' as const, errorCode: value };
}

export async function sendDeliveryNotice(input: {
  deliveryId: string;
  createdAt: Date;
  serviceSlug: string;
  workspaceId: string;
  groupId: string;
  ownerUserId: string;
  videoProjectId: string;
  videoRenderId: string;
  notificationAttemptCount: number;
}): Promise<DeliveryNoticeResult> {
  if (Date.now() - input.createdAt.getTime() >= 23 * 60 * 60 * 1000) return 'RETRY_WINDOW_EXPIRED';
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
  const result = await videoDeliveryMessaging({
    deliveryId: input.deliveryId,
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    ownerUserId: input.ownerUserId,
    videoProjectId: input.videoProjectId,
    videoRenderId: input.videoRenderId,
    notificationAttemptCount: input.notificationAttemptCount,
  }).pushVideoCompletion({
    accessToken: configuration.accessToken,
    recipientId,
    projectTitle: project.title,
    reviewUrl: reviewUrl.toString(),
    retryKey: input.deliveryId,
  });
  return result.ok ? 'SENT' : 'FAILED';
}
