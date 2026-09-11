import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaPointExpirationRepository } from '../src/point-expiration';

describe('PrismaPointExpirationRepository', () => {
  it('expires only the unspent part of an expired grant', async () => {
    const now = new Date('2027-03-31T15:00:00Z');
    const tx = {
      pointTransaction: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'grant-1',
          accountId: 'account-1',
          workspaceId: 'workspace-1',
          userId: 'user-1',
          groupId: 'group-1',
          campaignId: null,
          type: 'GRANT',
          amount: 10,
          expiresAt: new Date('2027-03-31T14:59:59Z'),
          consumptions: [{ amount: 3 }],
        }),
        create: vi.fn().mockResolvedValue({ id: 'expiration-1' }),
      },
      pointAccount: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      pointConsumptionLink: { create: vi.fn().mockResolvedValue({ id: 'link-1' }) },
    };
    const runTransaction = vi.fn(async (operation: (transaction: typeof tx) => Promise<number>) =>
      operation(tx),
    );
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'grant-1' }]),
      $transaction: runTransaction,
    } as unknown as PrismaClient;

    await expect(
      new PrismaPointExpirationRepository(client).expireAvailableGrants({ now, limit: 100 }),
    ).resolves.toEqual({ expiredGrants: 1, expiredPoints: 7 });
    expect(tx.pointAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'account-1', availablePoints: { gte: 7 } },
        data: { availablePoints: { decrement: 7 }, revision: { increment: 1 } },
      }),
    );
    expect(tx.pointTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'EXPIRE',
        amount: -7,
        idempotencyKey: 'expire:grant:grant-1',
      }),
    });
    expect(tx.pointConsumptionLink.create).toHaveBeenCalledWith({
      data: {
        consumptionTransactionId: 'expiration-1',
        grantTransactionId: 'grant-1',
        amount: 7,
      },
    });
  });
});
