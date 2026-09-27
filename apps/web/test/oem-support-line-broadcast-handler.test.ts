import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  broadcast: vi.fn(),
  policy: vi.fn(),
  recipients: vi.fn(),
  sharedConfiguration: vi.fn(),
  pendingCount: vi.fn(),
  revalidate: vi.fn(),
  resolveIds: vi.fn(),
  deliver: vi.fn(),
  complete: vi.fn(),
  completeDisabled: vi.fn(),
  exhaust: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../src/line/secure-configuration', () => ({
  currentLineEnvironment: () => 'PRODUCTION',
}));
vi.mock('../src/jobs/oem-support-line-delivery-eligibility', () => ({
  revalidateOemSupportLineRecipients: state.revalidate,
}));
vi.mock('../src/jobs/service-line-broadcast-eligibility', () => ({
  resolveServiceLineBroadcastRecipientIds: state.resolveIds,
}));
vi.mock('../src/jobs/service-line-broadcast-recipient-delivery', () => ({
  deliverServiceLineBroadcastRecipients: state.deliver,
}));
vi.mock('../src/jobs/service-line-broadcast-completion', () => ({
  completeServiceLineBroadcast: state.complete,
  completeDisabledServiceLineBroadcast: state.completeDisabled,
  exhaustPendingServiceLineBroadcastRecipients: state.exhaust,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    serviceLineBroadcast: { findFirst: state.broadcast },
    groupLineRoutingPolicy: { findUnique: state.policy },
    serviceLineBroadcastRecipient: {
      findMany: state.recipients,
      count: state.pendingCount,
    },
    lineChannelConfiguration: { findFirst: state.sharedConfiguration },
    groupLineChannelConfiguration: { findFirst: vi.fn() },
  },
}));

const { createServiceLineBroadcastJobHandler } =
  await import('../src/jobs/service-line-broadcast-job-handler');

const broadcast = {
  id: 'broadcast-1',
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  status: 'SCHEDULED',
  updatedByUserId: 'manager-1',
  message: '支援候補があります',
  segmentCriteria: { kind: 'OEM_SUPPORT_CANDIDATE', candidateId: 'candidate-1' },
};
const recipients = [
  {
    id: 'recipient-1',
    groupMembershipId: 'membership-1',
    userId: 'manager-1',
    message: null,
  },
];
const job = {
  workspaceId: 'workspace-1',
  attemptCount: 1,
  maxAttempts: 3,
};

describe('OEM support LINE broadcast handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.broadcast.mockResolvedValue(broadcast);
    state.policy.mockResolvedValue({ mode: 'SHARED', pilotEnabled: false });
    state.recipients.mockResolvedValue(recipients);
    state.sharedConfiguration.mockResolvedValue({
      id: 'line-configuration-1',
      encryptedAccessToken: 'encrypted',
    });
    state.resolveIds.mockResolvedValue(new Map([['recipient-1', 'line-user-1']]));
    state.deliver.mockResolvedValue({ processed: 1, failed: 0, lastRetryableCategory: null });
    state.pendingCount.mockResolvedValue(0);
    state.complete.mockResolvedValue(true);
  });

  it('配信直前に全員が資格を失った場合はProvider設定を読まず正常終了する', async () => {
    state.revalidate.mockResolvedValue({ applies: true, recipients: [], skipped: 1 });

    await expect(
      createServiceLineBroadcastJobHandler().execute({ job, broadcastId: 'broadcast-1' } as never),
    ).resolves.toEqual({ retryable: false });

    expect(state.sharedConfiguration).not.toHaveBeenCalled();
    expect(state.deliver).not.toHaveBeenCalled();
    expect(state.complete).toHaveBeenCalledWith(
      expect.objectContaining({ processed: 1, failed: 0 }),
    );
  });

  it('有効な宛先だけを既存LINE配送へ渡して完了数を記録する', async () => {
    state.revalidate.mockResolvedValue({ applies: true, recipients, skipped: 0 });

    await expect(
      createServiceLineBroadcastJobHandler().execute({ job, broadcastId: 'broadcast-1' } as never),
    ).resolves.toEqual({ retryable: false });

    expect(state.resolveIds).toHaveBeenCalledWith(expect.objectContaining({ recipients }));
    expect(state.deliver).toHaveBeenCalledWith(expect.objectContaining({ recipients }));
    expect(state.complete).toHaveBeenCalledWith(
      expect.objectContaining({ processed: 1, failed: 0 }),
    );
  });
});
