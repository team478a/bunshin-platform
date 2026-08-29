import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  BadgeRewardOperationItem,
  BadgeRewardOperationsRepository,
} from '@bunshin/application';

const operationInclude = Prisma.validator<Prisma.BadgeRewardLinkInclude>()({
  badgeAward: {
    include: {
      workspace: { select: { name: true } },
      group: { select: { name: true } },
      user: { select: { displayName: true } },
      badgeVersion: { select: { title: true } },
    },
  },
  outbox: true,
  entitlement: true,
});
type OperationRow = Prisma.BadgeRewardLinkGetPayload<{ include: typeof operationInclude }>;

const operationItem = (row: OperationRow): BadgeRewardOperationItem => ({
  rewardLinkId: row.id,
  workspaceId: row.workspaceId,
  workspaceName: row.badgeAward.workspace.name,
  groupId: row.badgeAward.groupId,
  groupName: row.badgeAward.group?.name ?? null,
  userId: row.userId,
  userDisplayName: row.badgeAward.user.displayName,
  badgeTitle: row.badgeAward.badgeVersion.title,
  linkStatus: row.status,
  outboxStatus: row.outbox?.status ?? 'CANCELLED',
  attemptCount: row.outbox?.attemptCount ?? 0,
  maxAttempts: row.outbox?.maxAttempts ?? 0,
  failureCode: row.failureCode ?? row.outbox?.lastFailureCode ?? null,
  entitlementStatus: row.entitlement?.status ?? null,
  quantityRemaining: row.entitlement?.quantityRemaining ?? null,
  expiresAt: row.entitlement?.expiresAt ?? null,
  updatedAt: row.updatedAt,
});

const safeSnapshot = (value: Prisma.JsonValue) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  if (
    snapshot['type'] !== 'ENTITLEMENT' ||
    typeof snapshot['featureKey'] !== 'string' ||
    !Number.isSafeInteger(snapshot['quantity']) ||
    (snapshot['quantity'] as number) < 1 ||
    !Number.isSafeInteger(snapshot['maxUnitCostUsdMicros']) ||
    (snapshot['maxUnitCostUsdMicros'] as number) < 0 ||
    snapshot['revocationPolicy'] !== 'REVOKE_UNUSED'
  )
    return null;
  const expiresInDays = snapshot['expiresInDays'];
  if (
    expiresInDays !== null &&
    (!Number.isSafeInteger(expiresInDays) || (expiresInDays as number) < 1)
  )
    return null;
  return {
    featureKey: snapshot['featureKey'],
    quantity: snapshot['quantity'] as number,
    maxUnitCostUsdMicros: snapshot['maxUnitCostUsdMicros'] as number,
    revocationPolicy: snapshot['revocationPolicy'],
    expiresInDays: expiresInDays as number | null,
  };
};

export class PrismaBadgeRewardOperationsRepository implements BadgeRewardOperationsRepository {
  constructor(private readonly client: PrismaClient) {}

  async inspect(input: Parameters<BadgeRewardOperationsRepository['inspect']>[0]) {
    const where = input.workspaceId ? { workspaceId: input.workspaceId } : {};
    const [rewards, usages, audits] = await Promise.all([
      this.client.badgeRewardLink.findMany({
        where,
        include: operationInclude,
        orderBy: { updatedAt: 'desc' },
        take: input.limit,
      }),
      this.client.badgeRewardEntitlementUsage.findMany({
        where,
        include: {
          entitlement: {
            include: {
              rewardLink: {
                include: {
                  badgeAward: {
                    include: {
                      workspace: { select: { name: true } },
                      user: { select: { displayName: true } },
                      badgeVersion: { select: { title: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      }),
      this.client.badgeAdminAuditLog.findMany({
        where: {
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
          action: { in: ['BADGE_REWARD_MANUAL_FULFILL', 'BADGE_REWARD_RETRY'] },
        },
        include: {
          performedBy: { select: { displayName: true } },
          badgeAward: { include: { rewardLink: { select: { id: true } } } },
        },
        orderBy: { occurredAt: 'desc' },
        take: input.limit,
      }),
    ]);
    return {
      rewards: rewards.map(operationItem),
      usages: usages.map((row) => ({
        usageId: row.id,
        workspaceId: row.workspaceId,
        workspaceName: row.entitlement.rewardLink.badgeAward.workspace.name,
        userDisplayName: row.entitlement.rewardLink.badgeAward.user.displayName,
        badgeTitle: row.entitlement.rewardLink.badgeAward.badgeVersion.title,
        featureKey: row.featureKey,
        resourceType: row.resourceType,
        status: row.status,
        consumedAt: row.consumedAt,
        refundedAt: row.refundedAt,
        refundReason: row.refundReason,
      })),
      audits: audits.map((row) => ({
        auditId: row.id,
        workspaceId: row.workspaceId,
        rewardLinkId: row.badgeAward?.rewardLink?.id ?? null,
        action: row.action,
        reason: row.reason,
        performedBy: row.performedBy.displayName,
        occurredAt: row.occurredAt,
      })),
    };
  }

  async retry(input: Parameters<BadgeRewardOperationsRepository['retry']>[0]) {
    return this.client.$transaction(async (tx) => {
      const current = await tx.badgeRewardLink.findFirst({
        where: { id: input.rewardLinkId, workspaceId: input.workspaceId },
        include: operationInclude,
      });
      if (!current?.outbox || current.entitlement) return null;
      if (current.status !== 'FAILED' && current.outbox.status !== 'DEAD') return null;
      await tx.badgeRewardOutbox.update({
        where: { id: current.outbox.id },
        data: {
          status: 'RETRY',
          attemptCount: 0,
          availableAt: input.now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastFailureCode: null,
          completedAt: null,
        },
      });
      await tx.badgeRewardLink.update({
        where: { id: current.id },
        data: { status: 'PENDING', failureCode: null, completedAt: null },
      });
      await tx.badgeAdminAuditLog.create({
        data: {
          workspaceId: current.workspaceId,
          groupId: current.badgeAward.groupId,
          badgeVersionId: current.badgeVersionId,
          badgeAwardId: current.badgeAwardId,
          action: 'BADGE_REWARD_RETRY',
          beforeData: {
            linkStatus: current.status,
            outboxStatus: current.outbox.status,
            failureCode: current.failureCode ?? current.outbox.lastFailureCode,
          },
          afterData: { linkStatus: 'PENDING', outboxStatus: 'RETRY', attemptCount: 0 },
          reason: input.reason,
          performedByUserId: input.actorUserId,
          occurredAt: input.now,
        },
      });
      const updated = await tx.badgeRewardLink.findUnique({
        where: { id: current.id },
        include: operationInclude,
      });
      return updated ? operationItem(updated) : null;
    });
  }

  async fulfillManually(input: Parameters<BadgeRewardOperationsRepository['fulfillManually']>[0]) {
    return this.client.$transaction(async (tx) => {
      const current = await tx.badgeRewardLink.findFirst({
        where: { id: input.rewardLinkId, workspaceId: input.workspaceId },
        include: operationInclude,
      });
      if (!current?.outbox || current.entitlement || current.badgeAward.status !== 'ACTIVE')
        return null;
      if (
        !['PENDING', 'FAILED'].includes(current.status) ||
        !['PENDING', 'RETRY', 'DEAD'].includes(current.outbox.status)
      )
        return null;
      const snapshot = safeSnapshot(current.rewardConfigSnapshot);
      if (!snapshot) return null;
      const expiresAt = snapshot.expiresInDays
        ? new Date(input.now.getTime() + snapshot.expiresInDays * 86_400_000)
        : null;
      await tx.badgeRewardEntitlement.create({
        data: {
          workspaceId: current.workspaceId,
          userId: current.userId,
          badgeAwardId: current.badgeAwardId,
          rewardLinkId: current.id,
          featureKey: snapshot.featureKey,
          quantityGranted: snapshot.quantity,
          quantityRemaining: snapshot.quantity,
          maxUnitCostUsdMicros: snapshot.maxUnitCostUsdMicros,
          revocationPolicy: snapshot.revocationPolicy,
          expiresAt,
        },
      });
      await tx.badgeRewardLink.update({
        where: { id: current.id },
        data: { status: 'COMPLETED', failureCode: null, completedAt: input.now },
      });
      await tx.badgeRewardOutbox.update({
        where: { id: current.outbox.id },
        data: {
          status: 'COMPLETED',
          completedAt: input.now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastFailureCode: null,
        },
      });
      await tx.badgeAdminAuditLog.create({
        data: {
          workspaceId: current.workspaceId,
          groupId: current.badgeAward.groupId,
          badgeVersionId: current.badgeVersionId,
          badgeAwardId: current.badgeAwardId,
          action: 'BADGE_REWARD_MANUAL_FULFILL',
          beforeData: {
            linkStatus: current.status,
            outboxStatus: current.outbox.status,
            failureCode: current.failureCode ?? current.outbox.lastFailureCode,
          },
          afterData: {
            linkStatus: 'COMPLETED',
            outboxStatus: 'COMPLETED',
            featureKey: snapshot.featureKey,
            quantity: snapshot.quantity,
            expiresAt: expiresAt?.toISOString() ?? null,
          },
          reason: input.reason,
          performedByUserId: input.actorUserId,
          occurredAt: input.now,
        },
      });
      const updated = await tx.badgeRewardLink.findUnique({
        where: { id: current.id },
        include: operationInclude,
      });
      return updated ? operationItem(updated) : null;
    });
  }
}
