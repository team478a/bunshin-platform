import type { PrismaClient } from '@prisma/client';
import type { BadgeLineDeliveryRetryRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma } from '@prisma/client';

export class PrismaBadgeLineDeliveryRetryRepository implements BadgeLineDeliveryRetryRepository {
  constructor(private readonly client: PrismaClient) {}

  async request(input: Parameters<BadgeLineDeliveryRetryRepository['request']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const admin = await tx.platformAdmin.findFirst({
          where: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
          },
          select: { id: true },
        });
        if (!admin) return null;
        const delivery = await tx.badgeLineNotificationDelivery.findFirst({
          where: {
            id: input.deliveryId,
            environment: input.environment,
            status: 'DEAD',
            sentAt: null,
            cancelledAt: null,
            attemptCount: { gt: 0 },
            lastErrorCategory: {
              in: ['CONFIGURATION_UNAVAILABLE', 'RATE_LIMITED', 'TIMEOUT', 'PROVIDER_UNAVAILABLE'],
            },
            workspace: { status: 'ACTIVE' },
            group: { status: 'ACTIVE' },
            user: { status: 'ACTIVE' },
          },
        });
        if (!delivery) return null;
        const job = await tx.job.create({
          data: {
            environment: input.environment,
            workspaceId: delivery.workspaceId,
            bunshinId: null,
            capabilityType: 'SOCIAL',
            jobType: 'BADGE_LINE_DELIVER',
            payloadReference: `badge-line-delivery:${delivery.id}`,
            idempotencyKey: `badge-line-admin-retry:${delivery.id}:${delivery.attemptCount}`,
            correlationId: input.requestId,
            requestedBy: delivery.userId,
            priority: 50,
            maxAttempts: 3,
          },
        });
        return tx.badgeLineDeliveryRetryRequest.create({
          data: {
            id: input.requestId,
            environment: input.environment,
            deliveryId: delivery.id,
            deliveryAttemptCount: delivery.attemptCount,
            actorUserId: input.actorUserId,
            reason: input.reason,
            jobId: job.id,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError(
          'CONFLICT',
          'this badge delivery failure already has a retry job',
          error,
        );
      throw error;
    }
  }
}
