import { Prisma, type PrismaClient } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import type { PointExpirationRepository } from '@bunshin/application';

export class PrismaPointExpirationRepository implements PointExpirationRepository {
  constructor(private readonly client: PrismaClient) {}

  async expireAvailableGrants(input: { now: Date; limit: number }) {
    const candidates = await this.client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT grant_transaction."id"
      FROM "point_transactions" grant_transaction
      LEFT JOIN "point_consumption_links" consumption
        ON consumption."grant_transaction_id" = grant_transaction."id"
      WHERE grant_transaction."type" IN ('GRANT', 'REFUND')
        AND grant_transaction."expires_at" IS NOT NULL
        AND grant_transaction."expires_at" <= ${input.now}
      GROUP BY grant_transaction."id", grant_transaction."amount", grant_transaction."expires_at"
      HAVING grant_transaction."amount" > COALESCE(SUM(consumption."amount"), 0)
      ORDER BY grant_transaction."expires_at" ASC, grant_transaction."id" ASC
      LIMIT ${input.limit}
    `);
    let expiredGrants = 0;
    let expiredPoints = 0;
    for (const candidate of candidates) {
      try {
        const amount = await this.client.$transaction(
          async (tx) => {
            const grant = await tx.pointTransaction.findUnique({
              where: { id: candidate.id },
              include: { consumptions: { select: { amount: true } } },
            });
            if (
              !grant ||
              !['GRANT', 'REFUND'].includes(grant.type) ||
              grant.expiresAt === null ||
              grant.expiresAt > input.now
            )
              return 0;
            const used = grant.consumptions.reduce((sum, link) => sum + link.amount, 0);
            const remaining = grant.amount - used;
            if (remaining <= 0) return 0;
            const changed = await tx.pointAccount.updateMany({
              where: { id: grant.accountId, availablePoints: { gte: remaining } },
              data: { availablePoints: { decrement: remaining }, revision: { increment: 1 } },
            });
            if (changed.count !== 1)
              throw new ApplicationError('CONFLICT', 'point ledger balance mismatch');
            const expiration = await tx.pointTransaction.create({
              data: {
                accountId: grant.accountId,
                workspaceId: grant.workspaceId,
                userId: grant.userId,
                groupId: grant.groupId,
                campaignId: grant.campaignId,
                type: 'EXPIRE',
                amount: -remaining,
                idempotencyKey: `expire:grant:${grant.id}`,
                sourceType: 'POINT_EXPIRATION',
                sourceId: grant.id,
              },
            });
            await tx.pointConsumptionLink.create({
              data: {
                consumptionTransactionId: expiration.id,
                grantTransactionId: grant.id,
                amount: remaining,
              },
            });
            return remaining;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        if (amount > 0) {
          expiredGrants += 1;
          expiredPoints += amount;
        }
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034')
        )
          continue;
        throw error;
      }
    }
    return { expiredGrants, expiredPoints };
  }
}
