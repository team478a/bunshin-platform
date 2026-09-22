import {
  LINE_ADMIN_RETRYABLE_FAILURES,
  isLineNotificationSuppressed,
  type LineDeliveryPreferencePort,
  type LineDeliveryRetryRepository,
  type LineMessageDelivery,
  type LineMessageDeliveryRepository,
  type LineNotificationPreference,
  type LineReturnReminderRepository,
  type MissionDeepLinkState,
  type MissionDeepLinkStateRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';

function lineNotificationPreference(
  row: Prisma.LineNotificationPreferenceGetPayload<object>,
): LineNotificationPreference {
  return row;
}

function lineMessageDelivery(
  row: Prisma.LineMessageDeliveryGetPayload<object>,
): LineMessageDelivery {
  return row;
}

function missionDeepLinkState(
  row: Prisma.MissionDeepLinkStateGetPayload<object>,
): MissionDeepLinkState {
  return row;
}

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

export class PrismaLineDeliveryPreferenceRepository implements LineDeliveryPreferencePort {
  constructor(private readonly client: PrismaClient = prisma) {}
  async isAllowed(input: Parameters<LineDeliveryPreferencePort['isAllowed']>[0]) {
    const preference = await this.client.lineNotificationPreference.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        userId: input.userId,
        workspace: {
          status: 'ACTIVE',
        },
        OR: [
          { workspace: { memberships: { some: { userId: input.userId, status: 'ACTIVE' } } } },
          {
            bunshin: {
              ownerUserId: input.userId,
              group: {
                status: 'ACTIVE',
                memberships: {
                  some: { userId: input.userId, status: 'ACTIVE', consentedAt: { not: null } },
                },
              },
            },
          },
        ],
        bunshin: {
          status: { not: 'ARCHIVED' },
          OR: [
            { groupId: null },
            {
              ownerUserId: input.userId,
              group: {
                status: 'ACTIVE',
                memberships: {
                  some: {
                    userId: input.userId,
                    status: 'ACTIVE',
                    consentedAt: { not: null },
                  },
                },
              },
            },
          ],
        },
        user: { status: 'ACTIVE' },
      },
    });
    return preference
      ? !isLineNotificationSuppressed(lineNotificationPreference(preference), input.at)
      : false;
  }
}

export class PrismaLineReturnReminderRepository implements LineReturnReminderRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async shouldUse(input: Parameters<LineReturnReminderRepository['shouldUse']>[0]) {
    const localDate = new Date(`${input.localDate}T00:00:00.000Z`);
    if (Number.isNaN(localDate.valueOf())) return false;
    const dormantBefore = new Date(localDate);
    dormantBefore.setUTCDate(dormantBefore.getUTCDate() - input.dormancyDays);
    const cooldownFrom = new Date(localDate);
    cooldownFrom.setUTCDate(cooldownFrom.getUTCDate() - input.cooldownDays);
    const preference = await this.client.lineNotificationPreference.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        userId: input.actorUserId,
        enabled: true,
        reminderEnabled: true,
        notificationConsentAt: { not: null },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
        bunshin: { status: { not: 'ARCHIVED' } },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!preference) return false;
    const [lastActivity, recentReminder] = await Promise.all([
      this.client.missionActivity.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          actorUserId: input.actorUserId,
        },
        select: { dailyMission: { select: { missionDate: true } } },
        orderBy: [{ dailyMission: { missionDate: 'desc' } }, { occurredAt: 'desc' }],
      }),
      this.client.lineMessageDelivery.findFirst({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          userId: input.actorUserId,
          kind: 'REMINDER',
          createdAt: { gte: cooldownFrom },
          status: { in: ['PENDING', 'PROCESSING', 'SENT'] },
        },
        select: { id: true },
      }),
    ]);
    return Boolean(
      lastActivity && lastActivity.dailyMission.missionDate <= dormantBefore && !recentReminder,
    );
  }
}

export class PrismaMissionDeepLinkStateRepository implements MissionDeepLinkStateRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async create(input: Parameters<MissionDeepLinkStateRepository['create']>[0]) {
    const accessible = await this.client.bunshin.findFirst({
      where: lineMissionScope(input),
      select: { id: true },
    });
    if (!accessible) return null;
    try {
      return missionDeepLinkState(
        await this.client.missionDeepLinkState.create({
          data: {
            id: input.id,
            environment: input.environment,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            userId: input.actorUserId,
            dailyMissionId: input.dailyMissionId,
            keyVersion: input.keyVersion,
            expiresAt: input.expiresAt,
          },
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'Mission deep link state already exists');
      throw error;
    }
  }

  async consume(input: Parameters<MissionDeepLinkStateRepository['consume']>[0]) {
    return this.client.$transaction(async (tx) => {
      const state = await tx.missionDeepLinkState.findFirst({
        where: {
          id: input.id,
          environment: input.environment,
          userId: input.actorUserId,
          keyVersion: input.keyVersion,
          expiresAt: input.expiresAt,
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
        },
      });
      if (!state) return null;
      if (state.consumedAt) return missionDeepLinkState(state);
      const claimed = await tx.missionDeepLinkState.updateMany({
        where: {
          id: state.id,
          environment: input.environment,
          userId: input.actorUserId,
          keyVersion: input.keyVersion,
          expiresAt: input.expiresAt,
          consumedAt: null,
        },
        data: { consumedAt: input.now },
      });
      if (claimed.count !== 1) return null;
      return missionDeepLinkState({ ...state, consumedAt: input.now });
    });
  }
}
