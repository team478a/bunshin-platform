import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  createAdminSupportCase,
  listAdminSupportCases,
  updateAdminSupportCase,
} from '../src/admin-support-cases';

function transactionalClient(transaction: object) {
  return {
    $transaction: vi.fn((operation: (client: object) => unknown) =>
      Promise.resolve(operation(transaction)),
    ),
  } as unknown as PrismaClient;
}

describe('admin support case persistence', () => {
  it('does not inspect the target user when the actor lacks a support role', async () => {
    const findUnique = vi.fn();
    const client = transactionalClient({
      platformAdmin: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { findUnique },
      supportCase: { create: vi.fn() },
    });

    await expect(
      createAdminSupportCase(client, {
        actorUserId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        subject: '接続確認',
        priority: 'NORMAL',
        note: 'LINE接続状況を確認する',
      }),
    ).resolves.toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('scopes updates to both the support case and target user', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: crypto.randomUUID() })
      .mockResolvedValueOnce(null);
    const update = vi.fn();
    const client = transactionalClient({
      platformAdmin: { findFirst },
      supportCase: { findFirst, update },
    });
    const userId = crypto.randomUUID();
    const supportCaseId = crypto.randomUUID();

    await expect(
      updateAdminSupportCase(client, {
        actorUserId: crypto.randomUUID(),
        userId,
        supportCaseId,
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        assigneeUserId: null,
        note: '利用者へ状況を確認した',
      }),
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenLastCalledWith({
      where: { id: supportCaseId, targetUserId: userId },
      select: { id: true },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('does not list support cases for an inactive administrator', async () => {
    const findMany = vi.fn();
    const client = {
      platformAdmin: { findFirst: vi.fn().mockResolvedValue(null) },
      supportCase: { findMany },
    } as unknown as PrismaClient;

    await expect(
      listAdminSupportCases(client, {
        actorUserId: crypto.randomUUID(),
        status: null,
      }),
    ).resolves.toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });
});
