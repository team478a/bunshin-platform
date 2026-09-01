import { describe, expect, it, vi } from 'vitest';
import {
  ConsumeServiceCreditForSocialImage,
  RefundServiceCreditForSocialImage,
  type ServiceCreditConsumptionRepository,
} from '../src';

const ids = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  groupMembershipId: '33333333-3333-4333-8333-333333333333',
  userId: '44444444-4444-4444-8444-444444444444',
  imageRequestId: '55555555-5555-4555-8555-555555555555',
};

describe('service credit consumption', () => {
  it('consumes one service-scoped credit with a request-specific idempotency key', async () => {
    const consumeForSocialImage = vi
      .fn()
      .mockResolvedValue({ status: 'CONSUMED', availableCredits: 2 });
    const repository = {
      consumeForSocialImage,
      refundSocialImage: vi.fn(),
    } as unknown as ServiceCreditConsumptionRepository;

    await expect(
      new ConsumeServiceCreditForSocialImage(repository).execute({
        ...ids,
        idempotencyKey: `social-image:${ids.imageRequestId}`,
      }),
    ).resolves.toEqual({ status: 'CONSUMED', availableCredits: 2 });
    expect(consumeForSocialImage).toHaveBeenCalledWith(
      expect.objectContaining({ ...ids, now: expect.any(Date) }),
    );
  });

  it('returns a credit only through the same service and membership scope', async () => {
    const refundSocialImage = vi.fn().mockResolvedValue(undefined);
    const repository = {
      consumeForSocialImage: vi.fn(),
      refundSocialImage,
    } as unknown as ServiceCreditConsumptionRepository;

    await new RefundServiceCreditForSocialImage(repository).execute({
      ...ids,
      idempotencyKey: `refund:social-image:${ids.imageRequestId}`,
    });
    expect(refundSocialImage).toHaveBeenCalledWith(
      expect.objectContaining({ ...ids, now: expect.any(Date) }),
    );
  });
});
