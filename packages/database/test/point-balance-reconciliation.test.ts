import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaPointBalanceReconciliationRepository } from '../src/point-balance-reconciliation';

const source = readFileSync(
  fileURLToPath(new URL('../src/point-balance-reconciliation.ts', import.meta.url)),
  'utf8',
);
const schema = readFileSync(
  fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
  'utf8',
);

describe('point balance reconciliation persistence boundaries', () => {
  it('compares every account with its complete append-only ledger', () => {
    expect(source).toContain('LEFT JOIN "point_transactions"');
    expect(source).toContain('COALESCE(SUM(ledger."amount"), 0)');
    expect(source).toContain('"storedBalance"::bigint <> balances."ledgerBalance"');
    expect(source).toContain('this.client.pointAccount.count()');
  });

  it('bounds the returned details while preserving the total mismatch count', () => {
    expect(source).toContain('COUNT(*) OVER() AS "mismatchCount"');
    expect(source).toContain('LIMIT ${input.limit}');
  });

  it('repairs only the unchanged account and records a durable audit', () => {
    expect(source).toContain("role: 'SUPER_ADMIN'");
    expect(source).toContain('revision: input.expectedRevision');
    expect(source).toContain('ledgerBalance !== input.expectedLedgerBalance');
    expect(source).toContain('availablePoints: Math.max(0, ledgerBalance)');
    expect(source).toContain('recoveryDue: Math.max(0, -ledgerBalance)');
    expect(source).toContain('pointBalanceRepairAudit.create');
    expect(source).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(schema).toContain('model PointBalanceRepairAudit');
    expect(schema).toContain('previousBalance');
    expect(schema).toContain('performedByUserId');
  });

  it('updates the cached balance and audit in one serializable transaction', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const createAudit = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const tx = {
      platformAdmin: { findFirst: vi.fn().mockResolvedValue({ id: 'admin-1' }) },
      pointAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'account-1', availablePoints: 20, recoveryDue: 0, revision: 3 }),
        updateMany,
      },
      pointTransaction: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 15 } }) },
      pointBalanceRepairAudit: { create: createAudit },
    };
    type TransactionCallback = (transaction: typeof tx) => Promise<unknown>;
    const client = {
      $transaction: vi.fn((callback: TransactionCallback) => callback(tx)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaPointBalanceReconciliationRepository(client).repair({
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        actorUserId: 'admin-1',
        expectedStoredBalance: 20,
        expectedLedgerBalance: 15,
        expectedRevision: 3,
        reason: '障害調査で表示残高のずれを確認したため',
      }),
    ).resolves.toEqual({ accountId: 'account-1', previousBalance: 20, repairedBalance: 15 });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ availablePoints: 20, recoveryDue: 0, revision: 3 }),
        data: { availablePoints: 15, recoveryDue: 0, revision: { increment: 1 } },
      }),
    );
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ previousBalance: 20, repairedBalance: 15 }),
      }),
    );
  });

  it('repairs a negative ledger total as recovery due without making the balance negative', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      platformAdmin: { findFirst: vi.fn().mockResolvedValue({ id: 'admin-1' }) },
      pointAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'account-1', availablePoints: 0, recoveryDue: 10, revision: 3 }),
        updateMany,
      },
      pointTransaction: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: -15 } }) },
      pointBalanceRepairAudit: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    type TransactionCallback = (transaction: typeof tx) => Promise<unknown>;
    const client = {
      $transaction: vi.fn((callback: TransactionCallback) => callback(tx)),
    } as unknown as PrismaClient;

    await new PrismaPointBalanceReconciliationRepository(client).repair({
      accountId: 'account-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      actorUserId: 'admin-1',
      expectedStoredBalance: -10,
      expectedLedgerBalance: -15,
      expectedRevision: 3,
      reason: '回収未済額と履歴の差を確認したため',
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { availablePoints: 0, recoveryDue: 15, revision: { increment: 1 } },
      }),
    );
  });
});
