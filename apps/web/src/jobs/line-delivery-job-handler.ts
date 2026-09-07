import 'server-only';
import {
  CreateSocialImageMediaReadUrl,
  ExecuteLineMissionDelivery,
  GetLineMissionDelivery,
  IssueMissionDeepLinkState,
  type LineDeliveryJobHandler,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { randomUUID } from 'node:crypto';
import { ActiveLineDeliveryConfigurationAdapter } from '../line/delivery-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';
import { HkdfMissionDeepLinkSigner } from '../line/mission-deep-link-signer';
import { lineEndpointUrls } from '../line/secure-configuration';
import { SupabaseSocialImageStorage } from '../social-image-storage';

export function createLineDeliveryJobHandler(): LineDeliveryJobHandler {
  return {
    async execute({ job, deliveryId, workerId }) {
      if (!job.bunshinId)
        return { status: 'FAILED', category: 'RECIPIENT_UNAVAILABLE', retryable: false };
      const bunshinId = job.bunshinId;
      const db = await import('@bunshin/database');
      const deliveries = new db.PrismaLineMessageDeliveryRepository();
      const delivery = await new GetLineMissionDelivery(deliveries).execute({
        deliveryId,
        environment: job.environment,
        workspaceId: job.workspaceId,
        bunshinId,
        actorUserId: job.requestedBy,
      });
      const imageGroupId = delivery.groupId;
      const automaticImageRequest = imageGroupId
        ? await db.prisma.socialImageGenerationRequest.findFirst({
            where: {
              workspaceId: job.workspaceId,
              groupId: imageGroupId,
              ownerUserId: job.requestedBy,
              bunshinId,
              dailyMissionId: delivery.dailyMissionId,
              idempotencyKey: `automatic-daily-image:${delivery.dailyMissionId}`,
            },
            select: { id: true, status: true },
          })
        : null;
      if (
        automaticImageRequest &&
        ['DRAFT', 'QUEUED', 'GENERATING_ASSET', 'COMPOSING'].includes(automaticImageRequest.status)
      )
        return { status: 'BUSY', category: null, retryable: true };
      const environment = getServerEnvironment();
      const imageRequests = new db.PrismaSocialImageGenerationRequestRepository();
      return new ExecuteLineMissionDelivery(
        deliveries,
        new ActiveLineDeliveryConfigurationAdapter(),
        new db.PrismaLineConnectionRepository(),
        new db.PrismaLineMissionNotificationSummaryRepository(),
        new db.PrismaLineDeliveryPreferenceRepository(),
        new LineMessagingApiAdapter(),
      ).execute({
        deliveryId,
        environment: job.environment,
        actorUserId: job.requestedBy,
        workerId: `${workerId}:${job.id}`.slice(0, 100),
        ...(automaticImageRequest?.status === 'READY_FOR_REVIEW' && imageGroupId
          ? {
              image: async () => {
                const media = await imageRequests.findMediaOwned({
                  workspaceId: job.workspaceId,
                  groupId: imageGroupId,
                  actorUserId: job.requestedBy,
                  requestId: automaticImageRequest.id,
                });
                if (!media || media.status === 'DELETED') return null;
                const readUrl = new CreateSocialImageMediaReadUrl(
                  imageRequests,
                  new SupabaseSocialImageStorage(),
                );
                const [original, preview] = await Promise.all([
                  readUrl.execute({
                    workspaceId: job.workspaceId,
                    groupId: imageGroupId,
                    actorUserId: job.requestedBy,
                    requestId: automaticImageRequest.id,
                    mediaId: media.id,
                    kind: 'COMPLETED',
                  }),
                  readUrl.execute({
                    workspaceId: job.workspaceId,
                    groupId: imageGroupId,
                    actorUserId: job.requestedBy,
                    requestId: automaticImageRequest.id,
                    mediaId: media.id,
                    kind: 'THUMBNAIL',
                  }),
                ]);
                return {
                  originalContentUrl: original.url,
                  previewImageUrl: preview.url,
                };
              },
            }
          : {}),
        deepLinkUrl: async () => {
          const state = await new IssueMissionDeepLinkState(
            new db.PrismaMissionDeepLinkStateRepository(),
            new HkdfMissionDeepLinkSigner(),
          ).execute({
            stateId: randomUUID(),
            environment: job.environment,
            workspaceId: job.workspaceId,
            bunshinId,
            actorUserId: job.requestedBy,
            dailyMissionId: delivery.dailyMissionId,
            keyVersion: environment.LINE_DEEP_LINK_KEY_VERSION,
          });
          const deepLink = new URL(lineEndpointUrls().missionDeepLinkBaseUrl);
          deepLink.searchParams.set('state', state.token);
          return deepLink.toString();
        },
      });
    },
  };
}
