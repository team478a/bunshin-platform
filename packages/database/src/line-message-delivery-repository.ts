import type { LineMessageDelivery, LineMessageDeliveryRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';

function lineMissionScope(input: {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
  dailyMissionId: string;
}): Prisma.BunshinWhereInput {
  return {
    id: input.bunshinId,
    workspaceId: input.workspaceId,
    status: { not: 'ARCHIVED' },
    ownerUser: { status: 'ACTIVE' },
    workspace: {
      status: 'ACTIVE',
      memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
    },
    OR: [
      { ownerUserId: input.actorUserId },
      {
        workspace: {
          memberships: {
            some: {
              userId: input.actorUserId,
              status: 'ACTIVE',
              role: { in: ['OWNER', 'ADMIN'] },
            },
          },
        },
      },
    ],
    dailyMissions: { some: { id: input.dailyMissionId } },
  };
}

function lineMessageDelivery(
  row: Prisma.LineMessageDeliveryGetPayload<object>,
): LineMessageDelivery {
  return row;
}

export class PrismaLineMessageDeliveryRepository implements LineMessageDeliveryRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async getScoped(input: Parameters<LineMessageDeliveryRepository['getScoped']>[0]) {
    const row = await this.client.lineMessageDelivery.findFirst({
      where: {
        id: input.deliveryId,
        environment: input.environment,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        userId: input.actorUserId,
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
        bunshin: { status: { not: 'ARCHIVED' } },
        user: { status: 'ACTIVE' },
      },
    });
    return row ? lineMessageDelivery(row) : null;
  }

  async prepare(input: Parameters<LineMessageDeliveryRepository['prepare']>[0]) {
    const accessible = await this.client.bunshin.findFirst({
      where: lineMissionScope(input),
      select: { id: true, groupId: true },
    });
    if (!accessible) return null;
    const mission = await this.client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
      select: {
        campaign: { select: { groupId: true } },
        contentLinkUsage: { select: { groupId: true } },
      },
    });
    if (!mission) return null;
    const campaignGroupId = mission.campaign?.groupId ?? null;
    const usageGroupId = mission.contentLinkUsage?.groupId ?? null;
    if (campaignGroupId && usageGroupId && campaignGroupId !== usageGroupId)
      throw new ApplicationError('CONFLICT', 'Mission group context mismatch');
    const groupId = accessible.groupId ?? campaignGroupId ?? usageGroupId;
    if (
      accessible.groupId &&
      [campaignGroupId, usageGroupId].some((id) => id && id !== accessible.groupId)
    )
      throw new ApplicationError('CONFLICT', 'Mission service context mismatch');
    if (
      groupId &&
      !(await this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      }))
    )
      return null;

    try {
      return lineMessageDelivery(
        await this.client.lineMessageDelivery.create({
          data: {
            environment: input.environment,
            workspaceId: input.workspaceId,
            groupId,
            bunshinId: input.bunshinId,
            userId: input.actorUserId,
            dailyMissionId: input.dailyMissionId,
            kind: input.kind,
            idempotencyKey: input.idempotencyKey,
            scheduledAt: input.scheduledAt,
          },
        }),
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.client.lineMessageDelivery.findUnique({
        where: {
          environment_idempotencyKey: {
            environment: input.environment,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (
        !existing ||
        existing.workspaceId !== input.workspaceId ||
        existing.groupId !== groupId ||
        existing.bunshinId !== input.bunshinId ||
        existing.userId !== input.actorUserId ||
        existing.dailyMissionId !== input.dailyMissionId ||
        existing.kind !== input.kind
      )
        throw new ApplicationError('CONFLICT', 'delivery idempotency key is already in use');
      return lineMessageDelivery(existing);
    }
  }

  async claim(input: Parameters<LineMessageDeliveryRepository['claim']>[0]) {
    return this.client.$transaction(async (tx) => {
      const claimed = await tx.lineMessageDelivery.updateMany({
        where: {
          id: input.deliveryId,
          environment: input.environment,
          userId: input.actorUserId,
          sentAt: null,
          cancelledAt: null,
          scheduledAt: { lte: input.now },
          user: { status: 'ACTIVE' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
          },
          bunshin: {
            status: { not: 'ARCHIVED' },
            OR: [
              { ownerUserId: input.actorUserId },
              {
                workspace: {
                  memberships: {
                    some: {
                      userId: input.actorUserId,
                      status: 'ACTIVE',
                      role: { in: ['OWNER', 'ADMIN'] },
                    },
                  },
                },
              },
            ],
          },
          OR: [
            { status: { in: ['PENDING', 'FAILED'] } },
            { status: 'PROCESSING', leaseExpiresAt: { lte: input.now } },
          ],
        },
        data: {
          status: 'PROCESSING',
          attemptCount: { increment: 1 },
          leaseOwner: input.leaseOwner,
          leaseExpiresAt: input.leaseExpiresAt,
          lastErrorCategory: null,
        },
      });
      if (claimed.count !== 1) return null;
      const row = await tx.lineMessageDelivery.findFirst({
        where: {
          id: input.deliveryId,
          environment: input.environment,
          userId: input.actorUserId,
          status: 'PROCESSING',
          leaseOwner: input.leaseOwner,
          leaseExpiresAt: input.leaseExpiresAt,
        },
      });
      if (!row) throw new ApplicationError('CONFLICT', 'LINE delivery claim lost');
      return { delivery: lineMessageDelivery(row), attemptNumber: row.attemptCount };
    });
  }

  async recordAttempt(input: Parameters<LineMessageDeliveryRepository['recordAttempt']>[0]) {
    if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery attempt number');
    if (!Number.isInteger(input.latencyMs) || input.latencyMs < 0)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery attempt latency');
    if ((input.status === 'SUCCESS') !== (input.errorCategory === null))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery attempt error category');

    await this.client.$transaction(async (tx) => {
      const delivery = await tx.lineMessageDelivery.updateMany({
        where: {
          id: input.deliveryId,
          environment: input.environment,
          status: 'PROCESSING',
          leaseOwner: input.leaseOwner,
          attemptCount: input.attemptNumber,
        },
        data: {
          status: input.status === 'SUCCESS' ? 'SENT' : 'FAILED',
          sentAt: input.status === 'SUCCESS' ? input.attemptedAt : null,
          lastErrorCategory: input.errorCategory,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (delivery.count !== 1)
        throw new ApplicationError('NOT_FOUND', 'LINE delivery not found in environment');
      await tx.lineMessageDeliveryAttempt.create({
        data: {
          deliveryId: input.deliveryId,
          attemptNumber: input.attemptNumber,
          status: input.status,
          errorCategory: input.errorCategory,
          latencyMs: input.latencyMs,
          attemptedAt: input.attemptedAt,
        },
      });
    });
  }

  async releaseClaim(input: Parameters<LineMessageDeliveryRepository['releaseClaim']>[0]) {
    const result = await this.client.lineMessageDelivery.updateMany({
      where: {
        id: input.deliveryId,
        environment: input.environment,
        status: 'PROCESSING',
        leaseOwner: input.leaseOwner,
      },
      data: {
        status: input.status,
        lastErrorCategory: input.errorCategory,
        cancelledAt: input.status === 'CANCELLED' ? input.now : null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }
}
