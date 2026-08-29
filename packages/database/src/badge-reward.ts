import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  BadgeEntitlementConsumptionRepository,
  BadgeEntitlementUsageRecord,
  BadgeRewardPolicy,
  BadgeRewardRepository,
} from '@bunshin/application';

const usageRecord = (row: {
  id: string;
  workspaceId: string;
  userId: string;
  entitlementId: string;
  featureKey: string;
  resourceType: string;
  resourceId: string;
  operationKey: string;
  estimatedCostUsdMicros: number;
  status: 'CONSUMED' | 'REFUNDED';
  consumedAt: Date;
  refundedAt: Date | null;
  refundReason: string | null;
}): BadgeEntitlementUsageRecord => row;

const samePolicy = (stored: unknown, requested: BadgeRewardPolicy) => {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return false;
  const value = stored as Record<string, unknown>;
  return (
    value['type'] === requested.type &&
    value['featureKey'] === requested.featureKey &&
    value['quantity'] === requested.quantity &&
    (value['expiresInDays'] ?? null) === requested.expiresInDays &&
    value['maxUnitCostUsdMicros'] === requested.maxUnitCostUsdMicros &&
    value['revocationPolicy'] === requested.revocationPolicy
  );
};

export class PrismaBadgeRewardRepository implements BadgeRewardRepository {
  constructor(private readonly client: PrismaClient) {}

  async queue(input: Parameters<BadgeRewardRepository['queue']>[0]) {
    return this.client.$transaction(async (tx) => {
      const existing = await tx.badgeRewardLink.findUnique({
        where: { badgeAwardId: input.badgeAwardId },
        include: { outbox: true },
      });
      if (existing) {
        if (
          existing.workspaceId !== input.workspaceId ||
          existing.userId !== input.userId ||
          !existing.outbox
        )
          return null;
        return {
          rewardLinkId: existing.id,
          outboxId: existing.outbox.id,
          status: existing.status,
          alreadyQueued: true,
        };
      }
      const award = await tx.badgeAward.findFirst({
        where: {
          id: input.badgeAwardId,
          workspaceId: input.workspaceId,
          userId: input.userId,
          status: 'ACTIVE',
        },
        include: { badgeVersion: { select: { rewardPolicy: true, publishedAt: true } } },
      });
      if (
        !award?.badgeVersion.publishedAt ||
        !samePolicy(award.badgeVersion.rewardPolicy, input.policy)
      )
        return null;
      const created = await tx.badgeRewardLink.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          badgeAwardId: award.id,
          badgeVersionId: award.badgeVersionId,
          rewardType: input.policy.type,
          rewardConfigSnapshot: input.policy as unknown as Prisma.InputJsonValue,
          outbox: {
            create: {
              workspaceId: input.workspaceId,
              userId: input.userId,
              availableAt: input.now,
            },
          },
        },
        include: { outbox: true },
      });
      return {
        rewardLinkId: created.id,
        outboxId: created.outbox!.id,
        status: created.status,
        alreadyQueued: false,
      };
    });
  }

  async fulfillEntitlement(input: Parameters<BadgeRewardRepository['fulfillEntitlement']>[0]) {
    return this.client.$transaction(async (tx) => {
      const outbox = await tx.badgeRewardOutbox.findFirst({
        where: {
          id: input.outboxId,
          rewardLinkId: input.rewardLinkId,
          workspaceId: input.workspaceId,
          userId: input.userId,
          status: { in: ['PENDING', 'RETRY', 'PROCESSING', 'COMPLETED'] },
        },
        include: {
          rewardLink: { include: { entitlement: true, badgeAward: { select: { status: true } } } },
        },
      });
      if (!outbox || outbox.rewardLink.badgeAward.status !== 'ACTIVE') return null;
      if (outbox.rewardLink.entitlement) return outbox.rewardLink.entitlement;
      const value = outbox.rewardLink.rewardConfigSnapshot as Record<string, unknown>;
      if (value['type'] !== 'ENTITLEMENT') return null;
      const expiresInDays = value['expiresInDays'] as number | null;
      const expiresAt =
        expiresInDays === null ? null : new Date(input.now.getTime() + expiresInDays * 86_400_000);
      const entitlement = await tx.badgeRewardEntitlement.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          badgeAwardId: outbox.rewardLink.badgeAwardId,
          rewardLinkId: outbox.rewardLink.id,
          featureKey: value['featureKey'] as string,
          quantityGranted: value['quantity'] as number,
          quantityRemaining: value['quantity'] as number,
          maxUnitCostUsdMicros: value['maxUnitCostUsdMicros'] as number,
          revocationPolicy: value['revocationPolicy'] as string,
          expiresAt,
        },
      });
      await tx.badgeRewardLink.update({
        where: { id: outbox.rewardLink.id },
        data: { status: 'COMPLETED', completedAt: input.now },
      });
      await tx.badgeRewardOutbox.update({
        where: { id: outbox.id },
        data: {
          status: 'COMPLETED',
          completedAt: input.now,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      return entitlement;
    });
  }

  async claimNext(input: Parameters<BadgeRewardRepository['claimNext']>[0]) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const claimed = await this.client.$transaction(async (tx) => {
        const candidate = await tx.badgeRewardOutbox.findFirst({
          where: {
            OR: [
              { status: { in: ['PENDING', 'RETRY'] }, availableAt: { lte: input.now } },
              { status: 'PROCESSING', leaseExpiresAt: { lt: input.now } },
            ],
          },
          orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
        });
        if (!candidate) return null;
        const updated = await tx.badgeRewardOutbox.updateMany({
          where: {
            id: candidate.id,
            status: candidate.status,
            updatedAt: candidate.updatedAt,
          },
          data: {
            status: 'PROCESSING',
            attemptCount: { increment: 1 },
            leaseOwner: input.workerId,
            leaseExpiresAt: input.leaseExpiresAt,
            lastFailureCode: null,
          },
        });
        if (updated.count !== 1) return undefined;
        await tx.badgeRewardLink.updateMany({
          where: { id: candidate.rewardLinkId, status: { in: ['PENDING', 'PROCESSING'] } },
          data: { status: 'PROCESSING', failureCode: null },
        });
        return {
          outboxId: candidate.id,
          rewardLinkId: candidate.rewardLinkId,
          workspaceId: candidate.workspaceId,
          userId: candidate.userId,
          attemptCount: candidate.attemptCount + 1,
          maxAttempts: candidate.maxAttempts,
        };
      });
      if (claimed !== undefined) return claimed;
    }
    return null;
  }

  async fail(input: Parameters<BadgeRewardRepository['fail']>[0]) {
    return this.client.$transaction(async (tx) => {
      const current = await tx.badgeRewardOutbox.findFirst({
        where: {
          id: input.outboxId,
          rewardLinkId: input.rewardLinkId,
          status: 'PROCESSING',
          leaseOwner: input.workerId,
        },
      });
      if (!current) return null;
      const dead = current.attemptCount >= current.maxAttempts;
      await tx.badgeRewardOutbox.update({
        where: { id: current.id },
        data: {
          status: dead ? 'DEAD' : 'RETRY',
          availableAt: dead ? current.availableAt : input.retryAt,
          lastFailureCode: input.failureCode,
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: dead ? input.now : null,
        },
      });
      await tx.badgeRewardLink.update({
        where: { id: current.rewardLinkId },
        data: {
          status: dead ? 'FAILED' : 'PENDING',
          failureCode: dead ? input.failureCode : null,
        },
      });
      return dead ? 'DEAD' : 'RETRY';
    });
  }
}

export class PrismaBadgeEntitlementConsumptionRepository implements BadgeEntitlementConsumptionRepository {
  constructor(private readonly client: PrismaClient) {}

  async consume(input: Parameters<BadgeEntitlementConsumptionRepository['consume']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const paymentScope = [
          input.workspaceId,
          input.userId,
          input.resourceType,
          input.resourceId,
        ].join(':');
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${paymentScope}))`;
        const existing = await tx.badgeRewardEntitlementUsage.findUnique({
          where: {
            workspaceId_userId_resourceType_resourceId: {
              workspaceId: input.workspaceId,
              userId: input.userId,
              resourceType: input.resourceType,
              resourceId: input.resourceId,
            },
          },
        });
        if (existing) return usageRecord(existing);
        const entitlement = await tx.badgeRewardEntitlement.findFirst({
          where: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            featureKey: input.featureKey,
            status: 'ACTIVE',
            quantityRemaining: { gt: 0 },
            maxUnitCostUsdMicros: { gte: input.estimatedCostUsdMicros },
            OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
          },
          orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        });
        if (!entitlement) return null;
        const decremented = await tx.badgeRewardEntitlement.updateMany({
          where: {
            id: entitlement.id,
            workspaceId: input.workspaceId,
            userId: input.userId,
            status: 'ACTIVE',
            quantityRemaining: { gt: 0 },
          },
          data: { quantityRemaining: { decrement: 1 } },
        });
        if (decremented.count !== 1) return null;
        if (entitlement.quantityRemaining === 1)
          await tx.badgeRewardEntitlement.update({
            where: { id: entitlement.id },
            data: { status: 'CONSUMED', consumedAt: input.now },
          });
        const created = await tx.badgeRewardEntitlementUsage.create({
          data: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            entitlementId: entitlement.id,
            featureKey: input.featureKey,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            operationKey: input.operationKey,
            estimatedCostUsdMicros: input.estimatedCostUsdMicros,
            consumedAt: input.now,
          },
        });
        return usageRecord(created);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return this.findByResource(input);
      throw error;
    }
  }

  async findByResource(
    input: Parameters<BadgeEntitlementConsumptionRepository['findByResource']>[0],
  ) {
    const row = await this.client.badgeRewardEntitlementUsage.findUnique({
      where: {
        workspaceId_userId_resourceType_resourceId: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
        },
      },
    });
    return row ? usageRecord(row) : null;
  }

  async refund(input: Parameters<BadgeEntitlementConsumptionRepository['refund']>[0]) {
    return this.client.$transaction(async (tx) => {
      const usage = await tx.badgeRewardEntitlementUsage.findFirst({
        where: {
          id: input.usageId,
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
        include: { entitlement: true },
      });
      if (!usage) return null;
      if (usage.status === 'REFUNDED') return usageRecord(usage);
      const transitioned = await tx.badgeRewardEntitlementUsage.updateMany({
        where: { id: usage.id, status: 'CONSUMED' },
        data: { status: 'REFUNDED', refundedAt: input.now, refundReason: input.reason },
      });
      if (transitioned.count !== 1) return null;
      const reactivate =
        usage.entitlement.status === 'CONSUMED' &&
        (!usage.entitlement.expiresAt || usage.entitlement.expiresAt > input.now);
      await tx.badgeRewardEntitlement.update({
        where: { id: usage.entitlementId },
        data: {
          quantityRemaining: { increment: 1 },
          ...(reactivate ? { status: 'ACTIVE' as const, consumedAt: null } : {}),
        },
      });
      const refunded = await tx.badgeRewardEntitlementUsage.findUnique({
        where: { id: usage.id },
      });
      return refunded ? usageRecord(refunded) : null;
    });
  }
}
