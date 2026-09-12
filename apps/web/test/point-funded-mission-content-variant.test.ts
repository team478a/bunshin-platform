import { ApplicationError } from '@bunshin/shared';
import { describe, expect, it, vi } from 'vitest';
import type { PointRedemptionRepository } from '@bunshin/application';
import type { MissionContentVariant } from '@bunshin/capability-social';
import {
  MISSION_CONTENT_VARIANT_REDEMPTION_RESOURCE,
  executePointFundedMissionContentVariant,
  type PointFundedMissionContentVariantInput,
} from '../src/services/point-funded-mission-content-variant';

const input: PointFundedMissionContentVariantInput = {
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  bunshinId: 'bunshin-1',
  actorUserId: 'user-1',
  dailyMissionId: 'mission-1',
  generationIdempotencyKey: '00000000-0000-4000-8000-000000000001',
  usageIdempotencyPrefix: 'request-1',
  acceptedPointCost: 30,
};

const redemption = {
  id: 'redemption-1',
  workspaceId: input.workspaceId,
  userId: input.actorUserId,
  accountId: 'account-1',
  catalogItemId: 'catalog-1',
  consumptionTransactionId: 'consume-1',
  status: 'RESERVED' as const,
  pointCost: 30,
  idempotencyKey: `mission-content-variant:${input.generationIdempotencyKey}`,
  resourceType: MISSION_CONTENT_VARIANT_REDEMPTION_RESOURCE,
  resourceId: `${input.dailyMissionId}:${input.generationIdempotencyKey}`,
  reservedAt: new Date('2026-09-08T00:00:00Z'),
  reservationExpiresAt: new Date('2026-09-08T01:00:00Z'),
  confirmedAt: null,
  releasedAt: null,
  refundedAt: null,
  failureReason: null,
};

const variant: MissionContentVariant = {
  id: 'variant-1',
  workspaceId: input.workspaceId,
  bunshinId: input.bunshinId,
  dailyMissionId: input.dailyMissionId,
  actorUserId: input.actorUserId,
  sequence: 1,
  format: 'TEXT',
  content: { body: '別案です' },
  qualityScore: 90,
  model: 'test-model',
  promptVersion: 'test-v1',
  inputTokens: 10,
  outputTokens: 20,
  estimatedCostMicros: 1n,
  latencyMs: 10,
  createdAt: new Date('2026-09-08T00:00:10Z'),
  selectedAt: null,
};

function repository(): PointRedemptionRepository {
  return {
    listCatalog: vi.fn().mockResolvedValue([
      {
        id: 'catalog-1',
        rewardKey: 'ALTERNATIVE_PLAN_GENERATION',
        version: 1,
        rewardType: 'ALTERNATIVE_PLAN_GENERATION',
        title: '別の企画を1回作る',
        description: '別案を1回作れます',
        pointCost: 30,
      },
    ]),
    reserve: vi.fn().mockResolvedValue(redemption),
    findOwnedByResource: vi.fn().mockResolvedValue(redemption),
    transition: vi.fn().mockImplementation(({ targetStatus, reason }) =>
      Promise.resolve({
        ...redemption,
        status: targetStatus,
        failureReason: reason,
      }),
    ),
    releaseExpired: vi.fn().mockResolvedValue(0),
  };
}

describe('point funded mission content variant', () => {
  it('reserves the catalog price and confirms only after generation succeeds', async () => {
    const redemptions = repository();
    const generate = vi.fn().mockResolvedValue(variant);

    await expect(
      executePointFundedMissionContentVariant(input, { redemptions, generate }),
    ).resolves.toEqual(variant);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(redemptions.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        catalogItemId: 'catalog-1',
        expectedPointCost: 30,
        resourceType: MISSION_CONTENT_VARIANT_REDEMPTION_RESOURCE,
        resourceId: `${input.dailyMissionId}:${input.generationIdempotencyKey}`,
      }),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(redemptions.listCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'group-1' }),
    );
    expect(generate).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(redemptions.transition).toHaveBeenCalledWith(
      expect.objectContaining({ targetStatus: 'CONFIRMED' }),
    );
  });

  it('releases the reservation when generation fails', async () => {
    const redemptions = repository();
    const failure = new ApplicationError('CONTENT_REJECTED', 'unsafe candidate');

    await expect(
      executePointFundedMissionContentVariant(input, {
        redemptions,
        generate: vi.fn().mockRejectedValue(failure),
      }),
    ).rejects.toBe(failure);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(redemptions.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        targetStatus: 'RELEASED',
        reason: 'MISSION_CONTENT_VARIANT_GENERATION_FAILED',
      }),
    );
  });

  it('rejects a stale displayed price before reserving points', async () => {
    const redemptions = repository();
    await expect(
      executePointFundedMissionContentVariant(
        { ...input, acceptedPointCost: 50 },
        { redemptions, generate: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'variant point cost changed' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(redemptions.reserve).not.toHaveBeenCalled();
  });

  it('does not reuse a released reservation', async () => {
    const redemptions = repository();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(redemptions.reserve).mockResolvedValue({ ...redemption, status: 'RELEASED' });
    const generate = vi.fn();
    await expect(
      executePointFundedMissionContentVariant(input, { redemptions, generate }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('keeps a completed generation reserved when confirmation must be retried', async () => {
    const redemptions = repository();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(redemptions.transition).mockRejectedValue(new Error('database unavailable'));

    await expect(
      executePointFundedMissionContentVariant(input, {
        redemptions,
        generate: vi.fn().mockResolvedValue(variant),
      }),
    ).rejects.toThrow('database unavailable');

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(redemptions.transition).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(redemptions.transition).toHaveBeenCalledWith(
      expect.objectContaining({ targetStatus: 'CONFIRMED' }),
    );
  });
});
