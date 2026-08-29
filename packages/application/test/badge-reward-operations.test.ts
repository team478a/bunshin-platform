import { describe, expect, it, vi } from 'vitest';
import {
  FulfillBadgeRewardManually,
  InspectBadgeRewardOperations,
  RetryBadgeRewardOperation,
  type BadgeRewardOperationsRepository,
} from '../src/badge-reward-operations';

const repository = () => ({
  inspect: vi.fn<BadgeRewardOperationsRepository['inspect']>(),
  retry: vi.fn<BadgeRewardOperationsRepository['retry']>(),
  fulfillManually: vi.fn<BadgeRewardOperationsRepository['fulfillManually']>(),
});

describe('badge reward operations', () => {
  it('caps operational inspection', () => {
    const repo = repository();
    expect(() => new InspectBadgeRewardOperations(repo).execute({ limit: 201 })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('requires an auditable reason for retry', async () => {
    const repo = repository();
    await expect(
      new RetryBadgeRewardOperation(repo).execute({
        workspaceId: 'w',
        rewardLinkId: 'r',
        actorUserId: 'u',
        reason: '',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.retry).not.toHaveBeenCalled();
  });

  it('passes the exact workspace boundary to manual fulfillment', async () => {
    const repo = repository();
    repo.fulfillManually.mockResolvedValue({} as never);
    await new FulfillBadgeRewardManually(repo).execute({
      workspaceId: 'workspace-a',
      rewardLinkId: 'reward-a',
      actorUserId: 'admin',
      reason: '企業契約に基づく手動付与',
    });
    expect(repo.fulfillManually).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'workspace-a', rewardLinkId: 'reward-a' }),
    );
  });
});
