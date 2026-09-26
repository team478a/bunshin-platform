import { describe, expect, it, vi } from 'vitest';
import { deliverServiceLineBroadcastRecipients } from '../src/jobs/service-line-broadcast-recipient-delivery';
import type { ServiceLineBroadcastBatch } from '../src/jobs/service-line-broadcast-delivery-types';

const recipient = {
  id: '11111111-1111-4111-8111-111111111111',
  groupMembershipId: 'membership-1',
  userId: 'user-1',
  message: '個別本文',
};

function batch(updateMany: ReturnType<typeof vi.fn>): ServiceLineBroadcastBatch {
  return {
    db: { prisma: { serviceLineBroadcastRecipient: { updateMany } } },
    job: {},
    broadcast: {
      id: 'broadcast-1',
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      message: '共通本文',
      segmentCriteria: {},
      updatedByUserId: 'user-1',
    },
    configuration: { id: 'configuration-1', encryptedAccessToken: 'encrypted' },
    recipients: [recipient],
    recipientIds: new Map([[recipient.groupMembershipId, 'line-user-1']]),
  } as unknown as ServiceLineBroadcastBatch;
}

describe('service LINE broadcast recipient delivery', () => {
  it('keeps a retryable provider failure pending and uses a stable LINE retry key', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const pushText = vi.fn().mockResolvedValue({
      ok: false,
      category: 'RATE_LIMITED',
      retryable: true,
    });

    const result = await deliverServiceLineBroadcastRecipients(batch(updateMany), {
      provider: { pushText },
      decrypt: () => 'token',
    });

    expect(result).toEqual({
      processed: 0,
      failed: 0,
      retryableFailures: 1,
      lastRetryableCategory: 'RATE_LIMITED',
    });
    expect(pushText).toHaveBeenCalledWith(
      expect.objectContaining({ retryKey: recipient.id, text: recipient.message }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
        data: { errorCategory: 'RATE_LIMITED' },
      }),
    );
  });

  it('marks a non-retryable provider failure as failed', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const result = await deliverServiceLineBroadcastRecipients(batch(updateMany), {
      provider: {
        pushText: vi.fn().mockResolvedValue({
          ok: false,
          category: 'INVALID_RECIPIENT',
          retryable: false,
        }),
      },
      decrypt: () => 'token',
    });

    expect(result.failed).toBe(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'FAILED', errorCategory: 'INVALID_RECIPIENT' },
      }),
    );
  });
});
