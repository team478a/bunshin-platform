import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { setAdminMetricExclusion, setAdminUserStatus } from '../src/admin-user-operations';

function transactionalClient(transaction: object) {
  return {
    $transaction: vi.fn((operation: (client: object) => unknown) =>
      Promise.resolve(operation(transaction)),
    ),
  } as unknown as PrismaClient;
}

describe('admin user operations persistence', () => {
  it('does not inspect a target user unless the actor is an active super administrator', async () => {
    const findUnique = vi.fn();
    const client = transactionalClient({
      platformAdmin: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { findUnique },
    });

    await expect(
      setAdminUserStatus(client, {
        actorUserId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        status: 'SUSPENDED',
        reason: '運用上の確認が必要なため',
      }),
    ).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('disables LINE notifications and records an audit when suspending a user', async () => {
    const targetId = crypto.randomUUID();
    const update = vi.fn().mockResolvedValue({ id: targetId });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const createAudit = vi.fn().mockResolvedValue({ id: crypto.randomUUID() });
    const client = transactionalClient({
      platformAdmin: { findFirst: vi.fn().mockResolvedValue({ id: crypto.randomUUID() }) },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: targetId,
          status: 'ACTIVE',
          platformAdmin: null,
        }),
        update,
      },
      lineNotificationPreference: { updateMany },
      userOperationAudit: { create: createAudit },
    });
    const actorUserId = crypto.randomUUID();

    await expect(
      setAdminUserStatus(client, {
        actorUserId,
        userId: targetId,
        status: 'SUSPENDED',
        reason: '利用状況を確認するため',
      }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: targetId, enabled: true },
      data: { enabled: false },
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: {
        targetUserId: targetId,
        actorUserId,
        action: 'SUSPENDED',
        previousStatus: 'ACTIVE',
        nextStatus: 'SUSPENDED',
        reason: '利用状況を確認するため',
      },
    });
  });

  it('does not duplicate an unchanged metric exclusion state', async () => {
    const create = vi.fn();
    const client = transactionalClient({
      platformAdmin: { findFirst: vi.fn().mockResolvedValue({ id: crypto.randomUUID() }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: crypto.randomUUID() }) },
      activityMetricExclusion: {
        findFirst: vi.fn().mockResolvedValue({ action: 'EXCLUDED' }),
        create,
      },
    });

    await expect(
      setAdminMetricExclusion(client, {
        actorUserId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        environment: 'PRODUCTION',
        excluded: true,
        reason: '社内確認用アカウントのため',
      }),
    ).resolves.toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
