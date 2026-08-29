import { describe, expect, it, vi } from 'vitest';
import {
  RefundBadgeEntitlementUsage,
  TryConsumeBadgeEntitlement,
  type BadgeEntitlementConsumptionRepository,
} from '../src/badge-entitlement-consumption';

const repository = () => ({
  consume: vi.fn<BadgeEntitlementConsumptionRepository['consume']>(),
  findByResource: vi.fn<BadgeEntitlementConsumptionRepository['findByResource']>(),
  refund: vi.fn<BadgeEntitlementConsumptionRepository['refund']>(),
});

describe('badge entitlement consumption', () => {
  it('normalizes a purpose key and preserves the resource idempotency key', async () => {
    const repo = repository();
    repo.consume.mockResolvedValue(null);
    await new TryConsumeBadgeEntitlement(repo).execute({
      workspaceId: 'w',
      userId: 'u',
      featureKey: 'social.image_generation',
      resourceType: 'SOCIAL_IMAGE_REQUEST',
      resourceId: 'request',
      operationKey: 'social-image:request',
      estimatedCostUsdMicros: 50_000,
    });
    expect(repo.consume).toHaveBeenCalledWith(
      expect.objectContaining({
        featureKey: 'SOCIAL.IMAGE_GENERATION',
        operationKey: 'social-image:request',
      }),
    );
  });

  it('requires a reason when restoring an entitlement', async () => {
    const repo = repository();
    await expect(
      new RefundBadgeEntitlementUsage(repo).execute({
        workspaceId: 'w',
        userId: 'u',
        usageId: 'usage',
        reason: '',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.refund).not.toHaveBeenCalled();
  });
});
