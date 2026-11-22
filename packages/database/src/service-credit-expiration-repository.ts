import { remainingServiceCreditLots } from './service-credit-lots';
import type { ServiceCreditExpirationRepository } from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';

export class PrismaServiceCreditExpirationRepository implements ServiceCreditExpirationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async expire(input: Parameters<ServiceCreditExpirationRepository['expire']>[0]) {
    const accounts = await this.client.serviceCreditAccount.findMany({
      where: {
        ledgerEntries: { some: { type: 'GRANT', expiresAt: { lte: input.now } } },
      },
      select: { id: true, workspaceId: true, groupId: true, groupMembershipId: true, userId: true },
      take: input.limit,
    });
    let expired = 0;
    for (const account of accounts) {
      expired += await this.client.$transaction(
        async (tx) => {
          const entries = await tx.serviceCreditLedger.findMany({
            where: {
              accountId: account.id,
              workspaceId: account.workspaceId,
              groupId: account.groupId,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              type: true,
              amount: true,
              expiresAt: true,
              sourceId: true,
              lotAllocations: true,
            },
          });
          const lots = remainingServiceCreditLots(entries);
          const expiredLots = [...lots.entries()].filter(
            ([, lot]) => lot.remaining > 0 && lot.expiresAt !== null && lot.expiresAt <= input.now,
          );
          const amount = expiredLots.reduce((sum, [, lot]) => sum + lot.remaining, 0);
          if (amount === 0) return 0;
          const updated = await tx.serviceCreditAccount.update({
            where: { id: account.id },
            data: { availableCredits: { decrement: amount }, revision: { increment: 1 } },
            select: { availableCredits: true },
          });
          for (const [grantId, lot] of expiredLots) {
            await tx.serviceCreditLedger.create({
              data: {
                workspaceId: account.workspaceId,
                groupId: account.groupId,
                accountId: account.id,
                userId: account.userId,
                type: 'EXPIRE',
                amount: -lot.remaining,
                balanceAfter: updated.availableCredits,
                sourceType: 'SYSTEM',
                sourceId: `grant:${grantId}`,
                idempotencyKey: `expire:grant:${grantId}`,
                expiresAt: null,
                createdAt: input.now,
              },
            });
          }
          return amount;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }
    return expired;
  }
}
