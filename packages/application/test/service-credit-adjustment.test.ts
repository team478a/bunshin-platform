import { describe, expect, it } from 'vitest';
import {
  AdjustServiceCredits,
  type ServiceCreditAdjustmentRepository,
} from '../src/service-credit-adjustment';

const input = {
  workspaceId: 'workspace',
  groupId: 'service',
  membershipId: 'member',
  actorUserId: 'operator',
  amount: 2,
  reason: '初回付与',
  idempotencyKey: 'adjustment-key',
};

describe('AdjustServiceCredits', () => {
  it('normalizes the reason and delegates a valid adjustment', async () => {
    let received: Parameters<ServiceCreditAdjustmentRepository['adjust']>[0] | undefined;
    const repository: ServiceCreditAdjustmentRepository = {
      adjust: (value) => {
        received = value;
        return Promise.resolve({ availableCredits: 4 });
      },
    };
    const result = await new AdjustServiceCredits(
      repository,
      () => new Date('2026-09-01T00:00:00Z'),
    ).execute({
      ...input,
      reason: ' 初回付与 ',
    });
    expect(result).toEqual({ availableCredits: 4 });
    expect(received).toMatchObject({ reason: '初回付与', now: new Date('2026-09-01T00:00:00Z') });
  });

  it.each([0, 100_001, -100_001])('rejects an invalid amount: %s', async (amount) => {
    const repository: ServiceCreditAdjustmentRepository = {
      adjust: () => Promise.resolve({ availableCredits: 0 }),
    };
    await expect(
      new AdjustServiceCredits(repository).execute({ ...input, amount }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects a missing reason and short idempotency key', async () => {
    const repository: ServiceCreditAdjustmentRepository = {
      adjust: () => Promise.resolve({ availableCredits: 0 }),
    };
    await expect(
      new AdjustServiceCredits(repository).execute({ ...input, reason: ' ' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(
      new AdjustServiceCredits(repository).execute({ ...input, idempotencyKey: 'short' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
