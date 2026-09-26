import { describe, expect, it, vi } from 'vitest';
import type { ServiceLineBroadcastOperationsRepository } from '../src/service-line-broadcast-operations';
import { ServiceLineBroadcastOperationsService } from '../src/service-line-broadcast-operations';

const scope = {
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  actorUserId: 'user-1',
  environment: 'PRODUCTION' as const,
};
const now = new Date('2026-09-26T03:30:00.000Z');

function repository(
  overrides: Partial<ServiceLineBroadcastOperationsRepository> = {},
): ServiceLineBroadcastOperationsRepository {
  return {
    list: vi.fn().mockResolvedValue({ broadcasts: [], industries: [] }),
    retry: vi.fn().mockResolvedValue({
      kind: 'SCHEDULED',
      broadcastId: 'broadcast-1',
      recipientCount: 2,
      scheduledAt: now,
    }),
    cancel: vi.fn().mockResolvedValue({
      kind: 'CANCELLED',
      broadcastId: 'broadcast-1',
      cancelledAt: now,
    }),
    ...overrides,
  };
}

describe('ServiceLineBroadcastOperationsService', () => {
  it('uses bounded list and export queries and creates a spreadsheet-safe CSV', async () => {
    const list = vi.fn().mockResolvedValue({
      industries: [{ id: 'industry-1', name: '小売' }],
      broadcasts: [
        {
          id: 'broadcast-1',
          title: '=danger,"quoted"',
          message: '本文',
          status: 'COMPLETED',
          scheduledAt: now,
          createdAt: now,
          completedAt: now,
          segment: {},
          recipientCounts: { SENT: 2, FAILED: 1 },
          recoveryAttempts: 1,
        },
      ],
    });
    const service = new ServiceLineBroadcastOperationsService(repository({ list }), () => now);

    await expect(service.list(scope)).resolves.toMatchObject({ industries: [{ name: '小売' }] });
    const csv = await service.exportCsv(scope);

    expect(list).toHaveBeenNthCalledWith(1, { ...scope, limit: 30, includeIndustries: true });
    expect(list).toHaveBeenNthCalledWith(2, { ...scope, limit: 5_000, includeIndustries: false });
    expect(csv).toContain('"\'=danger,""quoted"""');
    expect(csv).toContain(',"2","1","0","0"');
    expect(csv).toContain('"NEEDS_ATTENTION","33.3","1"');
  });

  it('identifies stalled broadcasts and aggregates operational health', async () => {
    const scheduledAt = new Date(now.getTime() - 16 * 60 * 1_000);
    const service = new ServiceLineBroadcastOperationsService(
      repository({
        list: vi.fn().mockResolvedValue({
          industries: [],
          broadcasts: [
            {
              id: 'broadcast-1',
              title: '停滞中',
              message: '本文',
              status: 'SCHEDULED',
              scheduledAt,
              createdAt: scheduledAt,
              completedAt: null,
              segment: {},
              recipientCounts: { PENDING: 2, SENT: 3, FAILED: 1 },
              recoveryAttempts: 1,
            },
          ],
        }),
      }),
      () => now,
    );

    await expect(service.list(scope)).resolves.toMatchObject({
      broadcasts: [{ operationalStatus: 'STALLED', failureRate: 25, totalRecipients: 6 }],
      health: {
        stalledBroadcasts: 1,
        broadcastsWithFailures: 1,
        deliveredRecipients: 3,
        failedRecipients: 1,
        recoveryAttempts: 1,
        failureRate: 25,
      },
    });
  });

  it('fails closed when list access is denied', async () => {
    const service = new ServiceLineBroadcastOperationsService(
      repository({ list: vi.fn().mockResolvedValue(null) }),
    );
    await expect(service.list(scope)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('normalizes retry reason and uses one server-owned timestamp', async () => {
    const retry = vi.fn().mockResolvedValue({
      kind: 'SCHEDULED',
      broadcastId: 'broadcast-1',
      recipientCount: 2,
      scheduledAt: now,
    });
    const service = new ServiceLineBroadcastOperationsService(repository({ retry }), () => now);

    await service.retry({
      ...scope,
      environment: 'PRODUCTION',
      broadcastId: 'broadcast-1',
      reason: '  operator retry  ',
    });

    expect(retry).toHaveBeenCalledWith({
      ...scope,
      environment: 'PRODUCTION',
      broadcastId: 'broadcast-1',
      reason: 'operator retry',
      scheduledAt: now,
    });
  });

  it.each([
    ['ACCESS_DENIED', 'FORBIDDEN'],
    ['CANNOT_RETRY', 'CONFLICT'],
    ['NO_FAILED_RECIPIENTS', 'CONFLICT'],
  ] as const)('maps retry outcome %s to %s', async (kind, code) => {
    const service = new ServiceLineBroadcastOperationsService(
      repository({ retry: vi.fn().mockResolvedValue({ kind }) }),
      () => now,
    );
    await expect(
      service.retry({
        ...scope,
        environment: 'PRODUCTION',
        broadcastId: 'broadcast-1',
        reason: 'retry',
      }),
    ).rejects.toMatchObject({ code });
  });

  it('cancels with a normalized reason and maps denied access', async () => {
    const cancel = vi.fn().mockResolvedValue({ kind: 'ACCESS_DENIED' });
    const service = new ServiceLineBroadcastOperationsService(repository({ cancel }), () => now);
    await expect(
      service.cancel({
        ...scope,
        environment: 'PRODUCTION',
        broadcastId: 'broadcast-1',
        reason: ' cancel ',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(cancel).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'cancel', cancelledAt: now }),
    );
  });
});
