import { describe, expect, it, vi } from 'vitest';
import {
  FulfillBadgeRewardEntitlement,
  QueueBadgeReward,
  RunBadgeRewardWorkerBatch,
  type BadgeRewardRepository,
} from '../src/badge-reward';

const repository = () => {
  const queue = vi.fn<BadgeRewardRepository['queue']>();
  const fulfillEntitlement = vi.fn<BadgeRewardRepository['fulfillEntitlement']>();
  const claimNext = vi.fn<BadgeRewardRepository['claimNext']>();
  const fail = vi.fn<BadgeRewardRepository['fail']>();
  return {
    value: { queue, fulfillEntitlement, claimNext, fail } satisfies BadgeRewardRepository,
    queue,
    fulfillEntitlement,
    claimNext,
    fail,
  };
};

describe('badge reward application', () => {
  it('normalizes and queues a purpose-limited entitlement', async () => {
    const repo = repository();
    repo.queue.mockResolvedValue({
      rewardLinkId: 'link',
      outboxId: 'outbox',
      status: 'PENDING',
      alreadyQueued: false,
    });
    await new QueueBadgeReward(repo.value).execute({
      workspaceId: 'w',
      userId: 'u',
      badgeAwardId: 'a',
      policy: {
        type: 'ENTITLEMENT',
        featureKey: 'social.image_generation',
        quantity: 1,
        expiresInDays: 28,
        maxUnitCostUsdMicros: 50_000,
        revocationPolicy: 'REVOKE_UNUSED',
      },
    });
    expect(repo.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: expect.objectContaining({ featureKey: 'SOCIAL.IMAGE_GENERATION' }),
      }),
    );
  });

  it('rejects unbounded quantities before persistence', async () => {
    const repo = repository();
    await expect(
      new QueueBadgeReward(repo.value).execute({
        workspaceId: 'w',
        userId: 'u',
        badgeAwardId: 'a',
        policy: {
          type: 'ENTITLEMENT',
          featureKey: 'SOCIAL.IMAGE_GENERATION',
          quantity: 101,
          expiresInDays: null,
          maxUnitCostUsdMicros: 0,
          revocationPolicy: 'REVOKE_UNUSED',
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.queue).not.toHaveBeenCalled();
  });

  it('does not treat fulfillment as badge award creation', async () => {
    const repo = repository();
    repo.fulfillEntitlement.mockResolvedValue({
      id: 'e',
      workspaceId: 'w',
      userId: 'u',
      badgeAwardId: 'a',
      rewardLinkId: 'l',
      featureKey: 'SOCIAL.IMAGE_GENERATION',
      quantityGranted: 1,
      quantityRemaining: 1,
      status: 'ACTIVE',
      expiresAt: null,
    });
    await expect(
      new FulfillBadgeRewardEntitlement(repo.value).execute({
        workspaceId: 'w',
        userId: 'u',
        rewardLinkId: 'l',
        outboxId: 'o',
      }),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('fulfills claimed rewards and drains the outbox', async () => {
    const repo = repository();
    repo.claimNext
      .mockResolvedValueOnce({
        outboxId: 'o',
        rewardLinkId: 'l',
        workspaceId: 'w',
        userId: 'u',
        attemptCount: 1,
        maxAttempts: 5,
      })
      .mockResolvedValueOnce(null);
    repo.fulfillEntitlement.mockResolvedValue({
      id: 'e',
      workspaceId: 'w',
      userId: 'u',
      badgeAwardId: 'a',
      rewardLinkId: 'l',
      featureKey: 'SOCIAL.IMAGE_GENERATION',
      quantityGranted: 1,
      quantityRemaining: 1,
      status: 'ACTIVE',
      expiresAt: null,
    });
    await expect(
      new RunBadgeRewardWorkerBatch(repo.value).execute({ workerId: 'worker-1' }),
    ).resolves.toEqual({
      claimed: 1,
      completed: 1,
      retryScheduled: 0,
      dead: 0,
      infrastructureFailures: 0,
      drained: true,
    });
  });

  it('schedules a safe retry without exposing the thrown message', async () => {
    const repo = repository();
    repo.claimNext
      .mockResolvedValueOnce({
        outboxId: 'o',
        rewardLinkId: 'l',
        workspaceId: 'w',
        userId: 'u',
        attemptCount: 1,
        maxAttempts: 5,
      })
      .mockResolvedValueOnce(null);
    repo.fulfillEntitlement.mockRejectedValue(new Error('secret provider response'));
    repo.fail.mockResolvedValue('RETRY');
    const now = new Date('2026-08-29T00:00:00Z');
    await expect(
      new RunBadgeRewardWorkerBatch(repo.value, () => now).execute({ workerId: 'worker-1' }),
    ).resolves.toMatchObject({ retryScheduled: 1 });
    expect(repo.fail).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'BADGE_REWARD_FULFILLMENT_FAILED' }),
    );
  });

  it('counts exhausted work as dead without revoking its badge', async () => {
    const repo = repository();
    repo.claimNext
      .mockResolvedValueOnce({
        outboxId: 'o',
        rewardLinkId: 'l',
        workspaceId: 'w',
        userId: 'u',
        attemptCount: 5,
        maxAttempts: 5,
      })
      .mockResolvedValueOnce(null);
    repo.fulfillEntitlement.mockRejectedValue(new Error('failed'));
    repo.fail.mockResolvedValue('DEAD');
    await expect(
      new RunBadgeRewardWorkerBatch(repo.value).execute({ workerId: 'worker-1' }),
    ).resolves.toMatchObject({ dead: 1, completed: 0 });
  });
});
