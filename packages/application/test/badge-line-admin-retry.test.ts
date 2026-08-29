import { describe, expect, it, vi } from 'vitest';
import { RequestBadgeLineDeliveryRetry, type BadgeLineDeliveryRetryRepository } from '../src';

const valid = {
  requestId: '11111111-1111-4111-8111-111111111111',
  actorUserId: 'admin-1',
  environment: 'PRODUCTION' as const,
  deliveryId: '22222222-2222-4222-8222-222222222222',
  reason: '障害復旧後の再送',
};

describe('RequestBadgeLineDeliveryRetry', () => {
  it('trims the reason and records one retry request', async () => {
    const request = vi.fn().mockResolvedValue({
      id: valid.requestId,
      deliveryId: valid.deliveryId,
      jobId: 'job-1',
      createdAt: new Date(),
    });
    await new RequestBadgeLineDeliveryRetry({
      request,
    } satisfies BadgeLineDeliveryRetryRepository).execute({
      ...valid,
      reason: `  ${valid.reason}  `,
    });
    expect(request).toHaveBeenCalledWith({ ...valid, reason: valid.reason });
  });

  it('rejects an invalid reason before repository access', async () => {
    const request = vi.fn();
    await expect(
      new RequestBadgeLineDeliveryRetry({
        request,
      } satisfies BadgeLineDeliveryRetryRepository).execute({ ...valid, reason: 'x' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(request).not.toHaveBeenCalled();
  });
});
