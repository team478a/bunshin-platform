import { describe, expect, it, vi } from 'vitest';
import {
  ConfirmPointRedemption,
  GetPointRedemptionByResource,
  ListPointRewardCatalog,
  RefundPointRedemption,
  ReleasePointRedemption,
  ReleaseExpiredPointReservations,
  ReservePointReward,
  type PointRedemptionRepository,
} from '../src/point-redemption';

const record = {
  id: 'redemption-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  accountId: 'account-1',
  catalogItemId: 'catalog-1',
  consumptionTransactionId: 'consume-1',
  status: 'RESERVED' as const,
  pointCost: 50,
  idempotencyKey: 'request-1',
  resourceType: null,
  resourceId: null,
  reservedAt: new Date('2026-08-29T00:00:00Z'),
  reservationExpiresAt: new Date('2026-08-29T00:15:00Z'),
  confirmedAt: null,
  releasedAt: null,
  refundedAt: null,
  failureReason: null,
};
const repository = (): PointRedemptionRepository => ({
  listCatalog: vi.fn().mockResolvedValue([
    {
      id: 'catalog-1',
      rewardKey: 'IMAGE',
      version: 1,
      rewardType: 'SOCIAL_IMAGE_GENERATION',
      title: '画像を1回作る',
      description: '投稿用画像',
      pointCost: 50,
    },
  ]),
  reserve: vi.fn().mockResolvedValue(record),
  findOwnedByResource: vi.fn().mockResolvedValue(record),
  transition: vi
    .fn()
    .mockImplementation(({ targetStatus }) => Promise.resolve({ ...record, status: targetStatus })),
  releaseExpired: vi.fn().mockResolvedValue(2),
});

describe('point redemption use cases', () => {
  it('lists the catalog through the verified actor scope', async () => {
    const port = repository();
    await expect(
      new ListPointRewardCatalog(port).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
      }),
    ).resolves.toHaveLength(1);
  });

  it('finds a redemption only through the owner resource scope', async () => {
    const port = repository();
    await expect(
      new GetPointRedemptionByResource(port).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        resourceType: 'SOCIAL_IMAGE_REQUEST',
        resourceId: 'request-1',
      }),
    ).resolves.toEqual(record);
  });

  it('reserves for a short bounded period and normalizes identifiers', async () => {
    const port = repository();
    await new ReservePointReward(port).execute({
      workspaceId: ' workspace-1 ',
      actorUserId: ' user-1 ',
      catalogItemId: ' catalog-1 ',
      idempotencyKey: ' request-1 ',
      now: record.reservedAt,
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(port.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        reservationExpiresAt: record.reservationExpiresAt,
      }),
    );
  });

  it('supports confirm, release and technical refund as separate transitions', async () => {
    const port = repository();
    for (const useCase of [
      new ConfirmPointRedemption(port),
      new ReleasePointRedemption(port),
      new RefundPointRedemption(port),
    ]) {
      await useCase.execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        redemptionId: 'redemption-1',
        reason: 'provider result',
      });
    }
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(port.transition).toHaveBeenCalledTimes(3);
  });

  it('requires a reason when points are returned', async () => {
    await expect(
      new ReleasePointRedemption(repository()).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        redemptionId: 'redemption-1',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('releases expired reservations in a bounded batch', async () => {
    const port = repository();
    await expect(
      new ReleaseExpiredPointReservations(port).execute({
        now: new Date('2026-08-29T01:00:00Z'),
        limit: 50,
      }),
    ).resolves.toBe(2);
  });

  it('fails closed when the repository rejects another user', async () => {
    const port = repository();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(port.reserve).mockResolvedValue(null);
    await expect(
      new ReservePointReward(port).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-2',
        catalogItemId: 'catalog-1',
        idempotencyKey: 'request-2',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
