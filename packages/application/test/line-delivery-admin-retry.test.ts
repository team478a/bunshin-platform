import { describe, expect, it, vi } from 'vitest';
import { RequestLineDeliveryRetry, type LineDeliveryRetryRepository } from '../src';

const valid = {
  requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  actorUserId: 'admin-a',
  environment: 'STAGING' as const,
  deliveryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  reason: ' provider復旧後の確認 ',
};

describe('RequestLineDeliveryRetry', () => {
  it('理由を正規化して同一環境のrepositoryへ渡す', async () => {
    const request = vi.fn().mockResolvedValue({
      id: valid.requestId,
      environment: 'STAGING',
      deliveryId: valid.deliveryId,
      deliveryAttemptCount: 2,
      reason: 'provider復旧後の確認',
      jobId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: new Date('2026-08-22T00:00:00Z'),
    });
    const value = await new RequestLineDeliveryRetry({
      request,
    } satisfies LineDeliveryRetryRepository).execute(valid);
    expect(value.deliveryAttemptCount).toBe(2);
    expect(request).toHaveBeenCalledWith({ ...valid, reason: 'provider復旧後の確認' });
  });

  it.each(['', 'ab', 'x'.repeat(501)])('不正な理由を拒否する', async (reason) => {
    const request = vi.fn();
    await expect(
      new RequestLineDeliveryRetry({ request } satisfies LineDeliveryRetryRepository).execute({
        ...valid,
        reason,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(request).not.toHaveBeenCalled();
  });

  it('権限・環境・対象不一致をNOT_FOUNDとして秘匿する', async () => {
    const request = vi.fn().mockResolvedValue(null);
    await expect(
      new RequestLineDeliveryRetry({ request } satisfies LineDeliveryRetryRepository).execute(
        valid,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
