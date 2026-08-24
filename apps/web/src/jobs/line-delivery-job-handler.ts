import 'server-only';
import {
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
      const environment = getServerEnvironment();
      return new ExecuteLineMissionDelivery(
        deliveries,
        new ActiveLineDeliveryConfigurationAdapter(),
        new db.PrismaLineConnectionRepository(),
        new db.PrismaLineMissionNotificationSummaryRepository(),
        new LineMessagingApiAdapter(),
      ).execute({
        deliveryId,
        environment: job.environment,
        actorUserId: job.requestedBy,
        workerId: `${workerId}:${job.id}`.slice(0, 100),
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
