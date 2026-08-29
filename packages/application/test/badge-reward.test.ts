import { describe, expect, it, vi } from 'vitest';
import {
  FulfillBadgeRewardEntitlement,
  QueueBadgeReward,
  type BadgeRewardRepository,
} from '../src/badge-reward';

const repository = () => {
  const queue = vi.fn<BadgeRewardRepository['queue']>();
  const fulfillEntitlement = vi.fn<BadgeRewardRepository['fulfillEntitlement']>();
  return {
    value: { queue, fulfillEntitlement } satisfies BadgeRewardRepository,
    queue,
    fulfillEntitlement,
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
});
