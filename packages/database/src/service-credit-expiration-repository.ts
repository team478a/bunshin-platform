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
            select: { id: true, type: true, amount: true, expiresAt: true, sourceId: true },
          });
          const lots = new Map<string, { remaining: number; expiresAt: Date | null }>();
          const consume = (amount: number) => {
            let remaining = amount;
            const candidates = [...lots.entries()]
              .filter(([, lot]) => lot.remaining > 0)
              .sort(([, left], [, right]) => {
                if (left.expiresAt === null) return right.expiresAt === null ? 0 : 1;
                if (right.expiresAt === null) return -1;
                return left.expiresAt.getTime() - right.expiresAt.getTime();
              });
            for (const [, lot] of candidates) {
              const used = Math.min(lot.remaining, remaining);
              lot.remaining -= used;
              remaining -= used;
              if (remaining === 0) break;
            }
          };
          for (const entry of entries) {
            if (entry.type === 'GRANT')
              lots.set(entry.id, { remaining: entry.amount, expiresAt: entry.expiresAt });
            else if (entry.type === 'CONSUME' || (entry.type === 'ADJUST' && entry.amount < 0))
              consume(-entry.amount);
            else if (entry.type === 'REFUND' || (entry.type === 'ADJUST' && entry.amount > 0))
              lots.set(entry.id, { remaining: entry.amount, expiresAt: null });
            else if (entry.type === 'EXPIRE' && entry.sourceId?.startsWith('grant:')) {
              const grant = lots.get(entry.sourceId.slice('grant:'.length));
              if (grant) grant.remaining = Math.max(0, grant.remaining + entry.amount);
            }
          }
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
