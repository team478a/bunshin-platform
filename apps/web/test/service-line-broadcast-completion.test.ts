import { describe, expect, it, vi } from 'vitest';
import {
  completeServiceLineBroadcast,
  exhaustPendingServiceLineBroadcastRecipients,
} from '../src/jobs/service-line-broadcast-completion';
import type {
  ServiceLineBroadcastDatabase,
  ServiceLineBroadcastDeliveryRecord,
} from '../src/jobs/service-line-broadcast-delivery-types';

const broadcast: ServiceLineBroadcastDeliveryRecord = {
  id: 'broadcast-1',
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  message: '本文',
  segmentCriteria: {},
  updatedByUserId: 'user-1',
};
const completedAt = new Date('2026-09-26T05:00:00.000Z');

function database(updateCount: number) {
  const tx = {
    serviceLineBroadcast: { updateMany: vi.fn().mockResolvedValue({ count: updateCount }) },
    serviceLineBroadcastRecipient: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    serviceLineBroadcastAuditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  const db = {
    prisma: {
      $transaction: vi.fn((work: (value: typeof tx) => unknown) => Promise.resolve(work(tx))),
    },
  } as unknown as ServiceLineBroadcastDatabase;
  return { db, tx };
}

describe('service LINE broadcast completion', () => {
  it('does not overwrite a concurrent cancellation', async () => {
    const { db, tx } = database(0);

    await expect(
      completeServiceLineBroadcast({
        db,
        broadcast,
        processed: 1,
        failed: 0,
        completedAt,
      }),
    ).resolves.toBe(false);
    expect(tx.serviceLineBroadcastAuditLog.create).not.toHaveBeenCalled();
  });

  it('atomically exhausts pending recipients and records total attempt results', async () => {
    const { db, tx } = database(1);

    await expect(
      exhaustPendingServiceLineBroadcastRecipients({
        db,
        broadcast,
        category: 'RATE_LIMITED',
        completedAt,
        processedBefore: 3,
        failedBefore: 1,
      }),
    ).resolves.toBe(2);
    expect(tx.serviceLineBroadcastRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
        data: { status: 'FAILED', errorCategory: 'RATE_LIMITED' },
      }),
    );
    expect(tx.serviceLineBroadcastAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          afterData: { processed: 5, failed: 3, exhausted: true },
        }),
      }),
    );
  });
});
