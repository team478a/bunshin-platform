import { describe, expect, it, vi } from 'vitest';
import {
  ListUnknownAiUsageCosts,
  RepairUnknownAiUsageCosts,
  type AiUsageCostReconciliationRepository,
} from '../src';

const scope = {
  actorUserId: '11111111-1111-4111-8111-111111111111',
  environment: 'PRODUCTION' as const,
  provider: 'OPENAI' as const,
  now: new Date('2026-10-23T03:00:00Z'),
};

describe('AI usage cost reconciliation', () => {
  it('lists only the bounded current-month unknown-cost scope', async () => {
    const listUnknownCosts = vi.fn().mockResolvedValue([]);
    const repository = {
      listUnknownCosts,
      repairUnknownCosts: vi.fn(),
    } satisfies AiUsageCostReconciliationRepository;
    await new ListUnknownAiUsageCosts(repository).execute({ ...scope, limit: 2 });
    expect(listUnknownCosts).toHaveBeenCalledWith({
      ...scope,
      monthlyFrom: new Date('2026-10-01T00:00:00Z'),
      limit: 2,
    });
  });

  it('rejects guessed zero costs and duplicate event ids before the repository', async () => {
    const repository = {
      listUnknownCosts: vi.fn(),
      repairUnknownCosts: vi.fn(),
    } satisfies AiUsageCostReconciliationRepository;
    const useCase = new RepairUnknownAiUsageCosts(repository);
    const update = {
      usageEventId: '22222222-2222-4222-8222-222222222222',
      estimatedCostUsdMicros: 0,
      pricingVersion: 'provider-approved-v1',
    };
    await expect(
      useCase.execute({
        ...scope,
        reason: '証跡確認',
        evidenceReference: 'ticket:123',
        updates: [update],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      useCase.execute({
        ...scope,
        reason: '証跡確認',
        evidenceReference: 'ticket:123',
        updates: [
          { ...update, estimatedCostUsdMicros: 1 },
          { ...update, estimatedCostUsdMicros: 2 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.repairUnknownCosts).not.toHaveBeenCalled();
  });

  it('requires an evidence reference and returns an idempotent repair result', async () => {
    const repairUnknownCosts = vi.fn().mockResolvedValue({
      scanned: 1,
      updated: 1,
      alreadyReconciled: 0,
    });
    const repository = {
      listUnknownCosts: vi.fn(),
      repairUnknownCosts,
    } satisfies AiUsageCostReconciliationRepository;
    const result = await new RepairUnknownAiUsageCosts(repository).execute({
      ...scope,
      reason: '課金証跡を確認',
      evidenceReference: 'invoice:2026-10-openai',
      updates: [
        {
          usageEventId: '22222222-2222-4222-8222-222222222222',
          estimatedCostUsdMicros: 250,
          pricingVersion: 'provider-approved-v1',
        },
      ],
    });
    expect(result).toMatchObject({
      version: 'AI_USAGE_COST_RECONCILIATION_V1',
      updated: 1,
      alreadyReconciled: 0,
    });
    expect(repairUnknownCosts).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyFrom: new Date('2026-10-01T00:00:00Z') }),
    );
  });
});
