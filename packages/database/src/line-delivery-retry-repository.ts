import {
  LINE_ADMIN_RETRYABLE_FAILURES,
  type LineDeliveryRetryRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';

export class PrismaLineDeliveryRetryRepository implements LineDeliveryRetryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async request(input: Parameters<LineDeliveryRetryRepository['request']>[0]) {
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
        const delivery = await tx.lineMessageDelivery.findFirst({
          where: {
            id: input.deliveryId,
            environment: input.environment,
            status: 'FAILED',
            sentAt: null,
            cancelledAt: null,
            attemptCount: { gt: 0 },
            lastErrorCategory: { in: [...LINE_ADMIN_RETRYABLE_FAILURES] },
            workspace: { status: 'ACTIVE' },
            bunshin: { status: { not: 'ARCHIVED' } },
            user: { status: 'ACTIVE' },
          },
        });
        if (!delivery) return null;
        if (input.groupId !== undefined && delivery.groupId !== input.groupId) return null;
        if (!admin) {
          if (delivery.groupId === null) return null;
          const manager = await tx.groupMembership.findFirst({
            where: {
              workspaceId: delivery.workspaceId,
              groupId: delivery.groupId,
              userId: input.actorUserId,
              status: 'ACTIVE',
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
              group: { status: 'ACTIVE', serviceConfiguration: { isNot: null } },
            },
            select: { id: true },
          });
          if (!manager) return null;
        }
        const job = await tx.job.create({
          data: {
            environment: input.environment,
            workspaceId: delivery.workspaceId,
            bunshinId: delivery.bunshinId,
            capabilityType: 'SOCIAL',
            jobType: 'LINE_MISSION_DELIVER',
            payloadReference: `line-delivery:${delivery.id}`,
            idempotencyKey: `line-admin-retry:${delivery.id}:${delivery.attemptCount}`,
            correlationId: input.requestId,
            requestedBy: delivery.userId,
            priority: 50,
          },
        });
        const retry = await tx.lineDeliveryRetryRequest.create({
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
        return retry;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError(
          'CONFLICT',
          'this delivery failure already has a retry job',
          error,
        );
      throw error;
    }
  }
}
