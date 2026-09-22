import { applyPointRewardSettings } from '@bunshin/application';
import type {
  PointRedemptionRecord,
  PointRedemptionRepository,
  PointRewardCatalogItemRecord,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';
import { applyPointCreditToAccount } from './point-account';

const pointCatalogItemRecord = (
  row: Prisma.PointRewardCatalogItemGetPayload<object>,
): PointRewardCatalogItemRecord => ({
  id: row.id,
  rewardKey: row.rewardKey,
  version: row.version,
  rewardType: row.rewardType,
  title: row.title,
  description: row.description,
  pointCost: row.pointCost,
});

const pointRedemptionRecord = (
  row: Prisma.PointRedemptionGetPayload<object>,
): PointRedemptionRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  accountId: row.accountId,
  catalogItemId: row.catalogItemId,
  consumptionTransactionId: row.consumptionTransactionId,
  status: row.status,
  pointCost: row.pointCost,
  idempotencyKey: row.idempotencyKey,
  resourceType: row.resourceType,
  resourceId: row.resourceId,
  reservedAt: row.reservedAt,
  reservationExpiresAt: row.reservationExpiresAt,
  confirmedAt: row.confirmedAt,
  releasedAt: row.releasedAt,
  refundedAt: row.refundedAt,
  failureReason: row.failureReason,
});

export class PrismaPointRedemptionRepository implements PointRedemptionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async activeMember(workspaceId: string, userId: string, groupId?: string | null) {
    if (groupId)
      return this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId,
          status: 'ACTIVE',
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
          user: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
    return this.client.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  async listCatalog(input: Parameters<PointRedemptionRepository['listCatalog']>[0]) {
    if (!(await this.activeMember(input.workspaceId, input.actorUserId, input.groupId)))
      return null;
    const [rows, settings] = await Promise.all([
      this.client.pointRewardCatalogItem.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
        },
        orderBy: [{ rewardKey: 'asc' }, { version: 'desc' }],
      }),
      input.groupId
        ? this.client.servicePointRewardSetting.findMany({
            where: { workspaceId: input.workspaceId, groupId: input.groupId },
            select: { rewardType: true, status: true, pointCost: true },
          })
        : Promise.resolve([]),
    ]);
    const unique = new Map<string, (typeof rows)[number]>();
    rows.forEach((row) => {
      if (!unique.has(row.rewardKey)) unique.set(row.rewardKey, row);
    });
    return applyPointRewardSettings(
      [...unique.values()].map(pointCatalogItemRecord),
      settings.map((setting) => ({
        rewardType: setting.rewardType,
        status: setting.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
        pointCost: setting.pointCost,
      })),
    );
  }

  async reserve(input: Parameters<PointRedemptionRepository['reserve']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const member = input.groupId
          ? await tx.groupMembership.findFirst({
              where: {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                userId: input.actorUserId,
                status: 'ACTIVE',
                group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
                user: { status: 'ACTIVE' },
              },
              select: { id: true },
            })
          : await tx.workspaceMembership.findFirst({
              where: {
                workspaceId: input.workspaceId,
                userId: input.actorUserId,
                status: 'ACTIVE',
                workspace: { status: 'ACTIVE' },
                user: { status: 'ACTIVE' },
              },
              select: { id: true },
            });
        if (!member) return null;
        const account = await tx.pointAccount.findUnique({
          where: {
            workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId },
          },
        });
        if (!account) return null;
        const existing = await tx.pointRedemption.findUnique({
          where: {
            accountId_idempotencyKey: {
              accountId: account.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { consumptionTransaction: { select: { groupId: true } } },
        });
        if (existing) {
          if (
            existing.catalogItemId !== input.catalogItemId ||
            existing.resourceType !== input.resourceType ||
            existing.resourceId !== input.resourceId ||
            (existing.consumptionTransaction.groupId !== null &&
              existing.consumptionTransaction.groupId !== (input.groupId ?? null))
          )
            throw new ApplicationError('CONFLICT', 'idempotency key payload mismatch');
          return pointRedemptionRecord(existing);
        }
        const item = await tx.pointRewardCatalogItem.findFirst({
          where: {
            id: input.catalogItemId,
            status: 'ACTIVE',
            OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
          },
        });
        if (!item) return null;
        const setting = input.groupId
          ? await tx.servicePointRewardSetting.findUnique({
              where: {
                workspaceId_groupId_rewardType: {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  rewardType: item.rewardType,
                },
              },
              select: { status: true, pointCost: true },
            })
          : null;
        if (setting && setting.status !== 'ACTIVE') return null;
        const pointCost = setting?.pointCost ?? item.pointCost;
        if (input.expectedPointCost !== undefined && input.expectedPointCost !== pointCost)
          throw new ApplicationError('CONFLICT', 'point reward cost changed', {
            currentPointCost: pointCost,
          });
        const changed = await tx.pointAccount.updateMany({
          where: { id: account.id, availablePoints: { gte: pointCost }, recoveryDue: 0 },
          data: { availablePoints: { decrement: pointCost }, revision: { increment: 1 } },
        });
        if (changed.count !== 1) return null;
        const consumption = await tx.pointTransaction.create({
          data: {
            accountId: account.id,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            groupId: input.groupId ?? null,
            type: 'CONSUME',
            amount: -pointCost,
            idempotencyKey: `redemption:${input.idempotencyKey}`,
            sourceType: 'POINT_REDEMPTION',
            sourceId: null,
          },
        });
        const grants = await tx.pointTransaction.findMany({
          where: {
            accountId: account.id,
            type: { in: ['GRANT', 'REFUND'] },
            OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
          },
          include: { consumptions: true },
        });
        grants.sort((left, right) => {
          if (left.expiresAt === null) return right.expiresAt === null ? 0 : 1;
          if (right.expiresAt === null) return -1;
          return left.expiresAt.getTime() - right.expiresAt.getTime();
        });
        let remaining = pointCost;
        for (const grant of grants) {
          const used = grant.consumptions.reduce((sum, link) => sum + link.amount, 0);
          const amount = Math.min(remaining, Math.max(0, grant.amount - used));
          if (amount === 0) continue;
          await tx.pointConsumptionLink.create({
            data: {
              consumptionTransactionId: consumption.id,
              grantTransactionId: grant.id,
              amount,
            },
          });
          remaining -= amount;
          if (remaining === 0) break;
        }
        if (remaining !== 0)
          throw new ApplicationError('CONFLICT', 'point ledger balance mismatch');
        const redemption = await tx.pointRedemption.create({
          data: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            accountId: account.id,
            catalogItemId: item.id,
            consumptionTransactionId: consumption.id,
            pointCost,
            idempotencyKey: input.idempotencyKey,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            reservedAt: input.now,
            reservationExpiresAt: input.reservationExpiresAt,
          },
        });
        await tx.pointTransaction.update({
          where: { id: consumption.id },
          data: { sourceId: redemption.id },
        });
        return pointRedemptionRecord(redemption);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findOwnedByResource(
    input: Parameters<PointRedemptionRepository['findOwnedByResource']>[0],
  ) {
    const row = await this.client.pointRedemption.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
        user: { status: 'ACTIVE' },
      },
    });
    return row ? pointRedemptionRecord(row) : null;
  }

  async transition(input: Parameters<PointRedemptionRepository['transition']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const redemption = await tx.pointRedemption.findFirst({
          where: {
            id: input.redemptionId,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            workspace: { memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } } },
          },
        });
        if (!redemption) return null;
        if (redemption.status === input.targetStatus) return pointRedemptionRecord(redemption);
        const expected = input.targetStatus === 'REFUNDED' ? 'CONFIRMED' : 'RESERVED';
        if (redemption.status !== expected) return null;
        if (input.targetStatus === 'CONFIRMED' && redemption.reservationExpiresAt <= input.now)
          return null;
        if (input.targetStatus !== 'CONFIRMED') {
          const refundKey = `redemption:${redemption.id}:${input.targetStatus}`;
          const refund = await tx.pointTransaction.create({
            data: {
              accountId: redemption.accountId,
              workspaceId: redemption.workspaceId,
              userId: redemption.userId,
              type: 'REFUND',
              amount: redemption.pointCost,
              idempotencyKey: refundKey,
              sourceType: 'POINT_REDEMPTION_REFUND',
              sourceId: redemption.consumptionTransactionId,
            },
          });
          await applyPointCreditToAccount(tx, {
            accountId: redemption.accountId,
            transactionId: refund.id,
            amount: redemption.pointCost,
          });
        }
        const updated = await tx.pointRedemption.update({
          where: { id: redemption.id },
          data:
            input.targetStatus === 'CONFIRMED'
              ? { status: 'CONFIRMED', confirmedAt: input.now }
              : input.targetStatus === 'RELEASED'
                ? { status: 'RELEASED', releasedAt: input.now, failureReason: input.reason }
                : { status: 'REFUNDED', refundedAt: input.now, failureReason: input.reason },
        });
        return pointRedemptionRecord(updated);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async releaseExpired(input: Parameters<PointRedemptionRepository['releaseExpired']>[0]) {
    const candidates = await this.client.pointRedemption.findMany({
      where: { status: 'RESERVED', reservationExpiresAt: { lte: input.now } },
      select: { id: true },
      orderBy: { reservationExpiresAt: 'asc' },
      take: input.limit,
    });
    let released = 0;
    for (const candidate of candidates) {
      const changed = await this.client.$transaction(
        async (tx) => {
          const redemption = await tx.pointRedemption.findUnique({ where: { id: candidate.id } });
          if (
            !redemption ||
            redemption.status !== 'RESERVED' ||
            redemption.reservationExpiresAt > input.now
          )
            return false;
          const claimed = await tx.pointRedemption.updateMany({
            where: { id: redemption.id, status: 'RESERVED' },
            data: {
              status: 'RELEASED',
              releasedAt: input.now,
              failureReason: 'RESERVATION_EXPIRED',
            },
          });
          if (claimed.count !== 1) return false;
          const refund = await tx.pointTransaction.create({
            data: {
              accountId: redemption.accountId,
              workspaceId: redemption.workspaceId,
              userId: redemption.userId,
              type: 'REFUND',
              amount: redemption.pointCost,
              idempotencyKey: `redemption:${redemption.id}:RELEASED`,
              sourceType: 'POINT_REDEMPTION_REFUND',
              sourceId: redemption.consumptionTransactionId,
            },
          });
          await applyPointCreditToAccount(tx, {
            accountId: redemption.accountId,
            transactionId: refund.id,
            amount: redemption.pointCost,
          });
          return true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (changed) released += 1;
    }
    return released;
  }
}
