import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { applyPointCreditToAccount, registerPointRecovery } from '../src/index';

describe('applyPointCreditToAccount', () => {
  it('uses a new credit to clear recovery debt before increasing available points', async () => {
    const createLink = vi.fn().mockResolvedValue({ id: 'link-1' });
    const updateAccount = vi.fn().mockResolvedValue({
      id: 'account-1',
      availablePoints: 3,
      recoveryDue: 0,
    });
    const tx = {
      pointAccount: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'account-1',
          availablePoints: 0,
          recoveryDue: 7,
        }),
        update: updateAccount,
      },
      pointTransaction: {
        findMany: vi.fn().mockResolvedValue([{ id: 'recovery-1', amount: -7, consumptionFor: [] }]),
      },
      pointConsumptionLink: { create: createLink },
    } as unknown as Prisma.TransactionClient;

    await applyPointCreditToAccount(tx, {
      accountId: 'account-1',
      transactionId: 'grant-1',
      amount: 10,
    });

    expect(createLink).toHaveBeenCalledWith({
      data: {
        consumptionTransactionId: 'recovery-1',
        grantTransactionId: 'grant-1',
        amount: 7,
      },
    });
    expect(updateAccount).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: {
        recoveryDue: { decrement: 7 },
        availablePoints: { increment: 3 },
        revision: { increment: 1 },
      },
    });
  });

  it('adds the full credit when there is no recovery debt', async () => {
    const findRecoveries = vi.fn();
    const updateAccount = vi.fn().mockResolvedValue({
      id: 'account-1',
      availablePoints: 10,
      recoveryDue: 0,
    });
    const tx = {
      pointAccount: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'account-1',
          availablePoints: 5,
          recoveryDue: 0,
        }),
        update: updateAccount,
      },
      pointTransaction: { findMany: findRecoveries },
      pointConsumptionLink: { create: vi.fn() },
    } as unknown as Prisma.TransactionClient;

    await applyPointCreditToAccount(tx, {
      accountId: 'account-1',
      transactionId: 'grant-1',
      amount: 5,
    });

    expect(findRecoveries).not.toHaveBeenCalled();
    expect(updateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recoveryDue: { decrement: 0 },
          availablePoints: { increment: 5 },
        }),
      }),
    );
  });
});

describe('registerPointRecovery', () => {
  it('records the full correction and keeps the unavailable part as recovery due', async () => {
    const now = new Date('2026-09-12T00:00:00Z');
    const account = {
      id: 'account-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      availablePoints: 3,
      recoveryDue: 0,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const updated = { ...account, availablePoints: 0, recoveryDue: 7, revision: 2 };
    const transaction = {
      id: 'recovery-1',
      accountId: account.id,
      workspaceId: account.workspaceId,
      userId: account.userId,
      groupId: 'group-1',
      campaignId: null,
      ruleVersionId: null,
      type: 'RECOVERY' as const,
      amount: -10,
      idempotencyKey: 'operator-recovery:operation-1',
      sourceType: 'OPERATOR_RECOVERY',
      sourceId: 'operator-1',
      expiresAt: null,
      createdAt: now,
    };
    const createLink = vi.fn().mockResolvedValue({ id: 'link-1' });
    const tx = {
      pointAccount: {
        findFirst: vi.fn().mockResolvedValue(account),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
      pointTransaction: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(transaction),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'grant-1',
            amount: 3,
            expiresAt: null,
            createdAt: now,
            consumptions: [],
          },
        ]),
      },
      pointConsumptionLink: { create: createLink },
    } as unknown as Prisma.TransactionClient;

    await expect(
      registerPointRecovery(tx, {
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        userId: 'user-1',
        actorUserId: 'operator-1',
        amount: 10,
        idempotencyKey: 'operator-recovery:operation-1',
        now,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        applied: true,
        recoveredPoints: 3,
        recoveryAdded: 7,
        account: expect.objectContaining({ availablePoints: 0, recoveryDue: 7 }),
      }),
    );
    expect(createLink).toHaveBeenCalledWith({
      data: {
        consumptionTransactionId: 'recovery-1',
        grantTransactionId: 'grant-1',
        amount: 3,
      },
    });
  });

  it('does not apply the same operator recovery twice', async () => {
    const now = new Date('2026-09-12T00:00:00Z');
    const existing = {
      id: 'recovery-1',
      type: 'RECOVERY',
      amount: -10,
      workspaceId: 'workspace-1',
      userId: 'user-1',
      groupId: 'group-1',
      sourceType: 'OPERATOR_RECOVERY',
      sourceId: 'operator-1',
    };
    const updateMany = vi.fn();
    const tx = {
      pointAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'account-1',
          availablePoints: 0,
          recoveryDue: 10,
          revision: 2,
        }),
        updateMany,
      },
      pointTransaction: { findUnique: vi.fn().mockResolvedValue(existing) },
    } as unknown as Prisma.TransactionClient;

    await expect(
      registerPointRecovery(tx, {
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        userId: 'user-1',
        actorUserId: 'operator-1',
        amount: 10,
        idempotencyKey: 'operator-recovery:operation-1',
        now,
      }),
    ).resolves.toEqual({ applied: false });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
