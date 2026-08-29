import 'server-only';
import { ExecuteBadgeLineDelivery, type BadgeLineDeliveryJobHandler } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ActiveLineDeliveryConfigurationAdapter } from '../line/delivery-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';

export function createBadgeLineDeliveryJobHandler(): BadgeLineDeliveryJobHandler {
  return {
    async execute({ job, deliveryId, workerId }) {
      const db = await import('@bunshin/database');
      const configuration = getServerEnvironment();
      return new ExecuteBadgeLineDelivery(
        new db.PrismaBadgeLineDeliveryRepository(db.prisma),
        new ActiveLineDeliveryConfigurationAdapter(),
        new db.PrismaLineConnectionRepository(),
        new LineMessagingApiAdapter(),
      ).execute({
        deliveryId,
        environment: job.environment,
        workerId: `${workerId}:${job.id}`.slice(0, 100),
        badgeUrl: new URL('/badges', configuration.APP_URL).toString(),
      });
    },
  };
}
